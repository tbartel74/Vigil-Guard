/**
 * Quality Feedback Routes - FP/TP Reporting
 * Extracted from server.ts as part of Sprint 2 refactoring
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../auth.js';
import {
  submitFalsePositiveReport,
  getFPStats,
  getFPReportList,
  FPReportListParams,
  getFPReportDetails,
  getFPStatsByReason,
  getFPStatsByCategory,
  getFPStatsByReporter,
  getFPTrend
} from '../clickhouse.js';
import { getEventDetailsV2 } from '../clickhouse-v2.js';

const router = Router();

// Rate limiting to protect feedback endpoints from abuse
const qualityFeedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // max reports per IP in window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many feedback reports, please try again later" },
});

/**
 * POST /api/feedback/false-positive
 * Submit a false positive report
 */
router.post("/false-positive", authenticate, qualityFeedbackLimiter, async (req: Request, res: Response) => {
  try {
    const { event_id, report_type, reason, comment, event_timestamp, original_input, final_status, threat_score } = req.body;
    const reported_by = (req as any).user?.username || 'unknown';

    // Validate required fields
    if (!event_id || !reason) {
      return res.status(400).json({ error: "Missing required fields: event_id, reason" });
    }

    // Validate report_type if provided
    if (report_type && !['FP', 'TP'].includes(report_type)) {
      return res.status(400).json({ error: "Invalid report_type. Must be 'FP' or 'TP'" });
    }

    // Validate threat_score type when provided
    const parsedThreatScore = threat_score === undefined ? undefined : Number(threat_score);
    if (parsedThreatScore !== undefined && Number.isNaN(parsedThreatScore)) {
      return res.status(400).json({ error: "Invalid threat_score. Must be a number" });
    }

    // Submit the report (defaults to 'FP' if report_type not provided)
    const success = await submitFalsePositiveReport({
      event_id,
      reported_by,
      report_type: report_type || 'FP',
      reason,
      comment: comment || '',
      event_timestamp,
      original_input,
      final_status,
      threat_score: parsedThreatScore
    });

    if (success) {
      const reportTypeLabel = report_type === 'TP' ? 'true positive' : 'false positive';
      res.json({ success: true, message: `${reportTypeLabel} report submitted successfully` });
    } else {
      res.status(500).json({ error: "Failed to submit report" });
    }
  } catch (e: any) {
    console.error("Error submitting quality report:", e);
    res.status(500).json({ error: "Failed to submit report", details: e.message });
  }
});

/**
 * POST /api/feedback/true-positive
 * Submit a true positive report (alias for backward compatibility)
 */
router.post("/true-positive", authenticate, qualityFeedbackLimiter, async (req: Request, res: Response) => {
  try {
    const { event_id, reason, comment, event_timestamp, original_input, final_status, threat_score } = req.body;
    const reported_by = (req as any).user?.username || 'unknown';

    // Validate required fields
    if (!event_id || !reason) {
      return res.status(400).json({ error: "Missing required fields: event_id, reason" });
    }

    // Validate threat_score type when provided
    const parsedThreatScore = threat_score === undefined ? undefined : Number(threat_score);
    if (parsedThreatScore !== undefined && Number.isNaN(parsedThreatScore)) {
      return res.status(400).json({ error: "Invalid threat_score. Must be a number" });
    }

    // Submit the report with report_type = 'TP'
    const success = await submitFalsePositiveReport({
      event_id,
      reported_by,
      report_type: 'TP',
      reason,
      comment: comment || '',
      event_timestamp,
      original_input,
      final_status,
      threat_score: parsedThreatScore
    });

    if (success) {
      res.json({ success: true, message: "True positive report submitted successfully" });
    } else {
      res.status(500).json({ error: "Failed to submit true positive report" });
    }
  } catch (e: any) {
    console.error("Error submitting true positive report:", e);
    res.status(500).json({ error: "Failed to submit report", details: e.message });
  }
});

/**
 * POST /api/feedback/submit
 * Unified quality report endpoint (FP & TP) - for PromptAnalyzer
 */
router.post("/submit", authenticate, qualityFeedbackLimiter, async (req: Request, res: Response) => {
  try {
    const { event_id, report_type, reason, comment, report_id: providedReportId } = req.body;
    const reported_by = (req as any).user?.username || 'unknown';

    // Validate required fields
    if (!event_id || !report_type || !reason) {
      return res.status(400).json({ error: "Missing required fields: event_id, report_type, reason" });
    }

    // Validate report_type
    if (!['FP', 'TP'].includes(report_type)) {
      return res.status(400).json({ error: "Invalid report_type. Must be 'FP' or 'TP'" });
    }

    // Fetch event details from ClickHouse (events_v2 table)
    const eventDetails = await getEventDetailsV2(event_id);
    if (!eventDetails) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Use provided report_id (from plugin) or generate new UUID
    let report_id = providedReportId;
    if (!report_id) {
      // Use Node.js built-in crypto.randomUUID() - available in Node 14.17+
      const crypto = await import('crypto');
      report_id = crypto.randomUUID();
    }

    // Submit the report with full event context and UUID
    const success = await submitFalsePositiveReport({
      report_id,
      event_id,
      reported_by,
      report_type,
      reason,
      comment: comment || '',
      event_timestamp: eventDetails.timestamp,
      original_input: eventDetails.original_input,
      final_status: eventDetails.final_status,
      threat_score: eventDetails.threat_score
    });

    if (success) {
      const reportTypeLabel = report_type === 'TP' ? 'True positive' : 'False positive';
      res.json({
        success: true,
        report_id,
        message: `${reportTypeLabel} report submitted successfully`
      });
    } else {
      res.status(500).json({ error: "Failed to submit report" });
    }
  } catch (e: any) {
    console.error("Error submitting quality report:", e);
    res.status(500).json({ error: "Failed to submit report", details: e.message });
  }
});

