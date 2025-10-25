// Plugin Configuration Database Operations
// Manages browser extension settings stored in SQLite

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
 */
export async function getPluginConfig(): Promise<PluginConfig> {
  const db = new Database(DB_PATH);

  try {
    const row = db.prepare('SELECT * FROM plugin_settings WHERE id = 1').get() as any;

    if (!row) {
      throw new Error('Plugin configuration not found');
    }

    return {
      webhookUrl: row.webhook_url,
      guiUrl: row.gui_url,
      enabled: Boolean(row.enabled),
      version: '1.4.0',  // Current Vigil Guard version
      updatedAt: row.updated_at,
      updatedBy: row.updated_by
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
