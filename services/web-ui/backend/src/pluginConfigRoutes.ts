// Plugin Configuration API Routes
// Provides endpoints for browser extension auto-configuration
//
// ENDPOINT SECURITY MODEL (v2.0):
// - PUBLIC endpoints (no auth): /api/plugin-config, /api/plugin-config/bootstrap
//   - plugin-config: Returns NON-SENSITIVE config (webhook URL, header name)
//   - bootstrap: Validates bootstrap token, returns webhook credentials
// - PROTECTED endpoints (JWT required): /settings, /regenerate-token, /generate-bootstrap
//   - Full config access for admin UI

import express, { RequestHandler } from 'express';
import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import archiver from 'archiver';
import {
  getPluginConfig,
  savePluginConfig,
  generateBootstrapToken,
  getBootstrapTokenStatus,
  validateBootstrapToken,
  isBootstrapTokenConfigured
} from './pluginConfigOps.js';
import { authenticateToken } from './auth.js';

// Token file path (persisted in mounted config volume)
const TOKEN_FILE = '/config/.webhook-token';

/**
 * Create plugin config router with rate limiting
 * @param pluginConfigLimiter - Rate limiter middleware for public endpoint
 */
export default function createPluginConfigRouter(pluginConfigLimiter: RequestHandler) {
  const router = express.Router();

  /**
   * GET /api/plugin-config
   * Public endpoint - browser extension fetches NON-SENSITIVE configuration
   * NO AUTHENTICATION REQUIRED (plugin needs access on first install)
   * RATE LIMITED: 10 requests per minute per IP
   *
   * SECURITY: webhookAuthToken is NEVER returned here - only via authenticated /settings endpoint
   * The browser extension must be configured with the token during installation
   */
  router.get('/plugin-config', pluginConfigLimiter, async (req, res) => {
  try {
    const config = await getPluginConfig();

    // Return only PUBLIC fields - NEVER expose auth credentials!
    // Token must be configured in extension settings, not auto-fetched
    res.json({
      webhookUrl: config.webhookUrl,
      enabled: config.enabled,
      version: config.version,
      // SECURITY: Auth token is NOT included - prevents unauthorized webhook access
      // Extension must be manually configured with token from admin panel
      webhookAuthHeader: config.webhookAuthHeader  // Header name only, not the value
    });

    console.log('[Plugin Config API] Configuration fetched by extension (token excluded)');
  } catch (error: any) {
    console.error('[Plugin Config API] Failed to fetch config:', error);
    res.status(500).json({
      error: 'Failed to fetch plugin configuration',
      message: error.message
    });
  }
});

/**
 * GET /api/plugin-config/settings
 * Protected endpoint - admin UI fetches full configuration
 * REQUIRES AUTHENTICATION
 */
router.get('/plugin-config/settings', authenticateToken, async (req, res) => {
  try {
    const config = await getPluginConfig();

    // Return full configuration including metadata
    res.json(config);

    console.log('[Plugin Config API] Settings fetched by admin');
  } catch (error: any) {
    console.error('[Plugin Config API] Failed to fetch settings:', error);
    res.status(500).json({
      error: 'Failed to fetch plugin settings',
      message: error.message
    });
  }
});

/**
 * POST /api/plugin-config/settings
 * Protected endpoint - admin UI updates configuration
 * REQUIRES AUTHENTICATION
 */
router.post('/plugin-config/settings', authenticateToken, async (req, res) => {
  try {
    const { webhookUrl, enabled } = req.body;
    const username = (req as any).user?.username || 'unknown';

    // Validate required fields (guiUrl no longer required - removed from UI)
    if (!webhookUrl) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'webhookUrl is required'
      });
    }

    // Save configuration
    await savePluginConfig(
      {
        webhookUrl,
        enabled: enabled !== undefined ? Boolean(enabled) : true
      },
      username
    );

    // Fetch updated config to return
    const updatedConfig = await getPluginConfig();

    res.json({
      success: true,
      config: updatedConfig
    });

    console.log(`[Plugin Config API] Settings updated by ${username}`);
  } catch (error: any) {
    console.error('[Plugin Config API] Failed to save settings:', error);
    res.status(500).json({
      error: 'Failed to save plugin settings',
      message: error.message
    });
  }
});

/**
 * POST /api/plugin-config/regenerate-token
 * Protected endpoint - generates new webhook auth token
 * REQUIRES AUTHENTICATION
 * WARNING: After regeneration, user must manually update n8n credentials!
 */
