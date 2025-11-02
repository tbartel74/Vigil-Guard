import express from "express";
import cors from "cors";
import session from "express-session";
import fs from "fs";
import path from "path";
import { listFiles, readFileRaw, parseFile, saveChanges, getConfigVersions, getVersionDetails, rollbackToVersion } from "./fileOps.js";
import type { VariableSpecFile, VariableSpec } from "./schema.js";
import authRoutes from "./authRoutes.js";
import { authenticate, optionalAuth, requireConfigurationAccess } from "./auth.js";
import { getQuickStats, getQuickStats24h, getPromptList, getPromptDetails, submitFalsePositiveReport, getFPStats, searchPrompts, SearchParams, getPIITypeStats, getPIIOverview } from "./clickhouse.js";
import pluginConfigRoutes from "./pluginConfigRoutes.js";
import { initPluginConfigTable } from "./pluginConfigOps.js";
import retentionRoutes from "./retentionRoutes.js";

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
    const timeRange = (req.query.timeRange as string) || '24h';
    const interval = convertTimeRangeToInterval(timeRange);
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
    const timeRange = (req.query.timeRange as string) || '24h';
    const interval = convertTimeRangeToInterval(timeRange);
    const piiTypes = await getPIITypeStats(interval);
    res.json(piiTypes);
  } catch (e: any) {
    console.error("Error fetching PII type stats from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch PII type statistics", details: e.message });
  }
});

app.get("/api/stats/pii/overview", authenticate, async (req, res) => {
  try {
    const timeRange = (req.query.timeRange as string) || '24h';
    const interval = convertTimeRangeToInterval(timeRange);
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

// PII Detection analyze endpoint - proxy to Presidio API
app.post("/api/pii-detection/analyze", authenticate, async (req, res) => {
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

    console.error(`Presidio analyze ${errorType}:`, e.message, {
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

// Prompt analysis endpoints - requires authentication
app.get("/api/prompts/list", authenticate, async (req, res) => {
  try {
    const timeRange = (req.query.timeRange as string) || '24h';
    const interval = convertTimeRangeToInterval(timeRange);
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

// Search prompts with advanced filters - requires authentication
app.get("/api/prompts/search", authenticate, async (req, res) => {
  try {
    // Parse query parameters
    const {
      startDate,
      endDate,
      textQuery,
      clientId,  // NEW v1.7.0
      status,
      minScore,
      maxScore,
      categories,
      sortBy = 'timestamp',
      sortOrder = 'DESC',
      page = '1',
      pageSize = '25'
    } = req.query;

    // Build search params
    const searchParams: SearchParams = {
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      textQuery: textQuery as string | undefined,
      clientId: clientId as string | undefined,  // NEW v1.7.0
      status: status as 'ALLOWED' | 'SANITIZED' | 'BLOCKED' | undefined,
      minScore: minScore ? Number(minScore) : undefined,
      maxScore: maxScore ? Number(maxScore) : undefined,
      categories: categories ? (categories as string).split(',').filter(c => c.trim() !== '') : undefined,
      sortBy: sortBy as 'timestamp' | 'threat_score' | 'final_status',
      sortOrder: sortOrder as 'ASC' | 'DESC',
      page: Number(page),
      pageSize: Number(pageSize)
    };

    // Execute search
    const result = await searchPrompts(searchParams);

    // Calculate pagination metadata
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
    const {
      format = 'csv',
      startDate,
      endDate,
      textQuery,
      status,
      minScore,
      maxScore,
      categories,
      sortBy = 'timestamp',
      sortOrder = 'DESC'
    } = req.query;

    // Build search params (limit to 10000 records for export)
    const searchParams: SearchParams = {
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      textQuery: textQuery as string | undefined,
      status: status as 'ALLOWED' | 'SANITIZED' | 'BLOCKED' | undefined,
      minScore: minScore ? Number(minScore) : undefined,
      maxScore: maxScore ? Number(maxScore) : undefined,
      categories: categories ? (categories as string).split(',').filter(c => c.trim() !== '') : undefined,
      sortBy: sortBy as 'timestamp' | 'threat_score' | 'final_status',
      sortOrder: sortOrder as 'ASC' | 'DESC',
      page: 1,
      pageSize: 10000 // Export limit
    };

    // Execute search
    const result = await searchPrompts(searchParams);

    if (format === 'csv') {
      // Convert to CSV
      const csv = convertToCSV(result.rows);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="prompts-export-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } else {
      // Export as JSON
      res.header('Content-Type', 'application/json');
      res.header('Content-Disposition', `attachment; filename="prompts-export-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(result.rows);
    }
  } catch (e: any) {
    console.error("Error exporting prompts:", e);
    res.status(500).json({ error: "Export failed", details: e.message });
  }
});

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

// False Positive Feedback endpoints - requires authentication
app.post("/api/feedback/false-positive", authenticate, async (req, res) => {
  try {
    const { event_id, reason, comment, event_timestamp, original_input, final_status, threat_score } = req.body;
    const reported_by = (req as any).user?.username || 'unknown';

    // Validate required fields
    if (!event_id || !reason) {
      return res.status(400).json({ error: "Missing required fields: event_id, reason" });
    }

    // Submit the report
    const success = await submitFalsePositiveReport({
      event_id,
      reported_by,
      reason,
      comment: comment || '',
      event_timestamp,
      original_input,
      final_status,
      threat_score
    });

    if (success) {
      res.json({ success: true, message: "False positive report submitted successfully" });
    } else {
      res.status(500).json({ error: "Failed to submit false positive report" });
    }
  } catch (e: any) {
    console.error("Error submitting false positive report:", e);
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