import { saveChanges, parseFile, restoreFileFromBackup } from "./fileOps.js";

type DetectionMode = "balanced" | "high_security" | "high_precision";

interface PiiConfigUpdatePayload {
  enabled?: boolean;
  confidenceThreshold?: number;
  enabledEntities?: string[];
  redactionMode?: "replace" | "hash" | "mask";
  fallbackToRegex?: boolean;
  languages?: string[];
  detectionMode?: DetectionMode;
  contextEnhancement?: boolean;
  redactionTokens?: Record<string, string>;
}

interface SyncResult {
  etags: Record<string, string>;
}

const DEFAULT_LANGUAGES = ["pl", "en"];
const DEFAULT_DETECTION_MODE: DetectionMode = "balanced";
const PRESIDIO_URL = process.env.PRESIDIO_URL || "http://vigil-presidio-pii:5001";

function summarizeEntities(entities?: string[] | null) {
  if (!Array.isArray(entities) || entities.length === 0) {
    return "∅ (0)";
  }
  const preview = entities.slice(0, 6).join(", ");
  return entities.length > 6 ? `${preview} … (${entities.length})` : `${preview} (${entities.length})`;
}

// Known PII entity types - synchronized with Presidio recognizers and pii.conf
// This whitelist is derived from:
// - services/presidio-pii-api/config/recognizers.yaml (supported_entity)
// - services/workflow/config/pii.conf (target_entity)
// - services/workflow/config/unified_config.json (pii_detection.entities)
const KNOWN_ENTITIES = [
  // Contact Information
  'EMAIL_ADDRESS', 'PHONE_NUMBER',

  // Identity Documents
  'PERSON', 'PL_PESEL', 'PL_NIP', 'PL_REGON', 'PL_ID_CARD',

  // Financial
  'CREDIT_CARD', 'IBAN_CODE',  // Fixed: was 'IBAN', should be 'IBAN_CODE'

  // International Identity Numbers
  'US_SSN', 'UK_NHS', 'CA_SIN', 'AU_MEDICARE', 'AU_TFN',
  'UK_NINO', 'US_PASSPORT',
  'US_DRIVER_LICENSE',  // Added: missing from original whitelist
  'PASSPORT',           // Added: missing from original whitelist

  // Other PII
  'DATE_TIME', 'URL', 'IP_ADDRESS', 'LOCATION', 'ORGANIZATION'
];

export async function syncPiiConfig(
  payload: PiiConfigUpdatePayload,
  author: string,
  etags?: Record<string, string>
): Promise<SyncResult> {
  const validationErrors = validatePayload(payload);
  if (validationErrors.length) {
    const err = new Error(validationErrors.join("; "));
    (err as any).code = "VALIDATION";
    throw err;
  }

  const unifiedFile = await parseFile("unified_config.json");
  const currentUnified = unifiedFile.parsed?.pii_detection ?? {};

  const piiConfFile = await parseFile("pii.conf");
  const currentPiiConf = piiConfFile.parsed ?? {};

  const enabledEntities: string[] = Array.isArray(payload.enabledEntities)
    ? payload.enabledEntities
    : currentUnified.entities || [];
  const enabledSet = new Set<string>(enabledEntities);

  const detectionMode = payload.detectionMode || currentUnified.detection_mode || DEFAULT_DETECTION_MODE;
  const contextEnhancement =
    payload.contextEnhancement ??
    (typeof currentUnified.context_enhancement === "boolean" ? currentUnified.context_enhancement : true);
  const redactionTokens = {
    ...(currentUnified.redaction_tokens || {}),
    ...(payload.redactionTokens || {})
  };

  const unifiedUpdates = [
    { path: "pii_detection.enabled", value: payload.enabled ?? (currentUnified.enabled !== false) },
    { path: "pii_detection.confidence_threshold", value: payload.confidenceThreshold ?? currentUnified.confidence_threshold ?? 0.7 },
    { path: "pii_detection.entities", value: enabledEntities },
    { path: "pii_detection.redaction_mode", value: payload.redactionMode || currentUnified.redaction_mode || "replace" },
    { path: "pii_detection.fallback_to_regex", value: payload.fallbackToRegex ?? (currentUnified.fallback_to_regex !== false) },
    { path: "pii_detection.languages", value: payload.languages && payload.languages.length ? payload.languages : currentUnified.languages || DEFAULT_LANGUAGES },
    { path: "pii_detection.redaction_tokens", value: redactionTokens },
    { path: "pii_detection.detection_mode", value: detectionMode },
    { path: "pii_detection.context_enhancement", value: contextEnhancement }
  ];

  console.log(
    `[PII Config Sync] Requested entities: ${summarizeEntities(enabledEntities)} | detection_mode=${detectionMode} context=${contextEnhancement}`
  );

  const piiConfUpdates = buildPiiConfUpdates(currentPiiConf, enabledSet);

  const changes = [
    {
      file: "unified_config.json",
      payloadType: "json" as const,
      updates: unifiedUpdates
    },
    {
      file: "pii.conf",
      payloadType: "json" as const,
      updates: [
        { path: "__all_rules", value: piiConfUpdates.__all_rules },
        { path: "__all_order", value: piiConfUpdates.__all_order },
        { path: "rules", value: piiConfUpdates.rules },
        { path: "order", value: piiConfUpdates.order }
      ]
    }
  ];

  const result = await saveChanges({
    changes,
    changeTag: "pii-config-sync",
    ifMatch: etags,
    author
  });

  const skipPresidioNotify = process.env.SKIP_PRESIDIO_NOTIFY === "1";

  if (skipPresidioNotify) {
    console.warn("[PII Config Sync] SKIPPING Presidio hot reload (SKIP_PRESIDIO_NOTIFY=1)");

    // CRITICAL: Fail hard when Presidio notify is skipped
    // Without this, GUI shows "Configuration synchronized successfully" while Presidio
    // stays stuck on previous mode/context forever. Operators must know sync is incomplete.
    await rollbackFiles(result.results);

    const skipError = new Error(
      'Presidio configuration update skipped (SKIP_PRESIDIO_NOTIFY=1 is set). ' +
      'This setting is for local testing only and should NEVER be enabled in production. ' +
      'Configuration files have been rolled back. Remove SKIP_PRESIDIO_NOTIFY to sync.'
    );
    (skipError as any).code = "PRESIDIO_NOTIFY_SKIPPED";
    throw skipError;
  } else {
    try {
      await notifyPresidio(detectionMode, contextEnhancement);
    } catch (error) {
      await rollbackFiles(result.results);
      throw error;
    }
  }

  const responseEtags = Object.fromEntries(result.results.map((r) => [r.file, r.etag]));

  return { etags: responseEtags };
}