router.post('/plugin-config/regenerate-token', authenticateToken, async (req, res) => {
  try {
    const username = (req as any).user?.username || 'unknown';

    // Generate new 32-character token
    const newToken = randomBytes(24).toString('base64').replace(/[/+=]/g, '').slice(0, 32);

    // Save to file (persisted in mounted config volume)
    writeFileSync(TOKEN_FILE, newToken, 'utf8');

    console.log(`[Plugin Config API] Webhook token regenerated by ${username}`);

    res.json({
      success: true,
      token: newToken,
      message: 'Token regenerated. You must manually update n8n Webhook node credentials with this new token.'
    });
  } catch (error: any) {
    console.error('[Plugin Config API] Failed to regenerate token:', error);
    res.status(500).json({
      error: 'Failed to regenerate token',
      message: error.message
    });
  }
});

// =============================================================================
// BOOTSTRAP TOKEN ENDPOINTS (v2.0)
// =============================================================================

/**
 * POST /api/plugin-config/bootstrap
 * PUBLIC endpoint - plugin uses bootstrap token to obtain webhook credentials
 * NO ADMIN AUTH REQUIRED - authentication is via bootstrap token
 * RATE LIMITED: Uses same limiter as /plugin-config
 *
 * Request body: { bootstrapToken: string }
 * Response: { webhookToken, webhookAuthHeader } on success
 */
