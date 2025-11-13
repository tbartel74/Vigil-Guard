import { parseFile } from "./fileOps.js";

const DEFAULT_PRESIDIO_URL = process.env.PRESIDIO_URL || "http://vigil-presidio-pii:5001";
const DEFAULT_LANGUAGE_DETECTOR_URL = process.env.LANGUAGE_DETECTOR_URL || "http://vigil-language-detector:5002/detect";

/**
 * DEFAULT ALLOW-LIST - False Positive Prevention
 * Synchronized with Presidio API (services/presidio-pii-api/app.py)
 */
export const DEFAULT_ALLOW_LIST = [
  // AI models & platforms
  "ChatGPT", "GPT-4", "GPT-3.5", "GPT-3", "GPT", "Claude", "Claude-3", "Claude-2",
  "Gemini", "Llama", "Llama-2", "Llama-3", "PaLM", "Bard",
  "OpenAI", "Anthropic", "Google", "Meta", "Microsoft", "DeepMind",

  // Pronouns (most common false positives)
  "he", "He", "she", "She", "they", "They",
  "him", "Him", "her", "Her", "them", "Them",
  "his", "His", "hers", "Hers", "their", "Their", "theirs", "Theirs",
  "himself", "Himself", "herself", "Herself", "themselves", "Themselves",

  // Jailbreak personas (known attack vectors)
  "Sigma", "DAN", "UCAR", "Yool", "NaN", "SDA",
  "STAN", "DUDE", "JailBreak", "DevMode", "Developer Mode",

  // Placeholder names (ONLY crypto examples, NOT real names)
  // NOTE: John/Jane/Smith are TOO COMMON as real names - excluded from allow-list
  "Alice", "Bob", "Charlie", "Dave", "Eve", "Frank",
  "Test", "Example",

  // Tech brands & social media
  "Instagram", "Facebook", "Twitter", "X", "LinkedIn",
  "YouTube", "TikTok", "Reddit", "Discord", "Slack",
  "WhatsApp", "Telegram", "Snapchat", "Pinterest",

  // Generic references
  "User", "Assistant", "AI", "Bot", "Agent", "Helper",
  "Person", "People", "Someone", "Anyone", "Everyone", "Nobody",

  // Role descriptors
  "Storyteller", "Character", "Narrator", "Protagonist",
  "Administrator", "Moderator", "Developer", "Engineer",
  "Manager", "Director", "President", "CEO",

  // Programming & tech terms
  "Python", "JavaScript", "Java", "Ruby", "Swift",
  "Docker", "Kubernetes", "AWS", "Azure", "Linux",

  // Common words often flagged as names
  "Welcome", "Hello", "Thanks", "Please", "Sorry"
];

/**
 * Presidio Entity Types
 * Comprehensive list of all supported PII entity types (50+ standard + Polish custom + legacy aliases)
 */
export type PresidioEntityType =
  | "CREDIT_CARD" | "CRYPTO" | "DATE_TIME" | "EMAIL_ADDRESS" | "EMAIL"
  | "IBAN_CODE" | "IBAN" | "IP_ADDRESS" | "NRP" | "LOCATION" | "PERSON"
  | "PHONE_NUMBER" | "MEDICAL_LICENSE" | "URL"
  | "US_BANK_NUMBER" | "US_DRIVER_LICENSE" | "US_ITIN" | "US_PASSPORT" | "US_SSN"
  | "UK_NHS" | "UK_NINO" | "ES_NIF" | "ES_NIE"
  | "IT_FISCAL_CODE" | "IT_DRIVER_LICENSE" | "IT_VAT_CODE" | "IT_PASSPORT" | "IT_IDENTITY_CARD"
  | "SG_NRIC_FIN" | "SG_UEN" | "AU_ABN" | "AU_ACN" | "AU_TFN" | "AU_MEDICARE"
  | "IN_PAN" | "IN_AADHAAR" | "IN_VEHICLE_REGISTRATION" | "IN_VOTER" | "IN_PASSPORT" | "IN_GSTIN"
  | "FI_PERSONAL_IDENTITY_CODE"
  | "PL_PESEL" | "PL_NIP" | "PL_REGON" | "PL_ID_CARD" | "PL_PHONE_NUMBER"
  | "PHONE_PL" | "PHONE_INTL" | "PESEL_HINTED" | "PESEL_BARE"
  | "NIP_HINTED" | "NIP_BARE" | "REGON_HINTED" | "REGON_BARE"
  | "PL_ID" | "PL_ID_BARE" | "CARD_PAN";

/** PII Detection Configuration */
type PiiConfig = {
  redaction_mode?: "replace" | "mask" | "hash";
  redaction_tokens?: Record<string, string>;
  confidence_threshold?: number;
  languages?: string[];
  detection_mode?: string;
  context_enhancement?: boolean;
  api_timeout_ms?: number;
};

/** Language Detection Service Response */
interface LanguageDetectionResult {
  language: string | null;
  method: string;
  confidence: number;
  error?: string;
  is_service_error?: boolean;
}

