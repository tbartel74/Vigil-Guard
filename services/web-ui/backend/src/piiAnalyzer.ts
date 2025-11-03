import { parseFile } from "./fileOps.js";

const DEFAULT_PRESIDIO_URL = process.env.PRESIDIO_URL || "http://vigil-presidio-pii:5001";
const DEFAULT_LANGUAGE_DETECTOR_URL = process.env.LANGUAGE_DETECTOR_URL || "http://vigil-language-detector:5002/detect";

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

/** Language Detection and Entity Statistics (workflow v1.7.0 format) */
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
interface DualAnalyzeResult {
  entities: PresidioEntity[];
  detection_method: string;
  processing_time_ms: number;
  redacted_text: string;
  language_stats: LanguageStats;
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

/** Validate Entity Types (permissive: warns but doesn't reject unknown types) */
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

function deduplicateEntities(entities: PresidioEntity[]): PresidioEntity[] {
  if (!entities.length) return [];

  const sorted = sortEntitiesForDeduplication(entities);
  return filterNonOverlappingEntities(sorted);
}

function sortEntitiesForDeduplication(entities: PresidioEntity[]): PresidioEntity[] {
  return [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function filterNonOverlappingEntities(sorted: PresidioEntity[]): PresidioEntity[] {
  const unique: PresidioEntity[] = [];

  for (const entity of sorted) {
    if (!hasOverlap(entity, unique)) {
      unique.push(entity);
    }
  }

  return unique;
}

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
      return_decision_process: analyzePayload.return_decision_process ?? false
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

async function detectLanguage(text: string, timeoutMs: number) {
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

      // Return error response with confidence marker
      return {
        error: message,
        method: "service_error",
        language: null,
        confidence: 0,  // Explicitly mark as zero confidence
        is_service_error: true  // Flag for error handling
      };
    }

    return await response.json();
  } catch (error: any) {
    // Network/timeout errors
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

/** Legacy pii.conf Rule Name to Presidio Entity Type Mapping */
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

function findRegexEntities(text: string, piiConf: any, piiConfig: PiiConfig, requestedEntities?: PresidioEntityType[]): PresidioEntity[] {
  if (!piiConf || !Array.isArray(piiConf.rules)) {
    return [];
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

  return results;
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

  // Route PERSON based on detected language
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

function prepareDefaultEntityLists(detectedLanguage: string): { polish: PresidioEntityType[]; english: PresidioEntityType[] } {
  const polishEntities: PresidioEntityType[] = [...POLISH_SPECIFIC_ENTITIES, ...GENERAL_ENTITIES];
  const englishEntities: PresidioEntityType[] = [...GENERAL_ENTITIES];

  // Adaptive PERSON routing for defaults
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
): PresidioEntity[] {
  let dedupedEntities = deduplicateEntities(combinedEntities);

  const requestedEntities = reqBody.entities?.length ? reqBody.entities : undefined;
  const regexEntities = findRegexEntities(reqBody.text, piiConf, piiConfig, requestedEntities);

  // Filter out overlapping regex entities
  const nonOverlappingRegexEntities = regexEntities.filter(regexEntity =>
    !hasOverlap(regexEntity, dedupedEntities)
  );

  if (nonOverlappingRegexEntities.length > 0) {
    dedupedEntities = deduplicateEntities([...dedupedEntities, ...nonOverlappingRegexEntities]);
  }

  return dedupedEntities;
}

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

  const detectedLanguage = supportedLanguages.includes(languageResult?.language)
    ? languageResult.language
    : (supportedLanguages.includes("pl") ? "pl" : supportedLanguages[0]);

  const shouldCallPolish = supportedLanguages.includes("pl");
  const shouldCallEnglish = supportedLanguages.includes("en");

  // Build language-specific entity lists (workflow v1.7.0 parity)
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

  // Outer timeout for entire dual-language operation (defense-in-depth)
  // Individual calls already have 5s timeout, this is 10s for worst-case parallel execution
  const outerTimeoutMs = (piiConfig.api_timeout_ms || 5000) * 2;
  const [plResponse, enResponse] = await Promise.race([
    Promise.all(presidioTasks),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Dual-language PII detection timed out after ${outerTimeoutMs}ms`)), outerTimeoutMs)
    )
  ]);

  const plEntitiesRaw = plResponse?.entities || [];
  const enEntitiesRaw = enResponse?.entities || [];

  const combinedEntities = combineAndFilterEntities(
    plEntitiesRaw,
    enEntitiesRaw,
    detectedLanguage
  );

  const dedupedEntities = integrateRegexEntities(
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
    language_stats: languageStats
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
