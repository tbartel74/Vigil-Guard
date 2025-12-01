// Plugin Configuration Database Operations
// Manages browser extension settings stored in SQLite
//
// TOKEN ARCHITECTURE (v2.0):
// - Bootstrap Token: One-time token for plugin to fetch webhook credentials
//   - Used ONLY to connect to backend and retrieve webhook token
//   - Short-lived (configurable, default 24h after generation)
//   - Auto-rotated after successful use
// - Webhook Token: Long-lived token for n8n webhook authentication
//   - Used for all webhook requests
//   - Persists until manually regenerated

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { parseFile } from './fileOps.js';

// Token file paths (persisted in mounted config volume)
const TOKEN_FILE = '/config/.webhook-token';
const BOOTSTRAP_TOKEN_FILE = '/config/.bootstrap-token';
const BOOTSTRAP_TOKEN_META_FILE = '/config/.bootstrap-token-meta.json';

// Bootstrap token configuration
const BOOTSTRAP_TOKEN_LENGTH = 32;
const BOOTSTRAP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BOOTSTRAP_TOKEN_MAX_USES = 1; // One-time use by default

/**
 * Get webhook auth token from file
 * Token is stored in /config/.webhook-token (mounted volume)
 * Auto-generates token on first access if file doesn't exist
 *
 * @throws {Error} If token cannot be read or created
 */
