import { parseFile } from "./fileOps.js";

const DEFAULT_PRESIDIO_URL = process.env.PRESIDIO_URL || "http://vigil-presidio-pii:5001";
const DEFAULT_LANGUAGE_DETECTOR_URL = process.env.LANGUAGE_DETECTOR_URL || "http://vigil-language-detector:5002/detect";

type PiiConfig = {
  redaction_mode?: "replace" | "mask" | "hash";
  redaction_tokens?: Record<string, string>;
  confidence_threshold?: number;
  languages?: string[];
  detection_mode?: string;
  context_enhancement?: boolean;
  api_timeout_ms?: number;
};

interface PresidioEntity {
  type: string;
  start: number;
  end: number;
  score: number;
  text?: string;
  source_language?: string;
}

interface AnalyzeOptions {
  text: string;
  entities?: string[];
  score_threshold?: number;
  return_decision_process?: boolean;
  language?: string;
}

interface DualAnalyzeResult {
  entities: PresidioEntity[];
  detection_method: string;
  processing_time_ms: number;
  redacted_text: string;
  language_stats: Record<string, any>;
}

let cachedUnifiedConfig: { data: any; etag: string } | null = null;
let cachedPiiConf: { data: any; etag: string } | null = null;

async function loadUnifiedConfig() {
  const file = await parseFile("unified_config.json");
  if (!cachedUnifiedConfig || cachedUnifiedConfig.etag !== file.etag) {
    cachedUnifiedConfig = { data: file.parsed, etag: file.etag };
  }
  return cachedUnifiedConfig.data;
}

async function loadPiiConf() {
  const file = await parseFile("pii.conf");
  if (!cachedPiiConf || cachedPiiConf.etag !== file.etag) {
    cachedPiiConf = { data: file.parsed, etag: file.etag };
  }
  return cachedPiiConf.data;
}

function getRedactionToken(entityType: string, originalText: string, piiConfig: PiiConfig) {
  const redactionMode = piiConfig.redaction_mode || "replace";
  const tokens = piiConfig.redaction_tokens || {};

  if (redactionMode === "mask") {
    if (!originalText || originalText.length <= 4) {
      return "*".repeat(originalText.length);
    }
    const first = originalText.substring(0, 2);
    const last = originalText.substring(originalText.length - 2);
    const masked = "*".repeat(originalText.length - 4);
    return `${first}${masked}${last}`;
  }

  return tokens[entityType] || `[${entityType}]`;
}

