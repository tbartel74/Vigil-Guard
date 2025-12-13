/**
 * PII Detection Routes - Presidio API Integration
 * Extracted from server.ts as part of Sprint 2 refactoring
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireConfigurationAccess } from '../auth.js';
import { analyzeDualLanguage } from '../piiAnalyzer.js';
import { syncPiiConfig } from '../piiConfigSync.js';
import { parseFile } from '../fileOps.js';

const router = Router();

// Rate limiting for PII detection endpoints (resource-intensive)
const piiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 50, // 50 PII analysis requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many PII detection requests, please slow down" },
});

// Apply rate limiting to all PII detection endpoints
router.use(piiLimiter);

/**
 * GET /api/pii-detection/status
 * PII Detection service health check
 */
router.get("/status", authenticate, async (req: Request, res: Response) => {
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

/**
 * GET /api/pii-detection/entity-types
 * List of supported PII entity types
 */
router.get("/entity-types", authenticate, async (req: Request, res: Response) => {
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

/**
 * POST /api/pii-detection/analyze
 * PII Detection analyze endpoint (dual-language by default, legacy proxy via query/body)
 */
router.post("/analyze", authenticate, async (req: Request, res: Response) => {
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

/**
 * POST /api/pii-detection/analyze-full
 * PII Detection analyze endpoint - dual-language workflow-parity
 */
router.post("/analyze-full", authenticate, async (req: Request, res: Response) => {
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

/**
 * POST /api/pii-detection/save-config
 * Save PII configuration
 */
router.post("/save-config", authenticate, requireConfigurationAccess, async (req: Request, res: Response) => {
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

/**
 * GET /api/pii-detection/validate-config
 * Validate PII configuration consistency
 */
router.get("/validate-config", authenticate, requireConfigurationAccess, async (_req: Request, res: Response) => {
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

export default router;