/** Language Detection and Entity Statistics (workflow v1.7.7 format) */
interface LanguageStats {
  detected_language: string;
  primary_language: string;
  detection_method: string;
  detection_confidence: number | null;
  polish_entities: number;
  english_entities: number;
  regex_entities: number;
  polish_entities_retained: number;
  english_entities_retained: number;
  regex_entities_retained: number;
  total_after_dedup: number;
}

/** Presidio Entity Detection Result */
interface PresidioEntity {
  type: PresidioEntityType;
  start: number;
  end: number;
  score: number;
  text?: string;
  source_language?: string;
}

/** Dual-Language Analysis Request */
interface AnalyzeOptions {
  text: string;
  entities?: PresidioEntityType[];
  score_threshold?: number;
  return_decision_process?: boolean;
  language?: string;
}

/** Dual-Language Analysis Result */
interface RegexFallbackMeta {
  regex_entities_attempted: number;
  regex_entities_added: number;
  regex_rule_failures: number;
  degraded: boolean;
}

interface DualAnalyzeResult {
  entities: PresidioEntity[];
  detection_method: string;
  processing_time_ms: number;
  redacted_text: string;
  language_stats: LanguageStats;
  regex_fallback?: RegexFallbackMeta;
  detection_complete?: boolean;
  warnings?: string[];
}

let cachedUnifiedConfig: { data: any; etag: string } | null = null;
let cachedPiiConf: { data: any; etag: string } | null = null;

async function loadCachedConfig(
  filename: string,
  cache: { data: any; etag: string } | null,
  updateCache: (value: { data: any; etag: string }) => void
): Promise<any> {
  const file = await parseFile(filename);
  if (!cache || cache.etag !== file.etag) {
    updateCache({ data: file.parsed, etag: file.etag });
  }
  return file.parsed;
}

async function loadUnifiedConfig() {
  return loadCachedConfig(
    "unified_config.json",
    cachedUnifiedConfig,
    (value) => { cachedUnifiedConfig = value; }
  );
}

async function loadPiiConf() {
  return loadCachedConfig(
    "pii.conf",
    cachedPiiConf,
    (value) => { cachedPiiConf = value; }
  );
}

function getRedactionToken(entityType: string, originalText: string, piiConfig: PiiConfig): string {
  const redactionMode = piiConfig.redaction_mode || "replace";

  if (redactionMode === "mask") {
    return maskText(originalText);
  }

  const tokens = piiConfig.redaction_tokens || {};
  return tokens[entityType] || `[${entityType}]`;
}

/** Known Valid Entity Types (for runtime validation) */
const KNOWN_ENTITY_TYPES = new Set<PresidioEntityType>([
  "EMAIL_ADDRESS", "PHONE_NUMBER", "PERSON", "PL_PESEL", "PL_NIP", "PL_REGON", "PL_ID_CARD",
  "CREDIT_CARD", "IBAN_CODE", "IP_ADDRESS", "URL", "CRYPTO", "DATE_TIME", "NRP", "LOCATION",
  "MEDICAL_LICENSE", "US_BANK_NUMBER", "US_DRIVER_LICENSE", "US_ITIN", "US_PASSPORT", "US_SSN",
  "UK_NHS", "UK_NINO", "ES_NIF", "ES_NIE", "IT_FISCAL_CODE", "IT_DRIVER_LICENSE", "IT_VAT_CODE",
  "IT_PASSPORT", "IT_IDENTITY_CARD", "SG_NRIC_FIN", "SG_UEN", "AU_ABN", "AU_ACN", "AU_TFN",
  "AU_MEDICARE", "IN_PAN", "IN_AADHAAR", "IN_VEHICLE_REGISTRATION", "IN_VOTER", "IN_PASSPORT",
  "IN_GSTIN", "FI_PERSONAL_IDENTITY_CODE", "PL_PHONE_NUMBER", "EMAIL", "IBAN", "PHONE_PL",
  "PHONE_INTL", "PESEL_HINTED", "PESEL_BARE", "NIP_HINTED", "NIP_BARE", "REGON_HINTED",
  "REGON_BARE", "PL_ID", "PL_ID_BARE", "CARD_PAN"
]);

/**
 * Validates entity types against known Presidio recognizers (permissive mode)
 *
 * Validation philosophy:
 * - **Permissive**: Warns about unknown types but does NOT reject the request
 * - Unknown types are passed to Presidio anyway (Presidio will silently ignore them)
 * - Rationale: Entity type list evolves over time (new recognizers added to Presidio)
 * - Rejecting unknown types would break forward compatibility
 *
 * Use cases:
 * 1. GUI sends entity list from frontend config (may include experimental types)
 * 2. API client requests new entity type before backend is updated
 * 3. Presidio version updated with new recognizers (backend hasn't updated type list yet)
 *
 * Error handling strategy:
 * - Known types → Accepted (valid array)
 * - Unknown types → Logged + passed through (unknown array)
 * - Empty/null → Returns empty arrays (not an error)
 *
 * Example:
 *   Input: ["EMAIL_ADDRESS", "EXPERIMENTAL_TYPE", "PL_PESEL"]
 *   Output: {
 *     valid: ["EMAIL_ADDRESS", "PL_PESEL"],
 *     unknown: ["EXPERIMENTAL_TYPE"],
 *     warnings: ["Unknown entity type 'EXPERIMENTAL_TYPE' in request (will be ignored by Presidio)"]
 *   }
 *
 * @param entities - User-provided entity type list
 * @param context - Caller context for logging (e.g., "request", "polish_entities")
 * @returns Validation result with valid/unknown types and warnings
 */