function deduplicateEntities(entities: PresidioEntity[]) {
  if (!entities.length) return [];
  const sorted = [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  const unique: PresidioEntity[] = [];
  for (const entity of sorted) {
    const overlaps = unique.some(existing => (
      entity.start < existing.end && entity.end > existing.start
    ));
    if (!overlaps) {
      unique.push(entity);
    }
  }
  return unique;
}

function applyRedactions(text: string, entities: PresidioEntity[], piiConfig: PiiConfig) {
  if (!entities.length) return text;

  let redacted = text;
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  for (const entity of sorted) {
    const replacement = getRedactionToken(entity.type, text.substring(entity.start, entity.end), piiConfig);
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
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    return {
      error: error.message,
      method: "fallback",
      language: null
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

// Map pii.conf rule names to Presidio entity types
const REGEX_TO_PRESIDIO_TYPE_MAP: Record<string, string> = {
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
};

function findRegexEntities(text: string, piiConf: any, piiConfig: PiiConfig, requestedEntities?: string[]): PresidioEntity[] {
  if (!piiConf || !Array.isArray(piiConf.rules)) {
    return [];
  }

  const order = piiConf.order || piiConf.rules.map((r: any) => r.name);
  const results: PresidioEntity[] = [];

  for (const ruleName of order) {
    const rule = piiConf.rules.find((r: any) => r.name === ruleName);
    if (!rule || !rule.pattern) continue;

    // Map pii.conf rule name to Presidio entity type
    const presidioType = REGEX_TO_PRESIDIO_TYPE_MAP[rule.name] || rule.name;

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
      console.warn(`Regex fallback failed for ${ruleName}: ${error.message}`);
    }
  }

  return results;
}

export async function analyzeDualLanguage(reqBody: AnalyzeOptions): Promise<DualAnalyzeResult> {
  if (!reqBody || typeof reqBody.text !== "string" || !reqBody.text.trim()) {
    throw new Error("Text is required for analysis");
  }

  const unifiedConfig = await loadUnifiedConfig();
  const piiConfig: PiiConfig = unifiedConfig?.pii_detection || {};
  const piiConf = await loadPiiConf();

  const generalEntities = ["CREDIT_CARD", "EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE", "IP_ADDRESS", "URL"];
  const polishSpecificEntities = ["PL_PESEL", "PL_NIP", "PL_REGON", "PL_ID_CARD", "PL_PHONE_NUMBER"];

  const supportedLanguages = Array.isArray(piiConfig.languages) && piiConfig.languages.length > 0
    ? piiConfig.languages
    : ["pl", "en"];

  const languageResult = await detectLanguage(reqBody.text, piiConfig.api_timeout_ms || 1200);
  const detectedLanguage = supportedLanguages.includes(languageResult?.language)
    ? languageResult.language
    : (supportedLanguages.includes("pl") ? "pl" : supportedLanguages[0]);

  const shouldCallPolish = supportedLanguages.includes("pl");
  const shouldCallEnglish = supportedLanguages.includes("en");

  // Build language-specific entity lists (workflow v1.7.0 parity)
  let polishEntitiesList: string[];
  let englishEntitiesList: string[];

  if (Array.isArray(reqBody.entities) && reqBody.entities.length > 0) {
    // User provided entities → split into language-specific lists
    const userEntities = reqBody.entities;

    // Polish model: Polish-specific entities + general entities (no PERSON yet)
    polishEntitiesList = userEntities.filter(e =>
      polishSpecificEntities.includes(e) || generalEntities.includes(e)
    );

    // English model: General entities only (no Polish-specific, no PERSON yet)
    englishEntitiesList = userEntities.filter(e =>
      generalEntities.includes(e)
    );

    // Adaptive PERSON routing based on detected language
    const userSelectedPerson = userEntities.includes("PERSON");
    if (userSelectedPerson) {
      if (detectedLanguage === "pl") {
        // Polish detected → PERSON goes to Polish model only
        if (!polishEntitiesList.includes("PERSON")) {
          polishEntitiesList.push("PERSON");
        }
      } else {
        // English/unknown → PERSON goes to English model only
        if (!englishEntitiesList.includes("PERSON")) {
          englishEntitiesList.push("PERSON");
        }
      }
    }
  } else {
    // No user entities → use workflow defaults
    polishEntitiesList = [...polishSpecificEntities, ...generalEntities];
    englishEntitiesList = [...generalEntities];

    // Adaptive PERSON routing for defaults
    if (detectedLanguage === "pl") {
      polishEntitiesList.push("PERSON");
    } else {
      englishEntitiesList.push("PERSON");
    }
  }

  // Remove duplicates (safety check)
  polishEntitiesList = [...new Set(polishEntitiesList)];
  englishEntitiesList = [...new Set(englishEntitiesList)];

  const tasks: Array<Promise<any>> = [];
  if (shouldCallPolish && polishEntitiesList.length > 0) {
    const payload: AnalyzeOptions = {
      text: reqBody.text,
      language: "pl",
      entities: polishEntitiesList,
      score_threshold: reqBody.score_threshold,
      return_decision_process: reqBody.return_decision_process
    };
    tasks.push(callPresidio(payload, piiConfig).catch(error => ({ error: error.message })));
  } else {
    tasks.push(Promise.resolve({ entities: [], processing_time_ms: 0 }));
  }

  if (shouldCallEnglish && englishEntitiesList.length > 0) {
    const payload: AnalyzeOptions = {
      text: reqBody.text,
      language: "en",
      entities: englishEntitiesList,
      score_threshold: reqBody.score_threshold,
      return_decision_process: reqBody.return_decision_process
    };
    tasks.push(callPresidio(payload, piiConfig).catch(error => ({ error: error.message })));
  } else {
    tasks.push(Promise.resolve({ entities: [], processing_time_ms: 0 }));
  }

  const [plResponse, enResponse] = await Promise.all(tasks);

  const plEntitiesRaw = plResponse?.entities || [];
  const enEntitiesRaw = enResponse?.entities || [];

  let combinedEntities = [
    ...annotateEntities(plEntitiesRaw, "pl"),
    ...annotateEntities(enEntitiesRaw, "en")
  ];

  if (detectedLanguage === "pl") {
    combinedEntities = combinedEntities.filter(entity => {
      if (entity.source_language === "en" && entity.type === "PERSON") {
        const candidate = (entity.text || "").trim();
        if (candidate.length < 3) {
          return false;
        }
        if (!/^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(candidate)) {
          return false;
        }
      }
      return true;
    });
  }

  let dedupedEntities = deduplicateEntities(combinedEntities);
  const requestedEntities = Array.isArray(reqBody.entities) && reqBody.entities.length > 0 ? reqBody.entities : undefined;
  const regexEntities = findRegexEntities(reqBody.text, piiConf, piiConfig, requestedEntities).filter(regexEntity => (
    !dedupedEntities.some(existing => regexEntity.start < existing.end && regexEntity.end > existing.start)
  ));

  if (regexEntities.length > 0) {
    dedupedEntities = deduplicateEntities([...dedupedEntities, ...regexEntities]);
  }

  const processingTime = Math.max(
    plResponse?.processing_time_ms || 0,
    enResponse?.processing_time_ms || 0
  );

  const languageStats = {
    detected_language: languageResult?.language || "unknown",
    primary_language: detectedLanguage,
    detection_method: languageResult?.method || "unknown",
    detection_confidence: languageResult?.confidence ?? null,
    polish_entities: plEntitiesRaw.length,
    english_entities: enEntitiesRaw.length,
    regex_entities: regexEntities.length,
    polish_entities_retained: dedupedEntities.filter(e => e.source_language === "pl").length,
    english_entities_retained: dedupedEntities.filter(e => e.source_language === "en").length,
    regex_entities_retained: dedupedEntities.filter(e => e.source_language === "regex").length,
    total_after_dedup: dedupedEntities.length
  };

  const redactedText = applyRedactions(reqBody.text, dedupedEntities, piiConfig);

  return {
    entities: dedupedEntities,
    detection_method: "presidio_dual_language",
    processing_time_ms: processingTime,
    redacted_text: redactedText,
    language_stats: languageStats
  };
}
