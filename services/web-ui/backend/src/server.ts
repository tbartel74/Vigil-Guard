import express from "express";
import cors from "cors";
import session from "express-session";
import fs from "fs";
import path from "path";
import { listFiles, readFileRaw, parseFile, saveChanges, getConfigVersions, getVersionDetails, rollbackToVersion } from "./fileOps.js";
import type { VariableSpecFile, VariableSpec } from "./schema.js";
import authRoutes from "./authRoutes.js";
import { authenticate, optionalAuth, requireConfigurationAccess } from "./auth.js";
import { getQuickStats, getQuickStats24h, getPromptList, getPromptDetails, submitFalsePositiveReport, getFPStats, searchPrompts, SearchParams, getPIITypeStats, getPIIOverview, getFPReportList, FPReportListParams, getFPReportDetails, getFPStatsByReason, getFPStatsByCategory, getFPStatsByReporter, getFPTrend } from "./clickhouse.js";
import pluginConfigRoutes from "./pluginConfigRoutes.js";
import { initPluginConfigTable } from "./pluginConfigOps.js";
import retentionRoutes from "./retentionRoutes.js";
import { analyzeDualLanguage } from "./piiAnalyzer.js";
import { syncPiiConfig } from "./piiConfigSync.js";

const app = express();
const PORT = 8787;

// Trust first proxy (Caddy) for correct client IP detection
app.set('trust proxy', 1);

// Validate SESSION_SECRET is set (CRITICAL SECURITY REQUIREMENT)
if (!process.env.SESSION_SECRET) {
  console.error("❌ FATAL: SESSION_SECRET environment variable is not set!");
  console.error("This is a critical security requirement for JWT token encryption.");
  console.error("Please set SESSION_SECRET in your .env file.");
  console.error("");
  console.error("To fix this issue:");
  console.error("  1. Run: ./install.sh (will auto-generate secure passwords)");
  console.error("  2. Or manually generate: openssl rand -base64 64 | tr -d '/+=' | head -c 64");
  console.error("  3. Add to .env: SESSION_SECRET=<generated-value>");
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  console.warn("⚠️  WARNING: SESSION_SECRET is too short!");
  console.warn("Minimum recommended length: 32 characters");
  console.warn("Current length:", process.env.SESSION_SECRET.length);
  console.warn("Use: openssl rand -base64 64 | tr -d '/+=' | head -c 64");
  console.warn("");
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,  // NO FALLBACK - fail-secure
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}) as unknown as express.RequestHandler);

