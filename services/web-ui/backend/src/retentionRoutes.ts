import { Router, Request, Response } from 'express';
import { authenticate, requireConfigurationAccess } from './auth.js';
import {
  getRetentionConfig,
  updateRetentionConfig,
  getDiskUsageStats,
  getSystemDiskStats,
  forceCleanup,
  getPartitionInfo,
  RetentionConfig
} from './retention.js';

const router = Router();

/**
 * GET /api/retention/config
 * Get current retention policy configuration
 * Requires: can_view_configuration permission
 */
router.get('/config', authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  try {
    const config = await getRetentionConfig();

    if (!config) {
      return res.status(404).json({ error: 'Retention configuration not found' });
    }

    res.json({ success: true, config });
  } catch (error: any) {
    console.error('Get retention config error:', error);
    res.status(500).json({ error: 'Failed to fetch retention configuration', details: error.message });
  }
});

/**
 * PUT /api/retention/config
 * Update retention policy configuration
 * Requires: can_view_configuration permission
 *
 * Body: Partial<RetentionConfig>
 * - events_raw_ttl_days: number (1-3650)
 * - events_processed_ttl_days: number (1-3650)
 * - merge_with_ttl_timeout_seconds: number (60-86400)
 * - ttl_only_drop_parts: 0 | 1
 * - warn_disk_usage_percent: number (1-100)
 * - critical_disk_usage_percent: number (1-100)
 */
router.put('/config', authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const username = req.user?.username || 'unknown';

    // Validation
    if (updates.events_raw_ttl_days !== undefined) {
      const days = Number(updates.events_raw_ttl_days);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        return res.status(400).json({ error: 'events_raw_ttl_days must be between 1 and 3650 days' });
      }
    }

    if (updates.events_processed_ttl_days !== undefined) {
      const days = Number(updates.events_processed_ttl_days);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        return res.status(400).json({ error: 'events_processed_ttl_days must be between 1 and 3650 days' });
      }
    }

    if (updates.merge_with_ttl_timeout_seconds !== undefined) {
      const seconds = Number(updates.merge_with_ttl_timeout_seconds);
      if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400) {
        return res.status(400).json({ error: 'merge_with_ttl_timeout_seconds must be between 60 and 86400 seconds' });
      }
    }

    if (updates.ttl_only_drop_parts !== undefined) {
      const value = Number(updates.ttl_only_drop_parts);
      if (value !== 0 && value !== 1) {
        return res.status(400).json({ error: 'ttl_only_drop_parts must be 0 or 1' });
      }
    }

    if (updates.warn_disk_usage_percent !== undefined) {
      const percent = Number(updates.warn_disk_usage_percent);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        return res.status(400).json({ error: 'warn_disk_usage_percent must be between 1 and 100' });
      }
    }

    if (updates.critical_disk_usage_percent !== undefined) {
      const percent = Number(updates.critical_disk_usage_percent);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        return res.status(400).json({ error: 'critical_disk_usage_percent must be between 1 and 100' });
      }
    }

    // Business logic: critical threshold must be higher than warning
    if (updates.warn_disk_usage_percent !== undefined || updates.critical_disk_usage_percent !== undefined) {
      const currentConfig = await getRetentionConfig();
      const warnThreshold = updates.warn_disk_usage_percent !== undefined
        ? updates.warn_disk_usage_percent
        : currentConfig?.warn_disk_usage_percent || 80;
      const criticalThreshold = updates.critical_disk_usage_percent !== undefined
        ? updates.critical_disk_usage_percent
        : currentConfig?.critical_disk_usage_percent || 90;

      if (warnThreshold >= criticalThreshold) {
        return res.status(400).json({
          error: 'warn_disk_usage_percent must be less than critical_disk_usage_percent'
        });
      }
    }

    // Apply updates
    const updatedConfig = await updateRetentionConfig(updates, username);

    res.json({
      success: true,
      message: 'Retention configuration updated successfully',
      config: updatedConfig
    });
  } catch (error: any) {
    console.error('Update retention config error:', error);
    res.status(500).json({ error: 'Failed to update retention configuration', details: error.message });
  }
});

/**
 * GET /api/retention/disk-usage
 * Get disk usage statistics for tables
 * Requires: can_view_configuration permission
 */
router.get('/disk-usage', authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  try {
    const tableStats = await getDiskUsageStats();
    const systemStats = await getSystemDiskStats();

    res.json({
      success: true,
      tables: tableStats,
      system: systemStats
    });
  } catch (error: any) {
    console.error('Get disk usage error:', error);
    res.status(500).json({ error: 'Failed to fetch disk usage statistics', details: error.message });
  }
});

/**
 * POST /api/retention/cleanup
 * Force immediate cleanup of expired data
 * Requires: can_view_configuration permission
 *
 * Body:
 * - table: 'events_raw' | 'events_processed' | 'all'
 */
router.post('/cleanup', authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  try {
    const { table } = req.body;

    if (!table || !['events_raw', 'events_processed', 'all'].includes(table)) {
      return res.status(400).json({
        error: 'Invalid table parameter. Must be: events_raw, events_processed, or all'
      });
    }

    await forceCleanup(table);

    res.json({
      success: true,
      message: `Cleanup executed for ${table === 'all' ? 'all tables' : table}`
    });
  } catch (error: any) {
    console.error('Force cleanup error:', error);
    res.status(500).json({ error: 'Failed to execute cleanup', details: error.message });
  }
});

/**
 * GET /api/retention/partitions/:table
 * Get partition information for a specific table
 * Requires: can_view_configuration permission
 *
 * Params:
 * - table: 'events_raw' | 'events_processed'
 */
router.get('/partitions/:table', authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  try {
    const { table } = req.params;

    if (!['events_raw', 'events_processed'].includes(table)) {
      return res.status(400).json({
        error: 'Invalid table parameter. Must be: events_raw or events_processed'
      });
    }

    const partitions = await getPartitionInfo(table as 'events_raw' | 'events_processed');

    res.json({
      success: true,
      table,
      partitions
    });
  } catch (error: any) {
    console.error('Get partition info error:', error);
    res.status(500).json({ error: 'Failed to fetch partition information', details: error.message });
  }
});

export default router;