function validateEntityTypes(entities: string[] | undefined, context: string = "request"): {
  valid: PresidioEntityType[];
  unknown: string[];
  warnings: string[];
} {
  if (!entities || entities.length === 0) {
    return { valid: [], unknown: [], warnings: [] };
  }

  const valid: PresidioEntityType[] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];

  for (const entity of entities) {
    if (KNOWN_ENTITY_TYPES.has(entity as PresidioEntityType)) {
      valid.push(entity as PresidioEntityType);
    } else {
      unknown.push(entity);
      warnings.push(`Unknown entity type "${entity}" in ${context} (will be ignored by Presidio)`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`⚠️  Entity type validation warnings (${context}):`, warnings);
  }

  return { valid, unknown, warnings };
}

function maskText(text: string): string {
  if (!text || text.length <= 4) {
    return "*".repeat(text.length);
  }

  const first = text.substring(0, 2);
  const last = text.substring(text.length - 2);
  const masked = "*".repeat(text.length - 4);
  return `${first}${masked}${last}`;
}

/**
 * Deduplicates overlapping PII entities using position-priority algorithm
 *
 * Algorithm (matches workflow v1.7.7 deduplication logic):
 * 1. Sort by position (start, then end) - ensures left-to-right processing
 * 2. For overlaps at same position, prioritize by length (longer span wins)
 * 3. For same position + length, use score as tiebreaker
 * 4. Keep only non-overlapping entities (first occurrence wins)
 *
 * Rationale for position-first priority:
 * - Multiple PII types can detect same text (e.g., "Jan Kowalski" = PERSON + PL_PESEL false positive)
 * - Position-based deduplication prevents double redaction: "[PERSON]" not "[[PERSON]]"
 * - Consistent with n8n workflow deduplication (workflow/workflows/Vigil-Guard-v1.7.7.json)
 *
 * Example:
 *   Input: [
 *     { type: "PERSON", start: 0, end: 12, score: 0.85 },       // "Jan Kowalski"
 *     { type: "PL_PESEL", start: 20, end: 31, score: 1.0 },     // "92032100157"
 *     { type: "EMAIL_ADDRESS", start: 20, end: 25, score: 0.95 } // "92032" (false positive)
 *   ]
 *   Output: [
 *     { type: "PERSON", start: 0, end: 12, score: 0.85 },
 *     { type: "PL_PESEL", start: 20, end: 31, score: 1.0 }  // EMAIL discarded (overlaps with PESEL)
 *   ]
 *
 * @param entities - Raw entity list from Polish + English Presidio + Regex
 * @returns Deduplicated entities with no overlaps
 */
function deduplicateEntities(entities: PresidioEntity[]): PresidioEntity[] {
  if (!entities.length) return [];

  const sorted = sortEntitiesForDeduplication(entities);
  return filterNonOverlappingEntities(sorted);
}

/**
 * Sorts entities for deduplication using three-tier priority
 *
 * Priority rules:
 * 1. Position (start) - Earlier in text wins
 * 2. Span length (end) - Longer detection wins (more context)
 * 3. Confidence score - Higher confidence wins (tiebreaker)
 *
 * @param entities - Unsorted entity list
 * @returns Entities sorted by position → length → score
 */
function sortEntitiesForDeduplication(entities: PresidioEntity[]): PresidioEntity[] {
  return [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start; // Position priority

    const lengthA = a.end - a.start;
    const lengthB = b.end - b.start;
    if (lengthA !== lengthB) return lengthB - lengthA; // Longer span wins

    return (b.score ?? 0) - (a.score ?? 0); // Score tiebreaker
  });
}

/**
 * Filters out overlapping entities (keeps first occurrence after sorting)
 *
 * @param sorted - Entities pre-sorted by position/length/score
 * @returns Non-overlapping entities only
 */
function filterNonOverlappingEntities(sorted: PresidioEntity[]): PresidioEntity[] {
  const unique: PresidioEntity[] = [];

  for (const entity of sorted) {
    if (!hasOverlap(entity, unique)) {
      unique.push(entity);
    }
  }

  return unique;
}

/**
 * Checks if entity overlaps with any existing entity
 *
 * Overlap definition: Ranges [a.start, a.end) and [b.start, b.end) overlap if:
 *   a.start < b.end AND a.end > b.start
 *
 * @param entity - Entity to check
 * @param existingEntities - Already accepted entities
 * @returns True if overlap detected
 */
function hasOverlap(entity: PresidioEntity, existingEntities: PresidioEntity[]): boolean {
  return existingEntities.some(existing =>
    entity.start < existing.end && entity.end > existing.start
  );
}

