/**
 * TypeScript Type Definitions for PII Detection System
 *
 * Architecture:
 * - Branded types for entity type safety (prevents string confusion)
 * - Discriminated unions for entity sources (compile-time exhaustiveness)
 * - Type guards for runtime validation (type narrowing)
 *
 * Benefits:
 * - Compile-time error detection (e.g., invalid entity type assignments)
 * - Better IDE autocomplete (entity types, source discrimination)
 * - Runtime type safety via guards (isPresidioEntity, isRegexEntity, etc.)
 * - Prevents bugs from mixing entity sources (pl/en/regex/fallback)
 *
 * @see services/web-ui/backend/src/piiAnalyzer.ts for usage
 */

/**
 * Branded Type for Presidio Entity Types
 *
 * Branding prevents accidentally using plain strings as entity types:
 * ```typescript
 * const entityType: PresidioEntityType = "EMAIL_ADDRESS"; // ✅ OK (known type)
 * const entityType: PresidioEntityType = "INVALID_TYPE";   // ❌ Compile error
 * ```
 *
 * Type safety without runtime overhead (brand is erased at runtime).
 */
type Brand<T, B> = T & { __brand: B };

/**
 * Known Presidio Entity Types (50+ standard + Polish custom)
 *
 * This is the canonical list of all supported entity types.
 * Update this when adding new Presidio recognizers.
 */
export const KNOWN_ENTITY_TYPES = [
  // Email & Communication
  "EMAIL_ADDRESS", "EMAIL", "PHONE_NUMBER", "PL_PHONE_NUMBER", "PHONE_PL", "PHONE_INTL",

  // Financial
  "CREDIT_CARD", "CARD_PAN", "IBAN_CODE", "IBAN", "CRYPTO",

  // Polish National IDs
  "PL_PESEL", "PESEL_HINTED", "PESEL_BARE",
  "PL_NIP", "NIP_HINTED", "NIP_BARE",
  "PL_REGON", "REGON_HINTED", "REGON_BARE",
  "PL_ID_CARD", "PL_ID", "PL_ID_BARE",

  // US IDs
  "US_SSN", "US_ITIN", "US_PASSPORT", "US_DRIVER_LICENSE", "US_BANK_NUMBER",

  // UK IDs
  "UK_NHS", "UK_NINO",

  // EU IDs
  "ES_NIF", "ES_NIE",
  "IT_FISCAL_CODE", "IT_DRIVER_LICENSE", "IT_VAT_CODE", "IT_PASSPORT", "IT_IDENTITY_CARD",
  "FI_PERSONAL_IDENTITY_CODE",

  // Asia-Pacific IDs
  "SG_NRIC_FIN", "SG_UEN",
  "AU_ABN", "AU_ACN", "AU_TFN", "AU_MEDICARE",
  "IN_PAN", "IN_AADHAAR", "IN_VEHICLE_REGISTRATION", "IN_VOTER", "IN_PASSPORT", "IN_GSTIN",

  // Generic
  "PERSON", "LOCATION", "DATE_TIME", "IP_ADDRESS", "URL", "NRP", "MEDICAL_LICENSE"
] as const;

export type KnownEntityType = typeof KNOWN_ENTITY_TYPES[number];
export type PresidioEntityType = Brand<KnownEntityType, "PresidioEntityType">;

/**
 * Discriminated Union for PII Entity Sources
 *
 * Each entity can come from one of four sources:
 * 1. **presidio** - Polish Presidio model (pl_core_news_lg spaCy)
 * 2. **presidio_en** - English Presidio model (en_core_web_lg spaCy)
 * 3. **regex** - Regex fallback from pii.conf
 * 4. **fallback** - Language detection fallback (when service unavailable)
 *
 * Discriminated union enables exhaustive pattern matching:
 * ```typescript
 * switch (entity.source) {
 *   case 'presidio': return entity.score; // TypeScript knows entity.score exists
 *   case 'regex': return 1.0;             // No score field for regex
 *   case 'fallback': return entity.confidence;
 * }
 * ```
 */
export type PresidioEntity =
  | {
      source: "presidio";
      entity_type: PresidioEntityType;
      start: number;
      end: number;
      score: number;
      text?: string;
      source_language: "pl" | "en";
    }
  | {
      source: "regex";
      entity_type: PresidioEntityType;
      start: number;
      end: number;
      score: 1.0; // Always 1.0 for regex matches
      text?: string;
      source_language: "regex";
      pattern_name: string; // Which regex rule matched (e.g., "PESEL_HINTED")
    }
  | {
      source: "fallback";
      entity_type: PresidioEntityType;
      start: number;
      end: number;
      confidence: number; // Different from score (language detection confidence)
      text?: string;
      source_language: string;
      fallback_reason: string; // Why fallback was used (e.g., "presidio_timeout")
    };