function validatePayload(payload: PiiConfigUpdatePayload): string[] {
  const errors: string[] = [];

  // Validate enabledEntities type
  if (payload.enabledEntities && !Array.isArray(payload.enabledEntities)) {
    errors.push("enabledEntities must be an array");
  }

  // Validate enabledEntities values (security: prevent unknown entity injection)
  if (payload.enabledEntities && Array.isArray(payload.enabledEntities)) {
    const unknownEntities = payload.enabledEntities.filter(e => !KNOWN_ENTITIES.includes(e));
    if (unknownEntities.length > 0) {
      errors.push(`Unknown entity types: ${unknownEntities.join(', ')}`);
    }
  }

  // Validate confidenceThreshold range
  if (payload.confidenceThreshold !== undefined) {
    if (typeof payload.confidenceThreshold !== "number" || payload.confidenceThreshold < 0 || payload.confidenceThreshold > 1) {
      errors.push("confidenceThreshold must be between 0 and 1");
    }
  }

  // Validate languages array
  if (payload.languages && (!Array.isArray(payload.languages) || payload.languages.some((l) => typeof l !== "string"))) {
    errors.push("languages must be an array of strings");
  }

  // Validate redactionTokens type
  if (payload.redactionTokens && typeof payload.redactionTokens !== "object") {
    errors.push("redactionTokens must be an object");
  }

  // Validate redactionTokens values (security: prevent XSS/injection)
  if (payload.redactionTokens && typeof payload.redactionTokens === "object") {
    for (const [entity, token] of Object.entries(payload.redactionTokens)) {
      if (typeof token !== "string") {
        errors.push(`Redaction token for ${entity} must be a string`);
        continue;
      }

      // Length check (reasonable token size)
      if (token.length > 50) {
        errors.push(`Redaction token for ${entity} is too long (max 50 characters)`);
      }

      // Security check: XSS protection via whitelist (allows Polish diacritics)
      // Allowed: letters (including ąćęłńóśźż), digits, space, _-()[]*, .
      const SAFE_TOKEN_REGEX = /^[A-Za-z0-9\u0104-\u017C _\-\[\]\(\)\*\.]+$/;
      if (!SAFE_TOKEN_REGEX.test(token)) {
        errors.push(
          `Redaction token for ${entity} contains unsafe characters. ` +
          `Allowed: letters (including Polish), digits, space, _-()[]*, . ` +
          `Found: "${token.substring(0, 30)}${token.length > 30 ? '...' : ''}"`
        );
      }
    }
  }

  // Validate detection mode enum
  const allowedModes: DetectionMode[] = ["balanced", "high_security", "high_precision"];
  if (payload.detectionMode && !allowedModes.includes(payload.detectionMode)) {
    errors.push(`Invalid detection mode: ${payload.detectionMode}. Must be one of: ${allowedModes.join(', ')}`);
  }

  return errors;
}