function applyRedactions(text: string, entities: PresidioEntity[], piiConfig: PiiConfig): string {
  if (!entities.length) return text;

  // Sort in reverse to maintain string indices while replacing
  const sortedReverse = [...entities].sort((a, b) => b.start - a.start);

  let redacted = text;
  for (const entity of sortedReverse) {
    const originalText = text.substring(entity.start, entity.end);
    const replacement = getRedactionToken(entity.type, originalText, piiConfig);
    redacted = redacted.substring(0, entity.start) + replacement + redacted.substring(entity.end);
  }

  return redacted;
}

async function callPresidio(analyzePayload: AnalyzeOptions, piiConfig: PiiConfig) {
  const start = Date.now();
  const response = await fetch(`${DEFAULT_PRESIDIO_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: analyzePayload.text,
      language: analyzePayload.language ?? "pl",
      entities: analyzePayload.entities,
      score_threshold: analyzePayload.score_threshold ?? piiConfig.confidence_threshold ?? 0.7,
      return_decision_process: analyzePayload.return_decision_process ?? false,
      allow_list: DEFAULT_ALLOW_LIST  // NEW: Use default allow-list for false positive prevention
    }),
    signal: AbortSignal.timeout(piiConfig.api_timeout_ms || 5000)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Presidio analyze failed: HTTP ${response.status} - ${message}`);
  }

  const data = await response.json();
  const processing = Date.now() - start;
  return { ...data, processing_time_ms: processing };
}

/**
 * Detects language using hybrid detection service (entity hints + statistical analysis)
 *
 * Fail-safe philosophy:
 * - Service errors (HTTP 5xx, network timeout) return error response with `is_service_error: true`
 * - Low confidence detection (< threshold) returns successful response with low `confidence` value
 * - This distinction allows caller to decide: fallback to default language vs. reject request
 *
 * Error handling strategy:
 * - HTTP errors (5xx, 4xx) → Log + return error object (do NOT throw)
 * - Network errors (ECONNREFUSED) → Log + return error object
 * - Timeout (AbortError) → Log + return error object
 * - ALL errors set `is_service_error: true` flag for proper fallback handling
 *
 * Rationale for fail-safe (not fail-secure):
 * - Language detection is NOT a security boundary (PII detection is)
 * - Blocking requests on detector failure degrades user experience unnecessarily
 * - Fallback to default language (pl) still enables dual-language PII detection
 * - Monitoring can alert on high error rates without impacting availability
 *
 * @param text - Input text to analyze
 * @param timeoutMs - Request timeout (default: 1000ms)
 * @returns Language detection result with error flag if service unavailable
 */
async function detectLanguage(text: string, timeoutMs: number): Promise<LanguageDetectionResult> {
  try {
    const response = await fetch(DEFAULT_LANGUAGE_DETECTOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, detailed: true }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      // HTTP errors indicate service failure, not low confidence
      const message = `Language detector service error: HTTP ${response.status}`;
      console.error(message, { url: DEFAULT_LANGUAGE_DETECTOR_URL });

      // Return error response (do NOT throw - allow fallback to default language)
      return {
        error: message,
        method: "service_error",
        language: null,
        confidence: 0,  // Zero confidence indicates service unavailability
        is_service_error: true  // Distinguishes from low-confidence detection
      };
    }

    return await response.json();
  } catch (error: any) {
    // Network/timeout errors (ECONNREFUSED, AbortError, etc.)
    const message = `Language detector ${error.name === 'AbortError' ? 'timeout' : 'network error'}: ${error.message}`;
    console.error(message, { url: DEFAULT_LANGUAGE_DETECTOR_URL, error_type: error.name });

    return {
      error: message,
      method: "network_error",
      language: null,
      confidence: 0,
      is_service_error: true
    };
  }
}

function annotateEntities(entities: PresidioEntity[] = [], source: string): PresidioEntity[] {
  return entities.map(entity => ({
    ...entity,
    source_language: source,
    text: entity.text ?? ""
  }));
}

/**
 * Legacy pii.conf Rule Name to Presidio Entity Type Mapping
 *
 * Rationale for mapping layer:
 * - pii.conf uses legacy rule names from pre-Presidio era (e.g., "PHONE_PL", "EMAIL")
 * - Presidio uses standardized entity types (e.g., "PHONE_NUMBER", "EMAIL_ADDRESS")
 * - Mapping provides backward compatibility without breaking existing configurations
 * - Enables consistent entity deduplication across regex + Presidio results
 *
 * Entity categories:
 * 1. **Hinted vs Bare** (Polish entities):
 *    - PESEL_HINTED: Requires "PESEL" keyword nearby (fewer false positives)
 *    - PESEL_BARE: Detects any 11-digit sequence matching PESEL checksum (more coverage)
 *    - Same pattern for NIP, REGON, PL_ID
 *
 * 2. **Locale-specific vs Generic**:
 *    - PHONE_PL: Polish format (+48, 6-9 digits)
 *    - PHONE_INTL: International E.164 format
 *    - Both map to PHONE_NUMBER for consistent handling
 *
 * 3. **Legacy aliases**:
 *    - EMAIL → EMAIL_ADDRESS (Presidio standard)
 *    - IBAN → IBAN_CODE (matches Presidio recognizer)
 *    - CARD_PAN → CREDIT_CARD (PAN = Primary Account Number)
 *
 * Migration notes:
 * - New rules should use Presidio types directly (no mapping needed)
 * - This map only for backward compatibility with existing pii.conf
 * - If adding new regex rules, prefer Presidio entity type names
 *
 * @see services/workflow/config/pii.conf for regex pattern definitions
 */
