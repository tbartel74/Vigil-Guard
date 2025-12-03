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
import { escapeJavaScriptString, escapeHtml } from './escapeUtils.js';
import {
  getPluginConfig,
  savePluginConfig,
  generateBootstrapToken,
  getBootstrapTokenStatus,
  validateBootstrapToken,
  verifyBootstrapToken,
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
 *
 * NOTE: Returns HTML error page instead of JSON for better UX when accessing stale links
 */
router.get('/plugin-config/download-plugin', pluginConfigLimiter, async (req, res) => {
  // Helper function to return user-friendly HTML error page
  // SECURITY: All parameters are HTML-escaped to prevent XSS attacks
  const sendErrorPage = (statusCode: number, title: string, message: string, suggestion: string) => {
    res.status(statusCode).setHeader('Content-Type', 'text/html; charset=utf-8').send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vigil Guard - ${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { max-width: 500px; padding: 2rem; text-align: center; background: #1e293b; border-radius: 12px; border: 1px solid #334155; }
    h1 { color: #f87171; margin-bottom: 1rem; }
    p { color: #94a3b8; line-height: 1.6; }
    .suggestion { background: #334155; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚠️ ${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="suggestion">
      <strong>What to do:</strong><br>
      ${escapeHtml(suggestion)}
    </div>
    <p style="margin-top: 1.5rem;">
      <a href="/ui/config/plugin">← Go to Plugin Configuration</a>
    </p>
  </div>
</body>
</html>
    `);
  };

  try {
    const bootstrapToken = req.query.token as string;

    if (!bootstrapToken || typeof bootstrapToken !== 'string') {
      console.warn('[Plugin Config API] Download rejected: MISSING_TOKEN');
      return sendErrorPage(
        400,
        'Missing Token',
        'No bootstrap token was provided in the download link.',
        'Go to Plugin Configuration and generate a new Bootstrap Token, then use the Download button.'
      );
    }

    // Verify token validity WITHOUT consuming it (usedCount not incremented)
    // The token is only consumed when plugin calls /bootstrap endpoint
    const validation = verifyBootstrapToken(bootstrapToken);
    if (!validation.valid) {
      // Provide specific error messages and HTTP status codes based on error code
      let statusCode = 401; // Default: Unauthorized
      let title = 'Download Link Expired';
      let message = 'This download link is no longer valid.';
      let suggestion = 'Go to Plugin Configuration and generate a new Bootstrap Token to get a fresh download link.';

      if (validation.errorCode === 'EXPIRED') {
        statusCode = 410; // Gone - resource expired
        title = 'Token Expired';
        message = 'The bootstrap token in this link has expired (tokens are valid for 24 hours).';
      } else if (validation.errorCode === 'ALREADY_USED') {
        statusCode = 410; // Gone - resource consumed
        title = 'Token Already Used';
        message = 'This bootstrap token has already been used. Bootstrap tokens are single-use for security.';
        suggestion = 'If you need to deploy another plugin instance, generate a new Bootstrap Token in Plugin Configuration.';
      } else if (validation.errorCode === 'INVALID_TOKEN') {
        statusCode = 401; // Unauthorized - invalid credentials
        title = 'Invalid Token';
        message = 'The token in this link is invalid or has been regenerated.';
      }

      console.warn('[Plugin Config API] Download rejected:', validation.errorCode, validation.error);
      return sendErrorPage(statusCode, title, message, suggestion);
    }

    // Get current config for GUI URL
    const config = await getPluginConfig();
    const guiUrl = config.guiUrl || 'http://localhost:80/ui';

    // Path to plugin source
    const pluginSourcePath = '/app/plugin/Chrome';

    // Check if plugin source exists
    if (!existsSync(pluginSourcePath)) {
      console.error('[Plugin Config API] Plugin source not found at:', pluginSourcePath);
      return sendErrorPage(
        500,
        'Server Configuration Error',
        'The plugin source files are not available on the server.',
        'Contact your administrator to verify the backend container configuration.'
      );
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
        sendErrorPage(
          500,
          'Download Failed',
          'An error occurred while creating the plugin archive.',
          'Please try again. If the problem persists, contact your administrator.'
        );
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

    // Read and modify service-worker.js with INLINE config
    // NOTE: Using inline const instead of ES module import to avoid Chrome MV3
    // service worker re-registration issues after system idle/sleep
    // See: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/lLb3EJzjw0o
    const swPath = join(pluginSourcePath, 'src/background/service-worker.js');
    let swContent = readFileSync(swPath, 'utf8');

    // Create inline config to inject (SECURITY: all values escaped)
    const inlineConfig = `
// =============================================================================
// PLUGIN BUILD CONFIGURATION (auto-injected by backend)
// Build timestamp: ${escapeJavaScriptString(new Date().toISOString())}
// =============================================================================
const PLUGIN_BUILD_CONFIG = {
  bootstrapToken: '${escapeJavaScriptString(bootstrapToken)}',
  guiUrl: '${escapeJavaScriptString(guiUrl)}',
  buildTimestamp: '${escapeJavaScriptString(new Date().toISOString())}',
  buildVersion: '0.7.0'
};

`;

    // Insert inline config after the initial comment block
    const firstCommentEnd = swContent.indexOf('*/') + 2;
    swContent = swContent.slice(0, firstCommentEnd) + '\n' + inlineConfig + swContent.slice(firstCommentEnd);

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
    } else {
      // Fail loudly if expected function not found - plugin will not auto-configure
      console.error('[Plugin Config API] CRITICAL: fetchConfigFromGUI() not found in service-worker.js');
      return sendErrorPage(
        500,
        'Plugin Build Error',
        'The plugin source code is incompatible with auto-bootstrap injection.',
        'Contact your administrator to update the Chrome plugin to version 0.7.0 or higher.'
      );
    }

    archive.append(swContent, { name: 'src/background/service-worker.js' });

    // Finalize archive
    await archive.finalize();

    console.log('[Plugin Config API] Pre-configured plugin downloaded (token injected)');
  } catch (error: any) {
    console.error('[Plugin Config API] Download plugin error:', error);
    if (!res.headersSent) {
      sendErrorPage(
        500,
        'Download Failed',
        'An unexpected error occurred while generating the plugin download.',
        'Please try again later. If the problem persists, contact your administrator.'
      );
    }
  }
});

  return router;
}