function getWebhookToken(): string {
  // Auto-generate token if file doesn't exist
  if (!existsSync(TOKEN_FILE)) {
    try {
      const newToken = randomBytes(24).toString('base64').replace(/[/+=]/g, '').slice(0, 32);
      writeFileSync(TOKEN_FILE, newToken, 'utf8');
      console.log('[Plugin Config] Auto-generated initial webhook token');
      return newToken;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      console.error('[Plugin Config] CRITICAL: Failed to auto-generate token file:', {
        code: err.code,
        message: err.message,
        path: TOKEN_FILE
      });
      throw new Error(
        `Failed to create webhook token file: ${err.code === 'EACCES' ? 'Permission denied' : err.message}. ` +
        `Check that ${TOKEN_FILE} is writable.`
      );
    }
  }

  try {
    const token = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (!token) {
      throw new Error('Webhook token file is empty');
    }
    return token;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error('[Plugin Config] CRITICAL: Failed to read token file:', {
      code: err.code,
      message: err.message,
      path: TOKEN_FILE
    });
    throw new Error(
      `Failed to read webhook token: ${err.code === 'ENOENT' ? 'File not found' : err.message}. ` +
      `Check that ${TOKEN_FILE} exists and is readable.`
    );
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '../data/vigil.db');

export interface PluginConfig {
  webhookUrl: string;
  guiUrl: string;
  enabled: boolean;
  version?: string;
  updatedAt?: string;
  updatedBy?: string;
  webhookAuthToken?: string;
  webhookAuthHeader?: string;
}

/**
 * Read external domain from unified_config.json
 * Defaults to 'localhost' if not configured
 */
export async function getExternalDomain(): Promise<string> {
  try {
    const unifiedConfig = await parseFile('unified_config.json');
    const domain = unifiedConfig.parsed?.network?.external_domain;
    return domain || 'localhost';
  } catch (error) {
    console.warn('[Plugin Config] Failed to read external domain from unified_config.json, using default:', error);
    return 'localhost';
  }
}

/**
 * Generate dynamic webhook URL based on external domain configuration
 */
async function generateWebhookUrl(): Promise<string> {
  const domain = await getExternalDomain();
  return `http://${domain}:5678/webhook/vigil-guard-2`;
}

/**
 * Initialize plugin_settings table
 * Creates table and inserts default configuration if empty
 */
export function initPluginConfigTable(): void {
  const db = new Database(DB_PATH);

  try {
    // Create table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_settings (
        id INTEGER PRIMARY KEY,
        webhook_url TEXT NOT NULL,
        gui_url TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        updated_at TEXT,
        updated_by TEXT
      )
    `);

    // Check if table is empty
    const count = db.prepare('SELECT COUNT(*) as cnt FROM plugin_settings').get() as { cnt: number };

    // Insert default configuration if empty
    if (count.cnt === 0) {
      db.prepare(`
        INSERT INTO plugin_settings (id, webhook_url, gui_url, enabled, updated_at, updated_by)
        VALUES (1, ?, ?, 1, datetime('now'), 'system')
      `).run(
        'http://localhost:80/ui/api/browser-filter',  // Default webhook (Caddy proxy)
        'http://localhost:80/ui'                      // Default GUI URL
      );

      console.log('[Plugin Config] Default configuration initialized');
    }
  } catch (error) {
    console.error('[Plugin Config] Failed to initialize table:', error);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Get current plugin configuration
 * Used by both public API (plugin) and protected API (admin UI)
 *
 * URL Priority:
 * 1. If webhook_url in DB is set (non-default), use it
 * 2. Otherwise, generate dynamically from unified_config.json network.external_domain
 */
export async function getPluginConfig(): Promise<PluginConfig> {
  const db = new Database(DB_PATH);

  try {
    const row = db.prepare('SELECT * FROM plugin_settings WHERE id = 1').get() as any;

    if (!row) {
      throw new Error('Plugin configuration not found');
    }

    // Use webhook_url from DB if explicitly set, otherwise generate from unified_config
    // Default value check: if DB contains default localhost URL, prefer dynamic generation
    const defaultWebhookUrl = 'http://localhost:80/ui/api/browser-filter';
    const isDefaultUrl = row.webhook_url === defaultWebhookUrl;
    const webhookUrl = isDefaultUrl
      ? await generateWebhookUrl()
      : row.webhook_url;

    return {
      webhookUrl,
      guiUrl: row.gui_url,
      enabled: Boolean(row.enabled),
      version: '1.4.0',  // Current Vigil Guard version
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      webhookAuthToken: getWebhookToken(),
      webhookAuthHeader: process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-Vigil-Auth'
    };
  } catch (error) {
    console.error('[Plugin Config] Failed to fetch config:', error);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Save plugin configuration
 * Only accessible by authenticated admin users
 */
export async function savePluginConfig(config: Partial<PluginConfig>, username: string): Promise<void> {
  const db = new Database(DB_PATH);

  try {
    // Validate inputs
    if (config.webhookUrl && !isValidUrl(config.webhookUrl)) {
      throw new Error('Invalid webhook URL format');
    }

    if (config.guiUrl && !isValidUrl(config.guiUrl)) {
      throw new Error('Invalid GUI URL format');
    }

    // Update configuration
    db.prepare(`
      UPDATE plugin_settings
      SET webhook_url = COALESCE(?, webhook_url),
          gui_url = COALESCE(?, gui_url),
          enabled = COALESCE(?, enabled),
          updated_at = datetime('now'),
          updated_by = ?
      WHERE id = 1
    `).run(
      config.webhookUrl || null,
      config.guiUrl || null,
      config.enabled !== undefined ? (config.enabled ? 1 : 0) : null,
      username
    );

    console.log(`[Plugin Config] Configuration updated by ${username}`);
  } catch (error) {
    console.error('[Plugin Config] Failed to save config:', error);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Validate URL format with security checks
 * Blocks dangerous characters that could enable injection attacks
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Protocol check
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    // Hostname must exist
    if (!url.hostname || url.hostname.length === 0) {
      return false;
    }

    // Block dangerous characters that could enable injection attacks
    // These characters could break out of string contexts in generated JavaScript
    const dangerous = /[<>'"` \n\r\t]/;
    if (dangerous.test(urlString)) {
      console.warn('[Plugin Config] URL contains dangerous characters:', urlString);
      return false;
    }

    // Prevent protocol smuggling
    if (urlString.includes('javascript:') || urlString.includes('data:')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// BOOTSTRAP TOKEN MANAGEMENT (v2.0)
// =============================================================================

export interface BootstrapTokenInfo {
  token: string;
  createdAt: string;
  expiresAt: string;
  usedCount: number;
  maxUses: number;
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'not_configured' | 'error' | 'exhausted';
  error?: string;
  errorCode?: 'FILE_READ_ERROR' | 'PARSE_ERROR' | 'PERMISSION_DENIED';
}

/**
 * Generate a new bootstrap token
 * Creates a cryptographically secure token for plugin initial configuration
 */
export function generateBootstrapToken(): { token: string; expiresAt: string } {
  const token = randomBytes(BOOTSTRAP_TOKEN_LENGTH).toString('base64url').slice(0, BOOTSTRAP_TOKEN_LENGTH);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + BOOTSTRAP_TOKEN_TTL_MS).toISOString();

  // Store token (hashed for security)
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const metadata = {
    tokenHash,
    createdAt,
    expiresAt,
    usedCount: 0,
    maxUses: BOOTSTRAP_TOKEN_MAX_USES,
    lastUsedAt: null
  };

  try {
    writeFileSync(BOOTSTRAP_TOKEN_FILE, tokenHash, 'utf8');
    writeFileSync(BOOTSTRAP_TOKEN_META_FILE, JSON.stringify(metadata, null, 2), 'utf8');
    console.log('[Bootstrap Token] New token generated, expires:', expiresAt);
  } catch (error) {
    console.error('[Bootstrap Token] Failed to save token:', error);
    throw new Error('Failed to generate bootstrap token');
  }

  return { token, expiresAt };
}

/**
 * Get bootstrap token status (without exposing the actual token)
 * Returns 'error' status with details if files are corrupted or unreadable
 */
export function getBootstrapTokenStatus(): BootstrapTokenInfo {
  if (!existsSync(BOOTSTRAP_TOKEN_FILE) || !existsSync(BOOTSTRAP_TOKEN_META_FILE)) {
    return {
      token: '',
      createdAt: '',
      expiresAt: '',
      usedCount: 0,
      maxUses: 0,
      lastUsedAt: null,
      status: 'not_configured'
    };
  }

  // Read metadata file
  let metaContent: string;
  try {
    metaContent = readFileSync(BOOTSTRAP_TOKEN_META_FILE, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error('[Bootstrap Token] Failed to read status file:', {
      code: err.code,
      message: err.message
    });
    return {
      token: '',
      createdAt: '',
      expiresAt: '',
      usedCount: 0,
      maxUses: 0,
      lastUsedAt: null,
      status: 'error',
      error: `Cannot read bootstrap token metadata: ${err.code === 'EACCES' ? 'Permission denied' : err.message}`,
      errorCode: err.code === 'EACCES' ? 'PERMISSION_DENIED' : 'FILE_READ_ERROR'
    };
  }

  // Parse metadata JSON
  let metadata: {
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
    usedCount?: number;
    maxUses?: number;
    lastUsedAt?: string | null;
  };
  try {
    metadata = JSON.parse(metaContent);

    // Validate required fields
    if (!metadata.tokenHash || !metadata.expiresAt) {
      throw new Error('Missing required fields (tokenHash or expiresAt)');
    }
  } catch (error) {
    const err = error as Error;
    console.error('[Bootstrap Token] Metadata parse error:', {
      message: err.message
    });

    if (err instanceof SyntaxError) {
      return {
        token: '',
        createdAt: '',
        expiresAt: '',
        usedCount: 0,
        maxUses: 0,
        lastUsedAt: null,
        status: 'error',
        error: `Bootstrap token metadata is corrupted (invalid JSON). Delete ${BOOTSTRAP_TOKEN_META_FILE} and regenerate.`,
        errorCode: 'PARSE_ERROR'
      };
    }

    return {
      token: '',
      createdAt: '',
      expiresAt: '',
      usedCount: 0,
      maxUses: 0,
      lastUsedAt: null,
      status: 'error',
      error: `Invalid metadata: ${err.message}`,
      errorCode: 'PARSE_ERROR'
    };
  }

  const now = new Date();
  const expiresAt = new Date(metadata.expiresAt);
  const isExpired = now > expiresAt;
  const usedCount = metadata.usedCount || 0;
  const maxUses = metadata.maxUses ?? BOOTSTRAP_TOKEN_MAX_USES;
  const isExhausted = usedCount >= maxUses;

  // Determine status: exhausted takes precedence over expired
  let status: 'active' | 'expired' | 'exhausted' = 'active';
  if (isExhausted) {
    status = 'exhausted';
  } else if (isExpired) {
    status = 'expired';
  }

  return {
    token: '********' + metadata.tokenHash.slice(-4), // Masked, show last 4 chars of hash
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    usedCount,
    maxUses,
    lastUsedAt: metadata.lastUsedAt || null,
    status
  };
}

/**
 * Validate a bootstrap token and return webhook credentials if valid
 * This is the ONLY way for the plugin to obtain the webhook token
 *
 * Returns specific error codes for different failure scenarios:
 * - NOT_CONFIGURED: Token files don't exist
 * - FILE_READ_ERROR: Cannot read token files
 * - PARSE_ERROR: Metadata JSON is corrupted
 * - EXPIRED: Token has expired
 * - ALREADY_USED: Token has reached maximum use count (one-time use enforcement)
 * - INVALID_TOKEN: Token hash doesn't match
 * - WEBHOOK_ERROR: Token valid but webhook token unavailable
 */
export function validateBootstrapToken(providedToken: string): {
  valid: boolean;
  webhookToken?: string;
  webhookAuthHeader?: string;
  error?: string;
  errorCode?: 'NOT_CONFIGURED' | 'FILE_READ_ERROR' | 'PARSE_ERROR' | 'EXPIRED' | 'ALREADY_USED' | 'INVALID_TOKEN' | 'WEBHOOK_ERROR' | 'USAGE_TRACKING_ERROR';
} {
  if (!existsSync(BOOTSTRAP_TOKEN_FILE) || !existsSync(BOOTSTRAP_TOKEN_META_FILE)) {
    return {
      valid: false,
      error: 'Bootstrap token not configured',
      errorCode: 'NOT_CONFIGURED'
    };
  }

  // Read token hash
  let storedHash: string;
  try {
    storedHash = readFileSync(BOOTSTRAP_TOKEN_FILE, 'utf8').trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error('[Bootstrap Token] Failed to read token file:', {
      code: err.code,
      message: err.message
    });
    return {
      valid: false,
      error: `Failed to read bootstrap token: ${err.code === 'EACCES' ? 'Permission denied' : err.message}`,
      errorCode: 'FILE_READ_ERROR'
    };
  }

  // Parse metadata
  let metadata: {
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
    usedCount: number;
    maxUses?: number;
    lastUsedAt: string | null;
  };
  try {
    const metaContent = readFileSync(BOOTSTRAP_TOKEN_META_FILE, 'utf8');
    metadata = JSON.parse(metaContent);

    // Validate metadata structure
    if (!metadata.tokenHash || !metadata.expiresAt) {
      throw new Error('Invalid metadata structure: missing required fields');
    }
  } catch (error) {
    const err = error as Error;
    console.error('[Bootstrap Token] Metadata parse error:', {
      message: err.message,
      file: BOOTSTRAP_TOKEN_META_FILE
    });

    if (err instanceof SyntaxError) {
      return {
        valid: false,
        error: `Bootstrap token metadata is corrupted (invalid JSON). Delete ${BOOTSTRAP_TOKEN_META_FILE} and regenerate token.`,
        errorCode: 'PARSE_ERROR'
      };
    }

    return {
      valid: false,
      error: `Bootstrap token metadata is invalid: ${err.message}`,
      errorCode: 'PARSE_ERROR'
    };
  }

  // Check expiration
  const now = new Date();
  const expiresAt = new Date(metadata.expiresAt);
  if (now > expiresAt) {
    return {
      valid: false,
      error: `Bootstrap token expired at ${expiresAt.toISOString()}`,
      errorCode: 'EXPIRED'
    };
  }

  // Check max uses (one-time use enforcement)
  const maxUses = metadata.maxUses ?? BOOTSTRAP_TOKEN_MAX_USES;
  const currentUses = metadata.usedCount || 0;
  if (currentUses >= maxUses) {
    console.warn('[Bootstrap Token] Token already used, rejecting reuse attempt');
    return {
      valid: false,
      error: `Bootstrap token already used (${currentUses}/${maxUses} uses). Generate a new token.`,
      errorCode: 'ALREADY_USED'
    };
  }

  // Validate token using timing-safe comparison to prevent timing attacks
  const providedHash = createHash('sha256').update(providedToken).digest('hex');
  const providedBuffer = Buffer.from(providedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (!timingSafeEqual(providedBuffer, storedBuffer)) {
    console.warn('[Bootstrap Token] Invalid token attempt');
    return {
      valid: false,
      error: 'Invalid bootstrap token',
      errorCode: 'INVALID_TOKEN'
    };
  }

  // Token is valid - update usage stats
  metadata.usedCount = (metadata.usedCount || 0) + 1;
  metadata.lastUsedAt = new Date().toISOString();

  try {
    writeFileSync(BOOTSTRAP_TOKEN_META_FILE, JSON.stringify(metadata, null, 2), 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error('[Bootstrap Token] CRITICAL: Failed to update usage stats:', {
      code: err.code,
      message: err.message
    });
    return {
      valid: false,
      error: 'Failed to record token usage. Token validation aborted for security.',
      errorCode: 'USAGE_TRACKING_ERROR'
    };
  }

  console.log('[Bootstrap Token] Token validated successfully, use count:', metadata.usedCount);

  // Get webhook credentials
  let webhookToken: string;
  try {
    webhookToken = getWebhookToken();
  } catch (error) {
    const err = error as Error;
    console.error('[Bootstrap Token] Failed to retrieve webhook token:', err.message);
    return {
      valid: false,
      error: `Bootstrap token valid but webhook token unavailable: ${err.message}`,
      errorCode: 'WEBHOOK_ERROR'
    };
  }

  // Return webhook credentials
  return {
    valid: true,
    webhookToken,
    webhookAuthHeader: process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-Vigil-Auth'
  };
}

/**
 * Verify bootstrap token validity WITHOUT consuming it (no usedCount increment)
 * Used by download-plugin endpoint to check token before serving ZIP
 *
 * This is different from validateBootstrapToken which:
 * - Increments usedCount (consumes the token)
 * - Returns webhook credentials
 *
 * verifyBootstrapToken only checks if the token is valid and not expired/exhausted
 * without incrementing the usage counter.
 *
 * @param providedToken - The token to verify
 * @returns Object with valid flag and error details if invalid
 */
export function verifyBootstrapToken(providedToken: string): {
  valid: boolean;
  error?: string;
  errorCode?: 'NOT_CONFIGURED' | 'FILE_READ_ERROR' | 'PARSE_ERROR' | 'EXPIRED' | 'ALREADY_USED' | 'INVALID_TOKEN';
} {
  if (!existsSync(BOOTSTRAP_TOKEN_FILE) || !existsSync(BOOTSTRAP_TOKEN_META_FILE)) {
    return {
      valid: false,
      error: 'Bootstrap token not configured',
      errorCode: 'NOT_CONFIGURED'
    };
  }

  // Read token hash
  let storedHash: string;
  try {
    storedHash = readFileSync(BOOTSTRAP_TOKEN_FILE, 'utf8').trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return {
      valid: false,
      error: `Failed to read bootstrap token: ${err.code === 'EACCES' ? 'Permission denied' : err.message}`,
      errorCode: 'FILE_READ_ERROR'
    };
  }

  // Parse metadata
  let metadata: {
    tokenHash: string;
    expiresAt: string;
    usedCount: number;
    maxUses?: number;
  };
  try {
    const metaContent = readFileSync(BOOTSTRAP_TOKEN_META_FILE, 'utf8');
    metadata = JSON.parse(metaContent);

    if (!metadata.tokenHash || !metadata.expiresAt) {
      throw new Error('Invalid metadata structure');
    }
  } catch (error) {
    const err = error as Error;
    return {
      valid: false,
      error: err instanceof SyntaxError
        ? 'Bootstrap token metadata is corrupted'
        : `Invalid metadata: ${err.message}`,
      errorCode: 'PARSE_ERROR'
    };
  }

  // Check expiration
  if (new Date() > new Date(metadata.expiresAt)) {
    return {
      valid: false,
      error: 'Bootstrap token expired',
      errorCode: 'EXPIRED'
    };
  }

  // Check max uses
  const maxUses = metadata.maxUses ?? BOOTSTRAP_TOKEN_MAX_USES;
  const currentUses = metadata.usedCount || 0;
  if (currentUses >= maxUses) {
    return {
      valid: false,
      error: `Bootstrap token already used (${currentUses}/${maxUses} uses)`,
      errorCode: 'ALREADY_USED'
    };
  }

  // Validate token hash using timing-safe comparison
  const providedHash = createHash('sha256').update(providedToken).digest('hex');
  const providedBuffer = Buffer.from(providedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (!timingSafeEqual(providedBuffer, storedBuffer)) {
    return {
      valid: false,
      error: 'Invalid bootstrap token',
      errorCode: 'INVALID_TOKEN'
    };
  }

  // Token is valid - DO NOT increment usedCount here
  return { valid: true };
}

/**
 * Check if bootstrap token is configured and usable
 * Returns false if token is exhausted (already used) or expired
 * Used by UI to show warning banner
 */
export function isBootstrapTokenConfigured(): boolean {
  const status = getBootstrapTokenStatus();
  return status.status === 'active'; // 'exhausted' and 'expired' return false
}