const REGEX_TO_PRESIDIO_TYPE_MAP = {
  "PHONE_PL": "PHONE_NUMBER",
  "PHONE_INTL": "PHONE_NUMBER",
  "EMAIL": "EMAIL_ADDRESS",
  "PESEL_HINTED": "PL_PESEL",
  "PESEL_BARE": "PL_PESEL",
  "NIP_HINTED": "PL_NIP",
  "NIP_BARE": "PL_NIP",
  "REGON_HINTED": "PL_REGON",
  "REGON_BARE": "PL_REGON",
  "PL_ID": "PL_ID_CARD",
  "PL_ID_BARE": "PL_ID_CARD",
  "IBAN": "IBAN_CODE",
  "CARD_PAN": "CREDIT_CARD"
} as const;

type RegexRuleName = keyof typeof REGEX_TO_PRESIDIO_TYPE_MAP;
type MappedEntityType = typeof REGEX_TO_PRESIDIO_TYPE_MAP[RegexRuleName];

function findRegexEntities(
  text: string,
  piiConf: any,
  piiConfig: PiiConfig,
  requestedEntities?: PresidioEntityType[]
): { entities: PresidioEntity[]; failedRules: number } {
  if (!piiConf || !Array.isArray(piiConf.rules)) {
    return { entities: [], failedRules: 0 };
  }

  const order = piiConf.order || piiConf.rules.map((r: any) => r.name);
  const results: PresidioEntity[] = [];
  let failedRulesCount = 0;

  for (const ruleName of order) {
    const rule = piiConf.rules.find((r: any) => r.name === ruleName);
    if (!rule || !rule.pattern) continue;

    // Map pii.conf rule name to Presidio entity type (type-safe lookup)
    const presidioType: PresidioEntityType =
      (REGEX_TO_PRESIDIO_TYPE_MAP[ruleName as RegexRuleName] as PresidioEntityType) ||
      (ruleName as PresidioEntityType);

    // Skip if user requested specific entities and this type is not requested
    if (requestedEntities && requestedEntities.length > 0 && !requestedEntities.includes(presidioType)) {
      continue;
    }

    try {
      const regex = new RegExp(rule.pattern, rule.flags || "giu");
      let match;
      while ((match = regex.exec(text)) !== null) {
        results.push({
          type: presidioType,
          start: match.index,
          end: match.index + match[0].length,
          score: 1.0,
          text: match[0],
          source_language: "regex"
        });
      }
    } catch (error: any) {
      // Log with full context for debugging malformed patterns
      failedRulesCount++;
      console.error(`❌ Regex pattern compilation/execution failed for rule "${ruleName}":`, {
        error: error.message,
        pattern: rule.pattern?.substring(0, 100) + (rule.pattern?.length > 100 ? '...' : ''),  // Truncate long patterns
        flags: rule.flags || "giu",
        presidio_type: presidioType,
        error_type: error.name
      });
      // Continue processing other rules (already happens via try-catch)
    }
  }

  if (failedRulesCount > 0) {
    console.warn(`⚠️  ${failedRulesCount} regex rule(s) failed to compile/execute`);
  }

  return {
    entities: results,
    failedRules: failedRulesCount
  };
}

// Entity type constants (strongly typed)
const GENERAL_ENTITIES: PresidioEntityType[] = ["CREDIT_CARD", "EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE", "IP_ADDRESS", "URL"];
const POLISH_SPECIFIC_ENTITIES: PresidioEntityType[] = ["PL_PESEL", "PL_NIP", "PL_REGON", "PL_ID_CARD", "PL_PHONE_NUMBER"];

function prepareEntityLists(
  userEntities: string[] | undefined,
  detectedLanguage: string
): { polish: PresidioEntityType[]; english: PresidioEntityType[] } {
  // Validate entity types (permissive: warn but don't reject)
  const validation = validateEntityTypes(userEntities, "entity list preparation");
  const validEntities = validation.valid;

  if (validEntities.length > 0) {
    return prepareUserEntityLists(validEntities, detectedLanguage);
  }
  return prepareDefaultEntityLists(detectedLanguage);
}

