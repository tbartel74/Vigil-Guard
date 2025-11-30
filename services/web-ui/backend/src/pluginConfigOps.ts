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
import { randomBytes, createHash } from 'crypto';
import { parseFile } from './fileOps.js';

// Token file paths (persisted in mounted config volume)
const TOKEN_FILE = '/config/.webhook-token';
const BOOTSTRAP_TOKEN_FILE = '/config/.bootstrap-token';
const BOOTSTRAP_TOKEN_META_FILE = '/config/.bootstrap-token-meta.json';

// Bootstrap token configuration
const BOOTSTRAP_TOKEN_LENGTH = 32;
const BOOTSTRAP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get webhook auth token from file
 * Token is stored in /config/.webhook-token (mounted volume)
 * Auto-generates token on first access if file doesn't exist
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
      console.warn('[Plugin Config] Failed to auto-generate token file:', error);
      return '';
    }
  }

  try {
    const token = readFileSync(TOKEN_FILE, 'utf8').trim();
    return token || '';
  } catch (error) {
    console.warn('[Plugin Config] Failed to read token file:', error);
    return '';
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
 * Generates webhook URL dynamically from unified_config.json network.external_domain
 */
export async function getPluginConfig(): Promise<PluginConfig> {
  const db = new Database(DB_PATH);

  try {
    const row = db.prepare('SELECT * FROM plugin_settings WHERE id = 1').get() as any;

    if (!row) {
      throw new Error('Plugin configuration not found');
    }

    // Generate dynamic webhook URL based on external domain configuration
    const dynamicWebhookUrl = await generateWebhookUrl();

    return {
      webhookUrl: dynamicWebhookUrl,  // Dynamic URL from unified_config.json
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
 * Validate URL format
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
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
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'not_configured';
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
 */
export function getBootstrapTokenStatus(): BootstrapTokenInfo {
  if (!existsSync(BOOTSTRAP_TOKEN_FILE) || !existsSync(BOOTSTRAP_TOKEN_META_FILE)) {
    return {
      token: '',
      createdAt: '',
      expiresAt: '',
      usedCount: 0,
      lastUsedAt: null,
      status: 'not_configured'
    };
  }

  try {
    const metadata = JSON.parse(readFileSync(BOOTSTRAP_TOKEN_META_FILE, 'utf8'));
    const now = new Date();
    const expiresAt = new Date(metadata.expiresAt);

    const isExpired = now > expiresAt;

    return {
      token: '********' + metadata.tokenHash.slice(-4), // Masked, show last 4 chars of hash
      createdAt: metadata.createdAt,
      expiresAt: metadata.expiresAt,
      usedCount: metadata.usedCount || 0,
      lastUsedAt: metadata.lastUsedAt,
      status: isExpired ? 'expired' : 'active'
    };
  } catch (error) {
    console.error('[Bootstrap Token] Failed to read status:', error);
    return {
      token: '',
      createdAt: '',
      expiresAt: '',
      usedCount: 0,
      lastUsedAt: null,
      status: 'not_configured'
    };
  }
}

/**
 * Validate a bootstrap token and return webhook credentials if valid
 * This is the ONLY way for the plugin to obtain the webhook token
 */
export function validateBootstrapToken(providedToken: string): {
  valid: boolean;
  webhookToken?: string;
  webhookAuthHeader?: string;
  error?: string;
} {
  if (!existsSync(BOOTSTRAP_TOKEN_FILE) || !existsSync(BOOTSTRAP_TOKEN_META_FILE)) {
    return { valid: false, error: 'Bootstrap token not configured' };
  }

  try {
    const storedHash = readFileSync(BOOTSTRAP_TOKEN_FILE, 'utf8').trim();
    const metadata = JSON.parse(readFileSync(BOOTSTRAP_TOKEN_META_FILE, 'utf8'));

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(metadata.expiresAt);
    if (now > expiresAt) {
      return { valid: false, error: 'Bootstrap token expired' };
    }

    // Validate token
    const providedHash = createHash('sha256').update(providedToken).digest('hex');
    if (providedHash !== storedHash) {
      console.warn('[Bootstrap Token] Invalid token attempt');
      return { valid: false, error: 'Invalid bootstrap token' };
    }

    // Token is valid - update usage stats
    metadata.usedCount = (metadata.usedCount || 0) + 1;
    metadata.lastUsedAt = new Date().toISOString();
    writeFileSync(BOOTSTRAP_TOKEN_META_FILE, JSON.stringify(metadata, null, 2), 'utf8');

    console.log('[Bootstrap Token] Token validated successfully, use count:', metadata.usedCount);

    // Return webhook credentials
    return {
      valid: true,
      webhookToken: getWebhookToken(),
      webhookAuthHeader: process.env.N8N_WEBHOOK_AUTH_HEADER || 'X-Vigil-Auth'
    };
  } catch (error) {
    console.error('[Bootstrap Token] Validation error:', error);
    return { valid: false, error: 'Token validation failed' };
  }
}

/**
 * Check if bootstrap token is configured and valid
 * Used by UI to show warning banner
 */
export function isBootstrapTokenConfigured(): boolean {
  const status = getBootstrapTokenStatus();
  return status.status === 'active';
}