router.post('/plugin-config/bootstrap', pluginConfigLimiter, async (req, res) => {
  try {
    const { bootstrapToken } = req.body;

    if (!bootstrapToken || typeof bootstrapToken !== 'string') {
      return res.status(400).json({
        error: 'Missing bootstrap token',
        message: 'bootstrapToken is required in request body'
      });
    }

    // Validate bootstrap token and get webhook credentials
    const result = validateBootstrapToken(bootstrapToken);

    if (!result.valid) {
      console.warn('[Plugin Config API] Bootstrap token validation failed:', result.error);
      return res.status(401).json({
        error: 'Invalid bootstrap token',
        message: result.error
      });
    }

    // Return webhook credentials - this is the ONLY way plugin gets the token
    console.log('[Plugin Config API] Bootstrap token validated, returning webhook credentials');
    res.json({
      success: true,
      webhookToken: result.webhookToken,
      webhookAuthHeader: result.webhookAuthHeader,
      message: 'Webhook credentials retrieved successfully'
    });
  } catch (error: any) {
    console.error('[Plugin Config API] Bootstrap validation error:', error);
    res.status(500).json({
      error: 'Bootstrap validation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/plugin-config/bootstrap-status
 * Protected endpoint - admin UI fetches bootstrap token status
 * REQUIRES AUTHENTICATION
 * Returns: token status (masked), expiration, usage count
 */
router.get('/plugin-config/bootstrap-status', authenticateToken, async (req, res) => {
  try {
    const status = getBootstrapTokenStatus();
    res.json(status);
  } catch (error: any) {
    console.error('[Plugin Config API] Failed to get bootstrap status:', error);
    res.status(500).json({
      error: 'Failed to get bootstrap token status',
      message: error.message
    });
  }
});

/**
 * POST /api/plugin-config/generate-bootstrap
 * Protected endpoint - admin generates new bootstrap token for plugin deployment
 * REQUIRES AUTHENTICATION
 * Returns: plaintext token (shown ONCE) and expiration
 *
 * IMPORTANT: Token is shown only once! Admin must copy it immediately.
 */
router.post('/plugin-config/generate-bootstrap', authenticateToken, async (req, res) => {
  try {
    const username = (req as any).user?.username || 'unknown';

    // Generate new bootstrap token
    const { token, expiresAt } = generateBootstrapToken();

    console.log(`[Plugin Config API] Bootstrap token generated by ${username}, expires: ${expiresAt}`);

    res.json({
      success: true,
      token: token, // Plaintext - shown ONCE
      expiresAt: expiresAt,
      message: 'Bootstrap token generated. Copy it now - it will not be shown again!'
    });
  } catch (error: any) {
    console.error('[Plugin Config API] Failed to generate bootstrap token:', error);
    res.status(500).json({
      error: 'Failed to generate bootstrap token',
      message: error.message
    });
  }
});

/**
 * GET /api/plugin-config/download-plugin
 * PUBLIC endpoint - downloads pre-configured plugin zip with injected bootstrap token
 * Token passed as query parameter (from UI after generation)
 *
 * SECURITY: Token must be valid and not expired - validated before serving
 *
 * Query params: ?token=BOOTSTRAP_TOKEN
 * Response: application/zip file download
 */
router.get('/plugin-config/download-plugin', pluginConfigLimiter, async (req, res) => {
  try {
    const bootstrapToken = req.query.token as string;

    if (!bootstrapToken || typeof bootstrapToken !== 'string') {
      return res.status(400).json({
        error: 'Missing bootstrap token',
        message: 'Token query parameter is required'
      });
    }

    // Validate that the token is valid (not expired)
    const validation = validateBootstrapToken(bootstrapToken);
    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid or expired bootstrap token',
        message: validation.error
      });
    }

    // Get current config for GUI URL
    const config = await getPluginConfig();
    const guiUrl = config.guiUrl || 'http://localhost:80/ui';

    // Path to plugin source
    const pluginSourcePath = '/app/plugin/Chrome';

    // Check if plugin source exists
    if (!existsSync(pluginSourcePath)) {
      console.error('[Plugin Config API] Plugin source not found at:', pluginSourcePath);
      return res.status(500).json({
        error: 'Plugin source not available',
        message: 'Chrome plugin source files not found in container'
      });
    }

    // Set response headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="vigil-guard-plugin.zip"');

    // Create zip archive
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Pipe archive to response
    archive.pipe(res);

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('[Plugin Config API] Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create plugin archive' });
      }
    });

    // Add all plugin files except service-worker.js
    const addFilesRecursively = (dirPath: string, archivePath: string) => {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const archiveEntryPath = join(archivePath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          addFilesRecursively(fullPath, archiveEntryPath);
        } else if (entry !== 'service-worker.js' && !entry.startsWith('.')) {
          archive.file(fullPath, { name: archiveEntryPath });
        }
      }
    };

    addFilesRecursively(pluginSourcePath, '');

    // Create plugin-config.js with injected bootstrap token
    const pluginConfigContent = `// =============================================================================
// Vigil Guard Plugin Configuration
// =============================================================================
// AUTO-GENERATED - Contains pre-configured bootstrap token
// Build timestamp: ${new Date().toISOString()}
// =============================================================================

export const PLUGIN_BUILD_CONFIG = {
  // Pre-injected bootstrap token (valid 24h from generation)
  bootstrapToken: '${bootstrapToken}',

  // GUI URL for API calls
  guiUrl: '${guiUrl}',

  // Build metadata
  buildTimestamp: '${new Date().toISOString()}',
  buildVersion: '0.7.0'
};
`;

    archive.append(pluginConfigContent, { name: 'src/background/plugin-config.js' });

    // Read and modify service-worker.js to import plugin-config
    const swPath = join(pluginSourcePath, 'src/background/service-worker.js');
    let swContent = readFileSync(swPath, 'utf8');

    // Insert import at the beginning (after first comment block)
    const importStatement = `// BUILD CONFIG: Auto-injected bootstrap token
import { PLUGIN_BUILD_CONFIG } from './plugin-config.js';

`;

    // Insert after the initial comment block
    const firstCommentEnd = swContent.indexOf('*/') + 2;
    swContent = swContent.slice(0, firstCommentEnd) + '\n\n' + importStatement + swContent.slice(firstCommentEnd);

    // Add auto-bootstrap logic in fetchConfigFromGUI function
    const fetchConfigStart = swContent.indexOf('async function fetchConfigFromGUI()');
    if (fetchConfigStart !== -1) {
      const funcBodyStart = swContent.indexOf('{', fetchConfigStart) + 1;
      const autoBootstrapCode = `
  // v2.0 BUILD-TIME INJECTION: Check for pre-configured bootstrap token
  if (typeof PLUGIN_BUILD_CONFIG !== 'undefined' && PLUGIN_BUILD_CONFIG.bootstrapToken) {
    const stored = await chrome.storage.local.get('config');
    if (!stored.config?.bootstrapComplete) {
      console.log('[Vigil Guard] Using build-time bootstrap token...');
      await chrome.storage.local.set({ bootstrapToken: PLUGIN_BUILD_CONFIG.bootstrapToken });
    }
  }
`;
      swContent = swContent.slice(0, funcBodyStart) + autoBootstrapCode + swContent.slice(funcBodyStart);
    }

    archive.append(swContent, { name: 'src/background/service-worker.js' });

    // Finalize archive
    await archive.finalize();

    console.log('[Plugin Config API] Pre-configured plugin downloaded (token injected)');
  } catch (error: any) {
    console.error('[Plugin Config API] Download plugin error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate plugin download',
        message: error.message
      });
    }
  }
});

  return router;
}