function prepareUserEntityLists(
  userEntities: PresidioEntityType[],
  detectedLanguage: string
): { polish: PresidioEntityType[]; english: PresidioEntityType[] } {
  // Polish model: Polish-specific entities + general entities
  const polishEntities = userEntities.filter(e =>
    POLISH_SPECIFIC_ENTITIES.includes(e) || GENERAL_ENTITIES.includes(e)
  );

  // English model: General entities only
  const englishEntities = userEntities.filter(e => GENERAL_ENTITIES.includes(e));

  /**
   * Adaptive PERSON routing based on detected language
   *
   * Rationale for language-specific PERSON detection:
   * - PERSON entity uses language-specific NLP models (spaCy: pl_core_news_lg vs en_core_web_lg)
   * - Polish names have different patterns than English names:
   *   - Polish: "Jan Kowalski", "Ewa Nowak" (declension, Polish-specific surnames)
   *   - English: "John Smith", "Jane Doe" (different capitalization patterns)
   * - Sending PERSON to wrong model causes:
   *   - False positives: English model detects Polish common nouns as names
   *   - False negatives: Polish model misses English names without Polish context
   *
   * Strategy:
   * - Detected language = "pl" → PERSON goes to Polish model ONLY
   * - Detected language = "en" → PERSON goes to English model ONLY
   * - Detected language = null/unknown → PERSON goes to Polish model (default for mixed content)
   *
   * Why not send PERSON to both models?
   * - Increases false positive rate (both models detect same text differently)
   * - Deduplication cannot resolve conflicting entity types at same position
   * - Performance cost (PERSON detection is expensive for large texts)
   * - Workflow v1.7.7 uses single-model routing (parity requirement)
   *
   * @see workflow/workflows/Vigil-Guard-v1.7.7.json for workflow implementation
   */
  if (userEntities.includes("PERSON")) {
    const targetList = detectedLanguage === "pl" ? polishEntities : englishEntities;
    if (!targetList.includes("PERSON")) {
      targetList.push("PERSON");
    }
  }

  return {
    polish: [...new Set(polishEntities)],
    english: [...new Set(englishEntities)]
  };
}

/**
 * Prepares default entity lists when user doesn't specify entities
 *
 * Default strategy (workflow v1.7.7 parity):
 * - Polish model: All Polish-specific entities + general entities + PERSON (if lang=pl)
 * - English model: General entities only + PERSON (if lang=en)
 *
 * Entity type categories:
 * - **Polish-specific**: PL_PESEL, PL_NIP, PL_REGON, PL_ID_CARD, PL_PHONE_NUMBER
 * - **General**: CREDIT_CARD, EMAIL_ADDRESS, PHONE_NUMBER, IBAN_CODE, IP_ADDRESS, URL
 * - **Adaptive**: PERSON (routed based on detected language)
 *
 * @param detectedLanguage - Language detected by hybrid detector ("pl", "en", or fallback)
 * @returns Entity lists for Polish and English Presidio models
 */
function prepareDefaultEntityLists(detectedLanguage: string): { polish: PresidioEntityType[]; english: PresidioEntityType[] } {
  const polishEntities: PresidioEntityType[] = [...POLISH_SPECIFIC_ENTITIES, ...GENERAL_ENTITIES];
  const englishEntities: PresidioEntityType[] = [...GENERAL_ENTITIES];

  // Adaptive PERSON routing for defaults (same logic as user-specified entities)
  const targetList = detectedLanguage === "pl" ? polishEntities : englishEntities;
  targetList.push("PERSON");

  return {
    polish: [...new Set(polishEntities)],
    english: [...new Set(englishEntities)]
  };
}

async function buildPresidioTasks(
  reqBody: AnalyzeOptions,
  piiConfig: PiiConfig,
  shouldCallPolish: boolean,
  shouldCallEnglish: boolean,
  polishEntities: PresidioEntityType[],
  englishEntities: PresidioEntityType[]
): Promise<Array<Promise<any>>> {
  const emptyResponse = Promise.resolve({ entities: [], processing_time_ms: 0 });

  const polishTask = shouldCallPolish && polishEntities.length > 0
    ? callPresidioForLanguage(reqBody, piiConfig, "pl", polishEntities)
    : emptyResponse;

  const englishTask = shouldCallEnglish && englishEntities.length > 0
    ? callPresidioForLanguage(reqBody, piiConfig, "en", englishEntities)
    : emptyResponse;

  return [polishTask, englishTask];
}

function callPresidioForLanguage(
  reqBody: AnalyzeOptions,
  piiConfig: PiiConfig,
  language: string,
  entities: PresidioEntityType[]
): Promise<any> {
  const payload: AnalyzeOptions = {
    text: reqBody.text,
    language,
    entities,
    score_threshold: reqBody.score_threshold,
    return_decision_process: reqBody.return_decision_process
  };

  return callPresidio(payload, piiConfig).catch(error => ({ error: error.message }));
}

function combineAndFilterEntities(
  plEntitiesRaw: PresidioEntity[],
  enEntitiesRaw: PresidioEntity[],
  detectedLanguage: string
): PresidioEntity[] {
  let combined = [
    ...annotateEntities(plEntitiesRaw, "pl"),
    ...annotateEntities(enEntitiesRaw, "en")
  ];

  // Filter English PERSON entities for Polish text
  if (detectedLanguage === "pl") {
    combined = filterEnglishPersonEntitiesForPolish(combined);
  }

  return combined;
}