/**
 * GET /api/feedback/stats
 * Get FP/TP statistics
 */
router.get("/stats", authenticate, async (req: Request, res: Response) => {
  try {
    const stats = await getFPStats();
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching FP stats from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch FP statistics", details: e.message });
  }
});

/**
 * GET /api/feedback/reports
 * Get paginated, filterable list of FP/TP reports
 */
router.get("/reports", authenticate, async (req: Request, res: Response) => {
  try {
    const params: FPReportListParams = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      reportType: (req.query.reportType as 'FP' | 'TP' | 'ALL') || 'ALL',
      reason: req.query.reason as string | undefined,
      reportedBy: req.query.reportedBy as string | undefined,
      minScore: req.query.minScore ? parseFloat(req.query.minScore as string) : undefined,
      maxScore: req.query.maxScore ? parseFloat(req.query.maxScore as string) : undefined,
      sortBy: (req.query.sortBy as 'report_timestamp' | 'event_timestamp' | 'threat_score') || 'report_timestamp',
      sortOrder: (req.query.sortOrder as 'ASC' | 'DESC') || 'DESC',
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50,
    };

    // Validate pagination params
    if (params.page < 1) params.page = 1;
    if (params.pageSize < 1 || params.pageSize > 100) params.pageSize = 50;

    const result = await getFPReportList(params);
    res.json(result);
  } catch (e: any) {
    console.error("Error fetching FP report list:", e);
    res.status(500).json({ error: "Failed to fetch FP reports", details: e.message });
  }
});

/**
 * GET /api/feedback/reports/:reportId
 * Get single FP report with full event context
 */
router.get("/reports/:reportId", authenticate, async (req: Request, res: Response) => {
  try {
    const reportId = req.params.reportId;

    if (!reportId) {
      return res.status(400).json({ error: "Missing reportId parameter" });
    }

    const report = await getFPReportDetails(reportId);

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json(report);
  } catch (e: any) {
    console.error("Error fetching FP report details:", e);
    res.status(500).json({ error: "Failed to fetch report details", details: e.message });
  }
});

/**
 * GET /api/feedback/stats/by-reason
 * Get FP statistics grouped by reason
 */
router.get("/stats/by-reason", authenticate, async (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as string) || '30 DAY';

    // Validate timeRange format (prevent SQL injection)
    const validRanges = ['7 DAY', '30 DAY', '90 DAY', '365 DAY'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({ error: "Invalid timeRange parameter. Use: 7 DAY, 30 DAY, 90 DAY, or 365 DAY" });
    }

    const stats = await getFPStatsByReason(timeRange);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching FP stats by reason:", e);
    res.status(500).json({ error: "Failed to fetch FP statistics by reason", details: e.message });
  }
});

/**
 * GET /api/feedback/stats/by-category
 * Get FP statistics grouped by detected category
 */
router.get("/stats/by-category", authenticate, async (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as string) || '30 DAY';

    const validRanges = ['7 DAY', '30 DAY', '90 DAY', '365 DAY'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({ error: "Invalid timeRange parameter. Use: 7 DAY, 30 DAY, 90 DAY, or 365 DAY" });
    }

    const stats = await getFPStatsByCategory(timeRange);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching FP stats by category:", e);
    res.status(500).json({ error: "Failed to fetch FP statistics by category", details: e.message });
  }
});

/**
 * GET /api/feedback/stats/by-reporter
 * Get FP statistics grouped by reporter
 */
router.get("/stats/by-reporter", authenticate, async (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as string) || '30 DAY';

    const validRanges = ['7 DAY', '30 DAY', '90 DAY', '365 DAY'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({ error: "Invalid timeRange parameter. Use: 7 DAY, 30 DAY, 90 DAY, or 365 DAY" });
    }

    const stats = await getFPStatsByReporter(timeRange);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching FP stats by reporter:", e);
    res.status(500).json({ error: "Failed to fetch FP statistics by reporter", details: e.message });
  }
});

/**
 * GET /api/feedback/stats/trend
 * Get FP trend over time
 */
router.get("/stats/trend", authenticate, async (req: Request, res: Response) => {
  try {
    const timeRange = (req.query.timeRange as string) || '30 DAY';
    const interval = (req.query.interval as 'day' | 'week') || 'day';

    const validRanges = ['7 DAY', '30 DAY', '90 DAY', '365 DAY'];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({ error: "Invalid timeRange parameter. Use: 7 DAY, 30 DAY, 90 DAY, or 365 DAY" });
    }

    if (interval !== 'day' && interval !== 'week') {
      return res.status(400).json({ error: "Invalid interval parameter. Use: day or week" });
    }

    const trend = await getFPTrend(timeRange, interval);
    res.json(trend);
  } catch (e: any) {
    console.error("Error fetching FP trend:", e);
    res.status(500).json({ error: "Failed to fetch FP trend", details: e.message });
  }
});

export default router;
