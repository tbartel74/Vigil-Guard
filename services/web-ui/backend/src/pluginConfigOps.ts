// Plugin Configuration Database Operations
// Manages browser extension settings stored in SQLite

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { parseFile } from './fileOps.js';

// Token file path (persisted in mounted config volume)
const TOKEN_FILE = '/config/.webhook-token';

/**
 * Get webhook auth token from file
 * Token is stored in /config/.webhook-token (mounted volume)
 */
function getWebhookToken(): string {
  if (existsSync(TOKEN_FILE)) {
    try {
      const token = readFileSync(TOKEN_FILE, 'utf8').trim();
      return token || '';
    } catch (error) {
      console.warn('[Plugin Config] Failed to read token file:', error);
    }
  }
  return '';
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