function buildPiiConfUpdates(currentPiiConf: any, enabledSet: Set<string>) {
  // CRITICAL FIX v2: Use canonical storage (__all_rules, __all_order) to preserve disabled rules
  // Problem: Simple filtering lost data permanently when user disabled entity
  // Problem v1: No filtering made disable non-functional (workflow ignored GUI settings)
  // Solution: Two-tier storage:
  //   - __all_rules / __all_order: CANONICAL storage (never filtered, all rules preserved)
  //   - rules / order: ACTIVE rules (filtered to enabled entities, used by workflow)
  //
  // Architecture:
  // - pii.conf is a FALLBACK MECHANISM (regex patterns when Presidio ML fails)
  // - Canonical storage (__all_*) preserves ALL rules regardless of entity state
  // - Active storage (rules/order) contains ONLY enabled entities → workflow respects GUI
  // - Re-enabling entity copies from canonical → no data loss
  //
  // Example flow:
  // 1. Initial state: __all_rules has URL, rules has URL (enabled)
  // 2. User disables URL → __all_rules still has URL, rules has NO URL (filtered out)
  // 3. Workflow reads rules (no URL) → URL NOT redacted ✅
  // 4. User re-enables URL → filter copies URL from __all_rules to rules
  // 5. Workflow reads rules (has URL) → URL redacted again ✅

  const existingRules: any[] = Array.isArray(currentPiiConf.rules) ? currentPiiConf.rules : [];
  const existingOrder: string[] = Array.isArray(currentPiiConf.order) ? currentPiiConf.order : [];

  // Canonical storage (complete rule set, never filtered)
  const canonicalRules: any[] = Array.isArray(currentPiiConf.__all_rules)
    ? currentPiiConf.__all_rules
    : existingRules;  // Bootstrap: first run copies current rules to canonical
  const canonicalOrder: string[] = Array.isArray(currentPiiConf.__all_order)
    ? currentPiiConf.__all_order
    : existingOrder;

  // Filter canonical rules to only enabled entities (for active storage)
  const filteredRules = canonicalRules.filter((rule) => {
    if (!rule?.target_entity) return true;  // Keep rules without target_entity
    return enabledSet.has(rule.target_entity);  // Keep only enabled entities
  });

  // Filter order to match filtered rules
  const filteredOrder = canonicalOrder.filter((name) =>
    filteredRules.find((rule) => rule.name === name)
  );

  // Add any new rules from filteredRules that aren't in order
  for (const rule of filteredRules) {
    if (rule?.name && !filteredOrder.includes(rule.name)) {
      filteredOrder.push(rule.name);
    }
  }

  console.log(
    `[PII Config Sync] Canonical rules=${canonicalRules.length} → active=${filteredRules.length} (enabled_set=${enabledSet.size})`
  );

  // Return updates for ALL four fields:
  // - Canonical storage (preserved across enable/disable cycles)
  // - Active storage (filtered, used by workflow)
  return {
    __all_rules: canonicalRules,
    __all_order: canonicalOrder,
    rules: filteredRules,
    order: filteredOrder
  };
}

async function notifyPresidio(mode: DetectionMode, contextEnhancement: boolean) {
  try {
    const response = await fetch(`${PRESIDIO_URL}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        enable_context_enhancement: contextEnhancement
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      const error = new Error(`Presidio update failed: HTTP ${response.status}`);
      (error as any).code = "PRESIDIO_UPDATE_FAILED";
      (error as any).statusCode = response.status;
      throw error;
    }
  } catch (error: any) {
    // Handle timeout separately for better error messages
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const timeoutError = new Error('Presidio service timeout (5s) - service may be offline or overloaded');
      (timeoutError as any).code = "PRESIDIO_TIMEOUT";
      throw timeoutError;
    }

    // Handle network errors
    if (error.message.includes('fetch') || error.code === 'ECONNREFUSED') {
      const networkError = new Error(`Cannot reach Presidio service at ${PRESIDIO_URL} - check if container is running`);
      (networkError as any).code = "PRESIDIO_UNREACHABLE";
      throw networkError;
    }

    // Re-throw other errors (including PRESIDIO_UPDATE_FAILED)
    throw error;
  }
}

async function rollbackFiles(results: Array<{ file: string; backupPath: string }>) {
  const errors: string[] = [];

  // Sequential rollback to handle failures gracefully
  for (const entry of results) {
    try {
      await restoreFileFromBackup(entry.file, entry.backupPath);
      console.log(`[PII Config Sync] Rollback successful: ${entry.file} restored from ${entry.backupPath}`);
    } catch (error: any) {
      const errorMsg = `Failed to restore ${entry.file}: ${error.message}`;
      console.error(`[PII Config Sync] Rollback error: ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  // If any rollback failed, throw aggregated error
  if (errors.length > 0) {
    const rollbackError = new Error(
      `Partial rollback failure (${errors.length}/${results.length} files failed): ${errors.join('; ')}`
    );
    (rollbackError as any).code = "ROLLBACK_FAILED";
    (rollbackError as any).failures = errors;
    throw rollbackError;
  }
}
