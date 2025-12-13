/**
 * Events V2 Routes - 3-Branch Detection Architecture v2.0.0
 * Extracted from server.ts as part of Sprint 2 refactoring
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth.js';
import {
  getQuickStatsV2,
  getBranchStats,
  getEventListV2,
  searchEventsV2,
  getEventDetailsV2,
  getStatusDistribution,
  getBoostStats,
  getHourlyTrend,
  getPIIStatsV2,
  SearchParamsV2
} from '../clickhouse-v2.js';

const router = Router();

// Helper function to convert frontend timeRange to ClickHouse INTERVAL format
function convertTimeRangeToInterval(timeRange: string): string {
  const mapping: Record<string, string> = {
    '1h': '1 HOUR',
    '6h': '6 HOUR',
    '12h': '12 HOUR',
    '24h': '24 HOUR',
    '7d': '7 DAY'
  };
  return mapping[timeRange] || '24 HOUR';
}

// Extract time range from request query
function getTimeRangeInterval(req: Request): string {
  const timeRange = (req.query.timeRange as string) || '24h';
  return convertTimeRangeToInterval(timeRange);
}

/**
 * GET /api/events-v2/stats
 * Quick stats for events_v2 table (24h or custom time range)
 */
router.get("/stats", authenticate, async (req: Request, res: Response) => {
  try {
    const interval = getTimeRangeInterval(req);
    const stats = await getQuickStatsV2(interval);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching events_v2 stats:", e);
    res.status(500).json({ error: "Failed to fetch v2 statistics", details: e.message });
  }
});

/**
 * GET /api/events-v2/branch-stats
 * Average scores for all 3 branches
 */
router.get("/branch-stats", authenticate, async (req: Request, res: Response) => {
  try {
    const interval = getTimeRangeInterval(req);
    const stats = await getBranchStats(interval);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching branch stats:", e);
    res.status(500).json({ error: "Failed to fetch branch statistics", details: e.message });
  }
});

/**
 * GET /api/events-v2/status-distribution
 * Distribution of ALLOWED/SANITIZED/BLOCKED statuses
 */
router.get("/status-distribution", authenticate, async (req: Request, res: Response) => {
  try {
    const interval = getTimeRangeInterval(req);
    const distribution = await getStatusDistribution(interval);
    res.json(distribution);
  } catch (e: any) {
    console.error("Error fetching status distribution:", e);
    res.status(500).json({ error: "Failed to fetch status distribution", details: e.message });
  }
});

/**
 * GET /api/events-v2/boost-stats
 * Statistics on priority boosts applied by Arbiter
 */
router.get("/boost-stats", authenticate, async (req: Request, res: Response) => {
  try {
    const interval = getTimeRangeInterval(req);
    const stats = await getBoostStats(interval);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching boost stats:", e);
    res.status(500).json({ error: "Failed to fetch boost statistics", details: e.message });
  }
});

/**
 * GET /api/events-v2/hourly-trend
 * Hourly trend for last 24 hours
 */
router.get("/hourly-trend", authenticate, async (req: Request, res: Response) => {
  try {
    const trend = await getHourlyTrend();
    res.json(trend);
  } catch (e: any) {
    console.error("Error fetching hourly trend:", e);
    res.status(500).json({ error: "Failed to fetch hourly trend", details: e.message });
  }
});

/**
 * GET /api/events-v2/pii-stats
 * PII detection statistics from events_v2
 */
router.get("/pii-stats", authenticate, async (req: Request, res: Response) => {
  try {
    const interval = getTimeRangeInterval(req);
    const stats = await getPIIStatsV2(interval);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching PII stats from events_v2:", e);
    res.status(500).json({ error: "Failed to fetch PII statistics", details: e.message });
  }
});

/**
 * GET /api/events-v2/list
 * List events from events_v2 table
 */
router.get("/list", authenticate, async (req: Request, res: Response) => {
  try {
    const interval = getTimeRangeInterval(req);
    const limit = parseInt(req.query.limit as string) || 100;
    const events = await getEventListV2(interval, Math.min(limit, 500));
    res.json(events);
  } catch (e: any) {
    console.error("Error fetching events list:", e);
    res.status(503).json({ error: "ClickHouse service unavailable", details: e.message });
  }
});

/**
 * GET /api/events-v2/search
 * Search events_v2 with filters
 */
router.get("/search", authenticate, async (req: Request, res: Response) => {
  try {
    const params: SearchParamsV2 = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      textQuery: req.query.textQuery as string,
      clientId: req.query.clientId as string,
      status: req.query.status as 'ALLOWED' | 'SANITIZED' | 'BLOCKED' | undefined,
      minScore: req.query.minScore ? parseInt(req.query.minScore as string) : undefined,
      maxScore: req.query.maxScore ? parseInt(req.query.maxScore as string) : undefined,
      piiOnly: req.query.piiOnly === 'true',
      sortBy: req.query.sortBy as any || 'timestamp',
      sortOrder: req.query.sortOrder as 'ASC' | 'DESC' || 'DESC',
      page: parseInt(req.query.page as string) || 1,
      pageSize: Math.min(parseInt(req.query.pageSize as string) || 25, 100),
    };

    const results = await searchEventsV2(params);
    res.json(results);
  } catch (e: any) {
    console.error("Error searching events:", e);
    res.status(503).json({ error: "ClickHouse service unavailable", details: e.message });
  }
});

/**
 * GET /api/events-v2/:eventId
 * Get detailed event information
 */
router.get("/:eventId", authenticate, async (req: Request, res: Response) => {
  try {
    const eventId = req.params.eventId;
    if (!eventId) {
      return res.status(400).json({ error: "Event ID is required" });
    }

    // Validate UUID format (UUIDv4)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return res.status(400).json({ error: "Invalid event ID format" });
    }

    const event = await getEventDetailsV2(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (e: any) {
    console.error("Error fetching event details:", e);
    res.status(503).json({ error: "ClickHouse service unavailable", details: e.message });
  }
});

export default router;