function filterEnglishPersonEntitiesForPolish(entities: PresidioEntity[]): PresidioEntity[] {
  return entities.filter(entity => {
    if (entity.source_language === "en" && entity.type === "PERSON") {
      return isValidPolishPersonName(entity.text || "");
    }
    return true;
  });
}

function isValidPolishPersonName(text: string): boolean {
  const candidate = text.trim();
  if (candidate.length < 3) {
    return false;
  }
  // Check if starts with uppercase letter (Polish or Latin)
  return /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(candidate);
}

function integrateRegexEntities(
  combinedEntities: PresidioEntity[],
  reqBody: AnalyzeOptions,
  piiConf: any,
  piiConfig: PiiConfig
): { entities: PresidioEntity[]; regexMeta: RegexFallbackMeta } {
  let dedupedEntities = deduplicateEntities(combinedEntities);

  const requestedEntities = reqBody.entities?.length ? reqBody.entities : undefined;
  const { entities: regexEntities, failedRules } = findRegexEntities(
    reqBody.text,
    piiConf,
    piiConfig,
    requestedEntities
  );

  // Filter out overlapping regex entities
  const nonOverlappingRegexEntities = regexEntities.filter(regexEntity =>
    !hasOverlap(regexEntity, dedupedEntities)
  );

  if (nonOverlappingRegexEntities.length > 0) {
    dedupedEntities = deduplicateEntities([...dedupedEntities, ...nonOverlappingRegexEntities]);
  }

  const regexMeta: RegexFallbackMeta = {
    regex_entities_attempted: regexEntities.length,
    regex_entities_added: nonOverlappingRegexEntities.length,
    regex_rule_failures: failedRules,
    degraded: failedRules > 0
  };

  return { entities: dedupedEntities, regexMeta };
}

/**
 * Dual-language PII detection orchestrator (workflow v1.7.7 parity)
 *
 * Execution flow:
 * 1. Load configuration (unified_config.json + pii.conf)
 * 2. Detect language (hybrid: entity hints + statistical analysis)
 * 3. Build language-specific entity lists (Polish-specific vs General vs Adaptive)
 * 4. Call Presidio models in parallel (Polish + English with per-call timeouts)
 * 5. Combine + deduplicate results (position-priority algorithm)
 * 6. Run regex fallback on original text (non-overlapping only)
 * 7. Apply redactions and build metadata (language_stats, redacted_text)
 *
 * Key features:
 * - **Parallel execution**: Polish + English models run simultaneously (Promise.all)
 * - **Adaptive routing**: PERSON entity routed based on detected language
 * - **Defense-in-depth**: Individual + outer timeouts, fail-safe language detection
 * - **Deduplication**: Position-priority algorithm (same as workflow)
 * - **Backward compatibility**: Legacy regex patterns (pii.conf) with type mapping
 *
 * Performance targets:
 * - Language detection: <10ms (cached hybrid detector)
 * - Single Presidio call: <150ms (per model)
 * - Dual Presidio calls: <310ms (parallel execution)
 * - Regex fallback: <5ms (13 patterns)
 * - Total: <500ms end-to-end (including network overhead)
 *
 * Error handling:
 * - Language detection failure → Fallback to default language (pl)
 * - Presidio API error → Log + continue with other model
 * - Regex pattern error → Log + skip pattern (no request failure)
 * - Timeout → Reject with timeout error (guaranteed by outer timeout)
 *
 * @param reqBody - Analysis request with text and optional configuration
 * @returns Complete PII analysis with entities, statistics, and redacted output
 * @throws Error if text is missing or empty
 */
