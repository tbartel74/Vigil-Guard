// Plugin Configuration API Routes
// Provides endpoints for browser extension auto-configuration

import express from 'express';
import { getPluginConfig, savePluginConfig } from './pluginConfigOps.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

/**
 * GET /api/plugin-config
 * Public endpoint - browser extension fetches configuration
 * NO AUTHENTICATION REQUIRED (plugin needs access on first install)
 */
router.get('/plugin-config', async (req, res) => {
  try {
    const config = await getPluginConfig();

    // Return only public fields (no internal metadata)
    res.json({
      webhookUrl: config.webhookUrl,
      guiUrl: config.guiUrl,
      enabled: config.enabled,
      version: config.version
    });

    console.log('[Plugin Config API] Configuration fetched by extension');
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
    const { webhookUrl, guiUrl, enabled } = req.body;
    const username = (req as any).user?.username || 'unknown';

    // Validate required fields
    if (!webhookUrl || !guiUrl) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'webhookUrl and guiUrl are required'
      });
    }

    // Save configuration
    await savePluginConfig(
      {
        webhookUrl,
        guiUrl,
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

export default router;