/**
 * Type Guards for Runtime Discrimination
 *
 * Type guards enable safe runtime type narrowing:
 * ```typescript
 * if (isPresidioEntity(entity)) {
 *   console.log(entity.score); // ✅ TypeScript knows score exists
 *   console.log(entity.pattern_name); // ❌ Compile error (only on regex entities)
 * }
 * ```
 */
export function isPresidioEntity(entity: PresidioEntity): entity is Extract<PresidioEntity, { source: "presidio" }> {
  return entity.source === "presidio";
}

export function isRegexEntity(entity: PresidioEntity): entity is Extract<PresidioEntity, { source: "regex" }> {
  return entity.source === "regex";
}

export function isFallbackEntity(entity: PresidioEntity): entity is Extract<PresidioEntity, { source: "fallback" }> {
  return entity.source === "fallback";
}

/**
 * Entity Type Validation Result
 *
 * Returned by validateEntityTypes() for permissive validation:
 * - valid: Known entity types that Presidio can process
 * - unknown: Unrecognized types (passed through but logged)
 * - warnings: User-facing messages about unknown types
 */
export interface EntityTypeValidation {
  valid: PresidioEntityType[];
  unknown: string[];
  warnings: string[];
}

/**
 * Language Detection Result (from hybrid detector)
 */
export interface LanguageDetectionResult {
  language: string | null;
  method: string; // "entity_hints", "statistical", "fallback"
  confidence: number;
  error?: string;
  is_service_error?: boolean;
}

/**
 * Language Statistics (workflow v1.7.7 format)
 */
export interface LanguageStats {
  detected_language: string; // Raw detector output (may be null)
  primary_language: string;  // Guaranteed non-null (fallback applied)
  detection_method: string;
  detection_confidence: number | null;
  language_detection_degraded?: boolean;  // NEW v1.8.1: Flag when language detector service failed
  polish_entities: number;
  english_entities: number;
  regex_entities: number;
  polish_entities_retained: number;
  english_entities_retained: number;
  regex_entities_retained: number;
  total_after_dedup: number;
}

/**
 * Regex Fallback Metadata
 */
export interface RegexFallbackMeta {
  regex_entities_attempted: number;
  regex_entities_added: number;
  regex_rule_failures: number;
  failed_rule_details?: Array<{
    name: string;
    presidio_type: string;
    error: string;
  }>;
  degraded: boolean; // True if any regex rules failed
}

/**
 * Dual-Language Analysis Result
 */
export interface DualAnalyzeResult {
  entities: PresidioEntity[];
  detection_method: string;
  processing_time_ms: number;
  redacted_text: string;
  language_stats: LanguageStats;
  regex_fallback?: RegexFallbackMeta;
  detection_complete?: boolean;
  warnings?: string[];
}

/**
 * PII Configuration (from unified_config.json)
 */
export interface PiiConfig {
  redaction_mode?: "replace" | "mask" | "hash";
  redaction_tokens?: Record<string, string>;
  confidence_threshold?: number;
  languages?: string[];
  detection_mode?: "strict" | "balanced" | "permissive";
  context_enhancement?: boolean;
  api_timeout_ms?: number;
}

/**
 * Analysis Request Options
 */
export interface AnalyzeOptions {
  text: string;
  entities?: PresidioEntityType[];
  score_threshold?: number;
  return_decision_process?: boolean;
  language?: string;
}

/**
 * Helper: Create a Presidio entity from raw API response
 */
export function createPresidioEntity(
  apiEntity: any,
  sourceLanguage: "pl" | "en"
): Extract<PresidioEntity, { source: "presidio" }> {
  return {
    source: "presidio",
    entity_type: apiEntity.type as PresidioEntityType,
    start: apiEntity.start,
    end: apiEntity.end,
    score: apiEntity.score,
    text: apiEntity.text,
    source_language: sourceLanguage
  };
}

/**
 * Helper: Create a regex entity from pattern match
 */
export function createRegexEntity(
  match: RegExpExecArray,
  entityType: PresidioEntityType,
  patternName: string
): Extract<PresidioEntity, { source: "regex" }> {
  return {
    source: "regex",
    entity_type: entityType,
    start: match.index,
    end: match.index + match[0].length,
    score: 1.0,
    text: match[0],
    source_language: "regex",
    pattern_name: patternName
  };
}