// Browser origin will be http://localhost (Caddy on :80)
// We also allow :8080 in case you expose a dev-port
app.use(
  cors({
    origin: [/^http:\/\/localhost(:\d+)?$/],
    credentials: true // Enable credentials for authentication
  })
);
app.use(express.json({ limit: "1mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Authentication routes (public)
app.use("/api/auth", authRoutes);

// Plugin configuration routes (public /plugin-config, protected /plugin-config/settings)
app.use("/api", pluginConfigRoutes);

// Retention policy routes (protected - requires can_view_configuration)
app.use("/api/retention", retentionRoutes);

// Stats endpoint - requires authentication
app.get("/api/stats/24h", authenticate, async (req, res) => {
  try {
    const interval = getTimeRangeInterval(req);
    const stats = await getQuickStats(interval);
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching stats from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch statistics", details: e.message });
  }
});

// PII Statistics endpoints (v1.7.0) - requires authentication
app.get("/api/stats/pii/types", authenticate, async (req, res) => {
  try {
    const interval = getTimeRangeInterval(req);
    const piiTypes = await getPIITypeStats(interval);
    res.json(piiTypes);
  } catch (e: any) {
    console.error("Error fetching PII type stats from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch PII type statistics", details: e.message });
  }
});

app.get("/api/stats/pii/overview", authenticate, async (req, res) => {
  try {
    const interval = getTimeRangeInterval(req);
    const piiOverview = await getPIIOverview(interval);
    res.json(piiOverview);
  } catch (e: any) {
    console.error("Error fetching PII overview from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch PII overview", details: e.message });
  }
});

// Prompt Guard health check endpoint - requires authentication
app.get("/api/prompt-guard/health", authenticate, async (req, res) => {
  const promptGuardUrl = process.env.PROMPT_GUARD_URL || 'http://vigil-prompt-guard-api:8000';

  try {
    const response = await fetch(`${promptGuardUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      console.error(`Prompt Guard health check failed: HTTP ${response.status}`);
      return res.status(503).json({
        status: 'unhealthy',
        model_loaded: false,
        http_status: response.status,
        error: `Service returned HTTP ${response.status}`
      });
    }

    const data = await response.json();
    res.json({ ...data, status: 'healthy' });

  } catch (e: any) {
    const errorType = e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';

    console.error(`Prompt Guard health check ${errorType}:`, e.message, {
      error_id: 'PROMPT_GUARD_HEALTH_FAILED',
      url: promptGuardUrl,
      error_type: errorType
    });

    // Return 503 Service Unavailable for monitoring systems
    res.status(503).json({
      status: 'unhealthy',
      model_loaded: false,
      error: e.message,
      error_type: errorType
    });
  }
});

// ============================================================================
// PII DETECTION - PRESIDIO API INTEGRATION
// ============================================================================

// PII Detection service health check endpoint - requires authentication
app.get("/api/pii-detection/status", authenticate, async (req, res) => {
  const presidioUrl = process.env.PRESIDIO_URL || 'http://vigil-presidio-pii:5001';

  try {
    const response = await fetch(`${presidioUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      console.error(`Presidio health check failed: HTTP ${response.status}`);
      return res.status(503).json({
        status: 'offline',
        fallback: 'regex',
        http_status: response.status,
        error: `HTTP ${response.status}`
      });
    }

    const data = await response.json();
    res.json({
      status: 'online',
      version: data.version || 'unknown',
      recognizers_loaded: data.recognizers_loaded || 0,
      spacy_models: data.spacy_models || []
    });

  } catch (e: any) {
    const errorType = e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';

    console.error(`Presidio PII health check ${errorType}:`, e.message, {
      error_id: 'PRESIDIO_HEALTH_FAILED',
      url: presidioUrl,
      error_type: errorType
    });

    res.status(503).json({
      status: 'offline',
      fallback: 'regex',
      error: e.message,
      error_type: errorType
    });
  }
});

// PII Detection entity types list - requires authentication
app.get("/api/pii-detection/entity-types", authenticate, async (req, res) => {
  try {
    // Static list of supported PII entity types (from unified_config.json + custom recognizers)
    const entityTypes = [
      {
        id: 'EMAIL_ADDRESS',
        name: 'Email Address',
        category: 'contact',
        description: 'Email addresses in standard format (user@domain.com)'
      },
      {
        id: 'PHONE_NUMBER',
        name: 'Phone Number',
        category: 'contact',
        description: 'Phone numbers (international, local, formatted)'
      },
      {
        id: 'PERSON',
        name: 'Person Name',
        category: 'identity',
        description: 'Full names detected via NLP (context-aware)'
      },
      {
        id: 'PL_PESEL',
        name: 'PESEL (Polish National ID)',
        category: 'identity',
        description: '11-digit Polish identification number with checksum validation'
      },
      {
        id: 'PL_NIP',
        name: 'NIP (Polish Tax ID)',
        category: 'business',
        description: '10-digit Polish tax identification number with checksum validation'
      },
      {
        id: 'PL_REGON',
        name: 'REGON (Polish Business ID)',
        category: 'business',
        description: '9 or 14-digit Polish business registry number with checksum validation'
      },
      {
        id: 'PL_ID_CARD',
        name: 'Polish ID Card Number',
        category: 'identity',
        description: 'Polish identity card number (format: ABC123456)'
      },
      {
        id: 'CREDIT_CARD',
        name: 'Credit Card Number',
        category: 'financial',
        description: 'Credit card numbers (Visa, MasterCard, Amex) with Luhn checksum validation'
      },
      {
        id: 'IBAN_CODE',
        name: 'IBAN',
        category: 'financial',
        description: 'International Bank Account Number'
      },
      {
        id: 'IP_ADDRESS',
        name: 'IP Address',
        category: 'technical',
        description: 'IPv4 and IPv6 addresses'
      },
      {
        id: 'URL',
        name: 'URL',
        category: 'technical',
        description: 'Web URLs and domain names'
      }
    ];

    res.json({
      entities: entityTypes,
      total: entityTypes.length,
      categories: ['contact', 'identity', 'business', 'financial', 'technical']
    });
  } catch (e: any) {
    console.error("Error fetching PII entity types:", e);
    res.status(500).json({ error: "Failed to fetch entity types", details: e.message });
  }
});

// PII Detection analyze endpoint (dual-language by default, legacy proxy via query/body)
app.post("/api/pii-detection/analyze", authenticate, async (req, res) => {
  const useLegacyProxy = req.query.mode === 'legacy' || req.body?.legacy === true;

  if (!useLegacyProxy) {
    // Input validation (DoS protection)
    const text = req.body?.text;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: "Invalid input",
        message: "Field 'text' is required and must be a string"
      });
    }

    const MAX_TEXT_LENGTH = 20000; // 20KB limit (same as frontend)
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        error: "Input too large",
        message: `Text length (${text.length}) exceeds maximum allowed (${MAX_TEXT_LENGTH} characters)`
      });
    }

    // Validate entities array (optional field)
    if (req.body.entities !== undefined) {
      if (!Array.isArray(req.body.entities)) {
        return res.status(400).json({
          error: "Invalid input",
          message: "Field 'entities' must be an array"
        });
      }

      const MAX_ENTITIES = 50;
      if (req.body.entities.length > MAX_ENTITIES) {
        return res.status(400).json({
          error: "Too many entities requested",
          message: `Entity list length (${req.body.entities.length}) exceeds maximum (${MAX_ENTITIES})`
        });
      }
    }

    try {
      const result = await analyzeDualLanguage(req.body || {});
      return res.json(result);
    } catch (error: any) {
      // Distinguish input errors from service errors
      const isInputError = error?.message && /text is required|invalid/i.test(error.message);
      const status = isInputError ? 400 : 502;

      console.error("Dual-language PII analyze (default route) failed:", error);
      return res.status(status).json({
        error: isInputError ? "Invalid input" : "Dual-language PII analysis failed",
        message: error.message || "Unknown error"
      });
    }
  }

  const presidioUrl = process.env.PRESIDIO_URL || 'http://vigil-presidio-pii:5001';

  try {
    const response = await fetch(`${presidioUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.error(`Presidio analyze failed: HTTP ${response.status}`);
      return res.status(response.status).json({
        error: 'PII analysis failed',
        http_status: response.status,
        message: await response.text()
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (e: any) {
    const errorType = e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';

    console.error(`Legacy Presidio analyze ${errorType}:`, e.message, {
      error_id: 'PRESIDIO_ANALYZE_FAILED',
      url: `${presidioUrl}/analyze`,
      error_type: errorType
    });

    res.status(503).json({
      error: 'PII analysis service unavailable',
      error_type: errorType,
      message: e.message
    });
  }
});

// PII Detection analyze endpoint - dual-language workflow-parity
app.post("/api/pii-detection/analyze-full", authenticate, async (req, res) => {
  // Input validation (same as /analyze endpoint)
  const text = req.body?.text;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({
      error: "Invalid input",
      message: "Field 'text' is required and must be a string"
    });
  }

  const MAX_TEXT_LENGTH = 20000;
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({
      error: "Input too large",
      message: `Text length (${text.length}) exceeds maximum allowed (${MAX_TEXT_LENGTH} characters)`
    });
  }

  if (req.body.entities !== undefined) {
    if (!Array.isArray(req.body.entities)) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Field 'entities' must be an array"
      });
    }

    const MAX_ENTITIES = 50;
    if (req.body.entities.length > MAX_ENTITIES) {
      return res.status(400).json({
        error: "Too many entities requested",
        message: `Entity list length (${req.body.entities.length}) exceeds maximum (${MAX_ENTITIES})`
      });
    }
  }

  try {
    const result = await analyzeDualLanguage(req.body || {});
    res.json(result);
  } catch (error: any) {
    const isInputError = error?.message && /text is required|invalid/i.test(error.message);
    const status = isInputError ? 400 : 502;
    console.error("Dual-language PII analyze failed:", error);
    res.status(status).json({
      error: isInputError ? "Invalid input" : "Dual-language PII analysis failed",
      message: error.message || "Unknown error"
    });
  }
});

app.post("/api/pii-detection/save-config", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const { etags, ...configPayload } = req.body || {};
    const author = (req as any).user?.username || "unknown";
    const result = await syncPiiConfig(configPayload, author, etags);
    res.json({
      success: true,
      etags: result.etags
    });
  } catch (e: any) {
    if (e.code === "ETAG_MISMATCH") {
      return res.status(412).json({
        error: "ETAG_MISMATCH",
        expected: e.expected,
        actual: e.actual
      });
    }
    if (e.code === "VALIDATION") {
      return res.status(400).json({ error: e.message });
    }
    console.error("PII config sync failed:", e);
    res.status(500).json({
      error: "Failed to synchronize PII configuration",
      message: e.message
    });
  }
});

/**
 * Extract Presidio-only entities from pii.conf
 * These are entities marked with presidio_only: true flag in __all_rules
 * Dynamically derived from config file to avoid hardcoded duplication
 */
function getPresidioOnlyEntities(piiConfData: any): Set<string> {
  const allRules: any[] = Array.isArray(piiConfData?.__all_rules) ? piiConfData.__all_rules : [];
  const presidioOnlyEntities = allRules
    .filter(rule => rule?.presidio_only === true)
    .map(rule => rule?.target_entity)
    .filter(Boolean);

  return new Set(presidioOnlyEntities);
}

app.get("/api/pii-detection/validate-config", authenticate, requireConfigurationAccess, async (_req, res) => {
  try {
    const unifiedFile = await parseFile("unified_config.json");
    const unifiedEntities: string[] = unifiedFile.parsed?.pii_detection?.entities || [];

    const piiConfFile = await parseFile("pii.conf");
    const piiConfRules: any[] = Array.isArray(piiConfFile.parsed?.rules) ? piiConfFile.parsed.rules : [];
    const piiConfEntities = [...new Set(piiConfRules.map((rule) => rule?.target_entity).filter(Boolean))];

    // CRITICAL: Derive Presidio-only entities from pii.conf instead of hardcoding
    // This eliminates duplication between backend validation and workflow logic
    // Single source of truth: pii.conf.__all_rules[].presidio_only flag
    const PRESIDIO_ONLY_ENTITIES = getPresidioOnlyEntities(piiConfFile.parsed);

    const unifiedSet = new Set(unifiedEntities);
    const piiConfSet = new Set(piiConfEntities);

    const rawUnifiedOnly = unifiedEntities.filter((entity) => !piiConfSet.has(entity));
    const rawPiiConfOnly = piiConfEntities.filter((entity) => !unifiedSet.has(entity));

    const presidioOnly = rawUnifiedOnly.filter((entity) => PRESIDIO_ONLY_ENTITIES.has(entity));
    const inUnifiedOnly = rawUnifiedOnly.filter((entity) => !PRESIDIO_ONLY_ENTITIES.has(entity));
    const inPiiConfOnly = rawPiiConfOnly.filter((entity) => !PRESIDIO_ONLY_ENTITIES.has(entity));
    const consistent = inUnifiedOnly.length === 0 && inPiiConfOnly.length === 0;

    res.json({
      consistent,
      unified_config: {
        count: unifiedEntities.length,
        entities: unifiedEntities
      },
      pii_conf: {
        count: piiConfEntities.length,
        entities: piiConfEntities
      },
      discrepancies: consistent
        ? null
        : {
            in_unified_only: inUnifiedOnly,
            in_pii_conf_only: inPiiConfOnly
          },
      presidio_only_entities: presidioOnly
    });
  } catch (error: any) {
    console.error("[PII Config Validation] Failed:", error);
    res.status(500).json({
      error: "Failed to validate PII configuration",
      message: error.message
    });
  }
});

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
function getTimeRangeInterval(req: express.Request): string {
  const timeRange = (req.query.timeRange as string) || '24h';
  return convertTimeRangeToInterval(timeRange);
}

// Prompt analysis endpoints - requires authentication
app.get("/api/prompts/list", authenticate, async (req, res) => {
  try {
    const interval = getTimeRangeInterval(req);
    const prompts = await getPromptList(interval);
    res.json(prompts);
  } catch (e: any) {
    console.error("Error fetching prompt list from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch prompts", details: e.message });
  }
});

// ============================================================================
// INVESTIGATION - ADVANCED PROMPT SEARCH
// ============================================================================

// Helper to build search params from query string
function buildSearchParams(query: any): SearchParams {
  const {
    startDate,
    endDate,
    textQuery,
    clientId,
    status,
    minScore,
    maxScore,
    categories,
    sortBy = 'timestamp',
    sortOrder = 'DESC',
    page = '1',
    pageSize = '25'
  } = query;

  return {
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    textQuery: textQuery as string | undefined,
    clientId: clientId as string | undefined,
    status: status as 'ALLOWED' | 'SANITIZED' | 'BLOCKED' | undefined,
    minScore: minScore ? Number(minScore) : undefined,
    maxScore: maxScore ? Number(maxScore) : undefined,
    categories: parseCategories(categories),
    sortBy: sortBy as 'timestamp' | 'threat_score' | 'final_status',
    sortOrder: sortOrder as 'ASC' | 'DESC',
    page: Number(page),
    pageSize: Number(pageSize)
  };
}

function parseCategories(categories: any): string[] | undefined {
  if (!categories) return undefined;
  return (categories as string).split(',').filter(c => c.trim() !== '');
}

// Search prompts with advanced filters - requires authentication
app.get("/api/prompts/search", authenticate, async (req, res) => {
  try {
    const searchParams = buildSearchParams(req.query);
    const result = await searchPrompts(searchParams);
    const pages = Math.ceil(result.total / searchParams.pageSize);

    res.json({
      results: result.rows,
      total: result.total,
      page: searchParams.page,
      pageSize: searchParams.pageSize,
      pages
    });
  } catch (e: any) {
    console.error("Error searching prompts:", e);
    res.status(500).json({ error: "Search failed", details: e.message });
  }
});

// Export prompts to CSV or JSON - requires authentication
app.get("/api/prompts/export", authenticate, async (req, res) => {
  try {
    const format = (req.query.format as string) || 'csv';
    const searchParams = buildExportSearchParams(req.query);
    const result = await searchPrompts(searchParams);

    if (format === 'csv') {
      sendCSVResponse(res, result.rows);
    } else {
      sendJSONResponse(res, result.rows);
    }
  } catch (e: any) {
    console.error("Error exporting prompts:", e);
    res.status(500).json({ error: "Export failed", details: e.message });
  }
});

function buildExportSearchParams(query: any): SearchParams {
  const params = buildSearchParams(query);
  // Override pagination for export
  return {
    ...params,
    page: 1,
    pageSize: 10000 // Export limit
  };
}

function sendCSVResponse(res: express.Response, rows: any[]): void {
  const csv = convertToCSV(rows);
  const filename = `prompts-export-${new Date().toISOString().split('T')[0]}.csv`;
  res.header('Content-Type', 'text/csv');
  res.header('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function sendJSONResponse(res: express.Response, rows: any[]): void {
  const filename = `prompts-export-${new Date().toISOString().split('T')[0]}.json`;
  res.header('Content-Type', 'application/json');
  res.header('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(rows);
}

// Helper function to convert search results to CSV
function convertToCSV(rows: any[]): string {
  if (rows.length === 0) {
    return 'timestamp,event_id,status,threat_score,prompt_input,categories\n';
  }

  // CSV header
  const header = 'timestamp,event_id,status,threat_score,prompt_input,categories\n';

  // CSV rows
  const csvRows = rows.map(row => {
    const timestamp = row.timestamp || '';
    const eventId = row.event_id || '';
    const status = row.final_status || '';
    const score = row.threat_score || 0;
    const prompt = (row.prompt_input || '').replace(/"/g, '""'); // Escape quotes
    const categories = (row.detected_categories || []).join('; ');

    return `"${timestamp}","${eventId}","${status}",${score},"${prompt}","${categories}"`;
  }).join('\n');

  return header + csvRows;
}

// Get specific prompt details by ID (MUST be after /search and /export!)
app.get("/api/prompts/:id", authenticate, async (req, res) => {
  try {
    const eventId = req.params.id;
    const details = await getPromptDetails(eventId);

    if (!details) {
      return res.status(404).json({ error: "Prompt not found" });
    }

    res.json(details);
  } catch (e: any) {
    console.error("Error fetching prompt details from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch prompt details", details: e.message });
  }
});

// Quality Feedback endpoints (FP & TP) - requires authentication
app.post("/api/feedback/false-positive", authenticate, async (req, res) => {
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
      threat_score
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

// True Positive endpoint (alias for backward compatibility and clarity)
app.post("/api/feedback/true-positive", authenticate, async (req, res) => {
  try {
    const { event_id, reason, comment, event_timestamp, original_input, final_status, threat_score } = req.body;
    const reported_by = (req as any).user?.username || 'unknown';

    // Validate required fields
    if (!event_id || !reason) {
      return res.status(400).json({ error: "Missing required fields: event_id, reason" });
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
      threat_score
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

// Unified quality report endpoint (FP & TP) - NEW for PromptAnalyzer
app.post("/api/feedback/submit", authenticate, async (req, res) => {
  try {
    const { event_id, report_type, reason, comment } = req.body;
    const reported_by = (req as any).user?.username || 'unknown';

    // Validate required fields
    if (!event_id || !report_type || !reason) {
      return res.status(400).json({ error: "Missing required fields: event_id, report_type, reason" });
    }

    // Validate report_type
    if (!['FP', 'TP'].includes(report_type)) {
      return res.status(400).json({ error: "Invalid report_type. Must be 'FP' or 'TP'" });
    }

    // Fetch event details from ClickHouse
    const eventDetails = await getPromptDetails(event_id);
    if (!eventDetails) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Submit the report with full event context
    const success = await submitFalsePositiveReport({
      event_id,
      reported_by,
      report_type,
      reason,
      comment: comment || '',
      event_timestamp: eventDetails.timestamp,
      original_input: eventDetails.input_raw,
      final_status: eventDetails.final_status,
      threat_score: eventDetails.sanitizer_score
    });

    if (success) {
      // Generate unique report ID
      const report_id = `${report_type}-${event_id}-${Date.now()}`;
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

app.get("/api/feedback/stats", authenticate, async (req, res) => {
  try {
    const stats = await getFPStats();
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching FP stats from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch FP statistics", details: e.message });
  }
});

// ============================================================================
// FP DETAILED REPORTING ENDPOINTS
// ============================================================================

/**
 * Get paginated, filterable list of FP/TP reports
 * Query params: startDate, endDate, reportType, reason, reportedBy, minScore, maxScore, sortBy, sortOrder, page, pageSize
 */
app.get("/api/feedback/reports", authenticate, async (req, res) => {
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
 * Get single FP report with full event context
 * Params: reportId (UUID)
 */
app.get("/api/feedback/reports/:reportId", authenticate, async (req, res) => {
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
 * Get FP statistics grouped by reason
 * Query params: timeRange (e.g., "7 DAY", "30 DAY", "90 DAY")
 */
app.get("/api/feedback/stats/by-reason", authenticate, async (req, res) => {
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
 * Get FP statistics grouped by detected category
 * Query params: timeRange (e.g., "7 DAY", "30 DAY", "90 DAY")
 */
app.get("/api/feedback/stats/by-category", authenticate, async (req, res) => {
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
 * Get FP statistics grouped by reporter
 * Query params: timeRange (e.g., "7 DAY", "30 DAY", "90 DAY")
 */
app.get("/api/feedback/stats/by-reporter", authenticate, async (req, res) => {
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
 * Get FP trend over time
 * Query params: timeRange (e.g., "7 DAY", "30 DAY"), interval ("day" or "week")
 */
app.get("/api/feedback/stats/trend", authenticate, async (req, res) => {
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

// Protected configuration endpoints - require authentication and configuration access
app.get("/api/files", authenticate, requireConfigurationAccess, async (req, res) => {
  const ext = (String(req.query.ext || "all") as any);
  try { res.json({ files: await listFiles(ext) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/file/:name", authenticate, requireConfigurationAccess, async (req, res) => {
  try { res.json(await readFileRaw(String(req.params.name))); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get("/api/parse/:name", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const f = await parseFile(String(req.params.name));
    res.json({ name: f.name, ext: f.ext, etag: f.etag, parsed: (f as any).parsed, raw: (f as any).content });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/resolve", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const spec: VariableSpecFile = req.body.spec;
    if (!spec?.variables) return res.status(400).json({ error: "Missing spec" });

    const cache = new Map<string, any>();
    async function loadParsed(name: string) {
      if (cache.has(name)) return cache.get(name);
      const p = await parseFile(name);
      cache.set(name, p);
      return p;
    }

    const results = await Promise.all(
      spec.variables.map(async (v) => {
        const mappings = await Promise.all(
          v.map.map(async (m) => {
            const file = await loadParsed((m as any).file);
            let value: any;
            if (file.ext === ".json" && (m as any).path) {
              value = getByPath(file.parsed, (m as any).path);
            } else if (file.ext === ".conf") {
              const section = (m as any).section ?? null; const key = (m as any).key;
              value = section ? file.parsed?.[section]?.[key] : file.parsed?.[key];
            }
            const masked = v.secret ? mask(value) : value;
            return { source: m, value: masked };
          })
        );
        const valid = validateVar(v, mappings.map(x => v.secret ? unmask(x.value) : x.value));
        return { variable: v.name, label: v.label, type: v.type, required: !!v.required, mappings, valid };
      })
    );

    res.json({ results });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post("/api/save", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const { changes, changeTag, spec, ifMatch } = req.body;
    if (!changeTag) return res.status(400).json({ error: "Missing changeTag" });
    const author = (req as any).user?.username || 'unknown';
    const validate = (file: string, updates: any[]) => validateUpdates(spec, updates);
    const out = await saveChanges({ changes, changeTag, ifMatch, validate, author });
    res.json(out);
  } catch (e: any) {
    if (e.code === "ETAG_MISMATCH") return res.status(409).json({ error: "File changed on disk", expected: e.expected, actual: e.actual });
    if (e.code === "VALIDATION") return res.status(400).json({ error: e.message });
    res.status(400).json({ error: e.message });
  }
});

// File Manager endpoints - requires authentication and configuration access
app.get("/api/config-files/list", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const files = await listFiles("all");
    res.json({ files });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/config-files/download/:filename", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const filename = String(req.params.filename);
    const fileData = await readFileRaw(filename);

    // Set headers for download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileData.content);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/config-files/upload/:filename", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const expectedFilename = String(req.params.filename);
    const content = req.body.content;
    const uploadedFilename = req.body.filename; // Frontend will send the actual filename
    const username = (req as any).user?.username || 'unknown';

    if (!content) {
      return res.status(400).json({ error: "Missing file content" });
    }

    // Validate filename matches
    if (uploadedFilename && uploadedFilename !== expectedFilename) {
      return res.status(400).json({
        error: `Filename mismatch: expected "${expectedFilename}" but got "${uploadedFilename}"`
      });
    }

    // Determine payload type from file extension
    const ext = path.extname(expectedFilename);
    const payloadType = ext === '.json' ? 'json' : 'conf';

    // For file uploads, we replace the entire content
    // Parse the new content and generate appropriate updates
    let updates: any[];
    if (payloadType === 'json') {
      // For JSON files, parse and create a single root-level replacement
      const parsed = JSON.parse(content);
      updates = Object.keys(parsed).map(key => ({ path: key, value: parsed[key] }));
    } else {
      // For CONF files, parse and create section/key updates
      const { parseConf } = await import('./confParser.js');
      const doc = parseConf(content);
      updates = [];
      for (const line of doc.lines) {
        if (line.kind === 'kv') {
          updates.push({ section: line.section, key: line.key, value: line.value });
        }
      }
    }

    // Save the file using proper saveChanges API
    const result = await saveChanges({
      changes: [{ file: expectedFilename, payloadType, updates }],
      changeTag: `File upload by ${username}`,
      validate: () => ({ ok: true })
    });

    // Log to audit.log
    const targetDir = process.env.TARGET_DIR || '/config';
    const auditLogPath = path.join(targetDir, 'audit.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] User: ${username} | Action: FILE_UPLOAD | File: ${expectedFilename} | Size: ${content.length} bytes\n`;

    fs.appendFileSync(auditLogPath, logEntry);

    res.json({ success: true, message: "File uploaded successfully", result });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/config-files/audit-log", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const targetDir = process.env.TARGET_DIR || '/config';
    const auditLogPath = path.join(targetDir, 'audit.log');

    // Create audit.log if it doesn't exist
    if (!fs.existsSync(auditLogPath)) {
      const initEntry = `[${new Date().toISOString()}] Audit log initialized\n`;
      fs.writeFileSync(auditLogPath, initEntry);
    }

    const content = fs.readFileSync(auditLogPath, 'utf-8');
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Configuration Version History endpoints - requires authentication and configuration access
app.get("/api/config-versions", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const versions = await getConfigVersions();
    res.json({ versions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/config-version/:tag", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const tag = String(req.params.tag);
    const version = await getVersionDetails(tag);

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    res.json(version);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/config-rollback/:tag", authenticate, requireConfigurationAccess, async (req, res) => {
  try {
    const tag = String(req.params.tag);
    const result = await rollbackToVersion(tag);
    res.json(result);
  } catch (e: any) {
    if (e.message.includes("not found")) {
      return res.status(404).json({ error: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);

  // Initialize plugin configuration database table
  try {
    initPluginConfigTable();
    console.log('[Server] Plugin configuration table initialized');
  } catch (error) {
    console.error('[Server] Failed to initialize plugin config table:', error);
  }
});

function getByPath(root: any, dotPath: string) {
  return dotPath.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), root);
}
function mask(v: any) { if (v == null) return v; const s = String(v); if (s.length <= 3) return "***"; return s.slice(0,1)+"***"+s.slice(-1); }
function unmask(v: any) { return v; }
function validateVar(v: VariableSpec, values: any[]) {
  const hasAny = values.some((x) => x !== undefined && x !== null && x !== "");
  if (v.required && !hasAny) return { ok: false, reason: "required_missing" };
  if (v.pattern) {
    const re = new RegExp(v.pattern);
    const ok = values.filter((x) => x != null).every((x) => re.test(String(x)));
    if (!ok) return { ok: false, reason: "pattern_mismatch" };
  }
  return { ok: true };
}
function validateUpdates(_spec: VariableSpecFile | undefined, _updates: any[]) {
  return { ok: true };
}
