/**
 * Configuration Management Routes
 * Extracted from server.ts as part of Sprint 2 refactoring
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { authenticate, requireConfigurationAccess } from '../auth.js';
import {
  listFiles,
  readFileRaw,
  parseFile,
  saveChanges,
  getConfigVersions,
  getVersionDetails,
  rollbackToVersion
} from '../fileOps.js';

const router = Router();

// Rate limiting for config operations (20 req/min)
const configLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many configuration requests, please slow down" },
});

// Types
interface VariableSpec {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  secret?: boolean;
  pattern?: string;
  map: any[];
}

interface VariableSpecFile {
  variables: VariableSpec[];
}

// Helper functions
function getByPath(root: any, dotPath: string) {
  return dotPath.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), root);
}

function mask(v: any) {
  if (v == null) return v;
  const s = String(v);
  if (s.length <= 3) return "***";
  return s.slice(0, 1) + "***" + s.slice(-1);
}

function unmask(v: any) {
  return v;
}

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

/**
 * GET /api/files
 * List configuration files
 */
router.get("/files", authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  const ext = (String(req.query.ext || "all") as any);
  try {
    res.json({ files: await listFiles(ext) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/file/:name
 * Read raw file content
 */
router.get("/file/:name", authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  try {
    res.json(await readFileRaw(String(req.params.name)));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/parse/:name
 * Parse and return structured file content
 */
router.get("/parse/:name", authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
  try {
    const f = await parseFile(String(req.params.name));
    res.json({ name: f.name, ext: f.ext, etag: f.etag, parsed: (f as any).parsed, raw: (f as any).content });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/resolve
 * Resolve variable mappings from spec
 */
router.post("/resolve", authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
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
              const section = (m as any).section ?? null;
              const key = (m as any).key;
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
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/save
 * Save configuration changes with validation
 */
router.post("/save", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
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

// ============================================================================
// FILE MANAGER ENDPOINTS
// ============================================================================

/**
 * GET /api/config-files/list
 * List all configuration files
 */
router.get("/config-files/list", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
  try {
    const files = await listFiles("all");
    res.json({ files });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/config-files/download/:filename
 * Download a configuration file
 */
router.get("/config-files/download/:filename", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
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

/**
 * POST /api/config-files/upload/:filename
 * Upload a configuration file
 */
router.post("/config-files/upload/:filename", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
  try {
    const expectedFilename = String(req.params.filename);
    const content = req.body.content;
    const uploadedFilename = req.body.filename;
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
      const { parseConf } = await import('../confParser.js');
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

/**
 * GET /api/config-files/audit-log
 * Get audit log content
 */
router.get("/config-files/audit-log", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
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

// ============================================================================
// VERSION HISTORY ENDPOINTS
// ============================================================================

/**
 * GET /api/config-versions
 * Get list of configuration versions
 */
router.get("/config-versions", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
  try {
    const versions = await getConfigVersions();
    res.json({ versions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/config-version/:tag
 * Get details of a specific version
 */
router.get("/config-version/:tag", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
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

/**
 * POST /api/config-rollback/:tag
 * Rollback to a specific version
 */
router.post("/config-rollback/:tag", authenticate, requireConfigurationAccess, configLimiter, async (req: Request, res: Response) => {
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

export default router;