export async function analyzeDualLanguage(reqBody: AnalyzeOptions): Promise<DualAnalyzeResult> {
  if (!reqBody || typeof reqBody.text !== "string" || !reqBody.text.trim()) {
    throw new Error("Text is required for analysis");
  }

  const unifiedConfig = await loadUnifiedConfig();
  const piiConfig: PiiConfig = unifiedConfig?.pii_detection || {};
  const piiConf = await loadPiiConf();

  const supportedLanguages = Array.isArray(piiConfig.languages) && piiConfig.languages.length > 0
    ? piiConfig.languages
    : ["pl", "en"];

  const languageResult = await detectLanguage(reqBody.text, piiConfig.api_timeout_ms || 1200);

  // Log service errors for monitoring
  if (languageResult?.is_service_error) {
    console.warn(`⚠️  Language detection failed, using fallback: ${languageResult.error}`);
  }

  // Guaranteed non-null: either detected language or fallback to pl/first supported
  const detectedLanguage: string = (languageResult?.language && supportedLanguages.includes(languageResult.language))
    ? languageResult.language
    : (supportedLanguages.includes("pl") ? "pl" : supportedLanguages[0]);

  const shouldCallPolish = supportedLanguages.includes("pl");
  const shouldCallEnglish = supportedLanguages.includes("en");

  // Build language-specific entity lists (workflow v1.7.7 parity)
  const entityLists = prepareEntityLists(reqBody.entities, detectedLanguage);
  const polishEntitiesList = entityLists.polish;
  const englishEntitiesList = entityLists.english;

  const presidioTasks = await buildPresidioTasks(
    reqBody,
    piiConfig,
    shouldCallPolish,
    shouldCallEnglish,
    polishEntitiesList,
    englishEntitiesList
  );

  /**
   * Defense-in-depth timeout strategy for parallel API calls
   *
   * Timeout architecture:
   * 1. **Individual call timeout** (5s default via AbortSignal in callPresidio):
   *    - Each Presidio API call (Polish + English) has per-request timeout
   *    - Configured via piiConfig.api_timeout_ms (default: 5000ms)
   *    - Prevents single slow model from blocking entire operation
   *
   * 2. **Outer timeout** (10s default via Promise.race):
   *    - Guards against edge case: both models timeout simultaneously
   *    - Formula: api_timeout_ms * 2 (allows both to timeout gracefully)
   *    - Ensures request eventually terminates even if Promise.all hangs
   *
   * Rationale for 2x multiplier:
   * - Parallel execution: Both models run simultaneously (not sequential)
   * - Expected case: Max time = single slowest model (~5s)
   * - Worst case: Both timeout → 2x time needed (10s)
   * - Buffer: Prevents false positives from network jitter
   *
   * Why outer timeout matters:
   * - Promise.all can hang if individual timeouts don't reject properly
   * - AbortSignal timeout may not work if fetch implementation is broken
   * - Defense-in-depth: Never trust single timeout mechanism
   * - Production safety: Guaranteed request termination for monitoring/alerting
   *
   * Timeout values in unified_config.json:
   * - api_timeout_ms: 5000 (default, per-call timeout)
   * - No outer timeout config (always 2x api_timeout_ms)
   *
   * @see services/workflow/config/unified_config.json for configuration
   */
  const outerTimeoutMs = (piiConfig.api_timeout_ms || 5000) * 2;
  const [plResponse, enResponse] = await Promise.race([
    Promise.all(presidioTasks),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Dual-language PII detection timed out after ${outerTimeoutMs}ms`)), outerTimeoutMs)
    )
  ]);

  const attemptedLanguages = (shouldCallPolish ? 1 : 0) + (shouldCallEnglish ? 1 : 0);
  const presidioErrors: string[] = [];
  const warnings: string[] = [];

  if (plResponse && typeof plResponse === "object" && "error" in plResponse && plResponse.error) {
    console.warn("Polish Presidio analysis failed:", plResponse.error);
    presidioErrors.push(`pl: ${plResponse.error}`);
    warnings.push(`Polish PII detection failed: ${plResponse.error}`);
  }

  if (enResponse && typeof enResponse === "object" && "error" in enResponse && enResponse.error) {
    console.warn("English Presidio analysis failed:", enResponse.error);
    presidioErrors.push(`en: ${enResponse.error}`);
    warnings.push(`English PII detection failed: ${enResponse.error}`);
  }

  if (attemptedLanguages > 0 && presidioErrors.length === attemptedLanguages) {
    throw new Error(`Presidio analysis failed for all languages (${presidioErrors.join("; ")})`);
  }

  const detectionComplete = presidioErrors.length === 0;

  const plEntitiesRaw = plResponse?.entities || [];
  const enEntitiesRaw = enResponse?.entities || [];

  const combinedEntities = combineAndFilterEntities(
    plEntitiesRaw,
    enEntitiesRaw,
    detectedLanguage
  );

  const { entities: dedupedEntities, regexMeta } = integrateRegexEntities(
    combinedEntities,
    reqBody,
    piiConf,
    piiConfig
  );

  const processingTime = Math.max(
    plResponse?.processing_time_ms || 0,
    enResponse?.processing_time_ms || 0
  );

  const languageStats = buildLanguageStats(
    languageResult,
    detectedLanguage,
    plEntitiesRaw,
    enEntitiesRaw,
    dedupedEntities
  );

  const redactedText = applyRedactions(reqBody.text, dedupedEntities, piiConfig);

  return {
    entities: dedupedEntities,
    detection_method: "presidio_dual_language",
    processing_time_ms: processingTime,
    redacted_text: redactedText,
    language_stats: languageStats,
    regex_fallback: regexMeta,
    detection_complete: detectionComplete,
    ...(warnings.length > 0 && { warnings })
  };
}

function buildLanguageStats(
  languageResult: LanguageDetectionResult | any,
  detectedLanguage: string,
  plEntitiesRaw: PresidioEntity[],
  enEntitiesRaw: PresidioEntity[],
  dedupedEntities: PresidioEntity[]
): LanguageStats {
  const countBySource = (source: string) =>
    dedupedEntities.filter(e => e.source_language === source).length;

  return {
    detected_language: languageResult?.language || "unknown",
    primary_language: detectedLanguage,
    detection_method: languageResult?.method || "unknown",
    detection_confidence: languageResult?.confidence ?? null,
    polish_entities: plEntitiesRaw.length,
    english_entities: enEntitiesRaw.length,
    regex_entities: countBySource("regex"),
    polish_entities_retained: countBySource("pl"),
    english_entities_retained: countBySource("en"),
    regex_entities_retained: countBySource("regex"),
    total_after_dedup: dedupedEntities.length
  };
}
