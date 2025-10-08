import express from "express";
import cors from "cors";
import session from "express-session";
import fs from "fs";
import path from "path";
import { listFiles, readFileRaw, parseFile, saveChanges } from "./fileOps.js";
import type { VariableSpecFile, VariableSpec } from "./schema.js";
import authRoutes from "./authRoutes.js";
import { authenticate, optionalAuth, requireConfigurationAccess } from "./auth.js";
import { getQuickStats24h, getPromptList, getPromptDetails } from "./clickhouse.js";

const app = express();
const PORT = 8787;

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'vigil-guard-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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

// Stats endpoint - requires authentication
app.get("/api/stats/24h", authenticate, async (req, res) => {
  try {
    const stats = await getQuickStats24h();
    res.json(stats);
  } catch (e: any) {
    console.error("Error fetching stats from ClickHouse:", e);
    res.status(500).json({ error: "Failed to fetch statistics", details: e.message });
  }
});

// Prompt Guard health check endpoint - requires authentication
app.get("/api/prompt-guard/health", authenticate, async (req, res) => {
  try {
    const promptGuardUrl = process.env.PROMPT_GUARD_URL || 'http://vigil-prompt-guard-api:8000';
    const response = await fetch(`${promptGuardUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      return res.json({ status: 'unhealthy', model_loaded: false });
    }

    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    console.error("Error checking Prompt Guard health:", e);
    res.json({ status: 'unhealthy', model_loaded: false, error: e.message });
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
    const validate = (file: string, updates: any[]) => validateUpdates(spec, updates);
    const out = await saveChanges({ changes, changeTag, ifMatch, validate });
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

app.listen(PORT, () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
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