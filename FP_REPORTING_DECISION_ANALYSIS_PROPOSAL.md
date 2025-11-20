# False Positive Reporting - Decision Analysis Enhancement Proposal

## Cel
Wzbogacenie modala Report Details o szczegółową analizę mechanizmów decyzyjnych systemu Vigil Guard, aby umożliwić precyzyjne śledzenie przyczyn błędnych/zbyt restrykcyjnych decyzji.

---

## Dostępne Dane w ClickHouse

### Tabela `events_processed` zawiera:

#### 1. **Pipeline Flow** (`pipeline_flow_json`)
```json
{
  "input_raw": "Original user input",
  "input_normalized": "Normalized version (leet speak, homoglyphs)",
  "after_sanitization": "After pattern removal",
  "after_pii_redaction": "After PII replacement with [EMAIL], [PERSON], etc.",
  "output_final": "Final output sent to user",
  "output_status": "ALLOWED | SANITIZED | BLOCKED"
}
```

**Użyteczność**: Pokazuje transformacje wejścia przez 40-węzłowy pipeline - widać gdzie nastąpiła zmiana.

---

#### 2. **Scoring Details** (`scoring_json`)
```json
{
  "sanitizer_score": 100,
  "prompt_guard_score": 1,
  "prompt_guard_percent": 100,
  "combined_severity": 5,
  "threat_score": 100,
  "score_breakdown": {
    "INPUT_VALIDATION": 100,
    "SQL_XSS_ATTACKS": 45,
    "JAILBREAK_ATTEMPT": 30
  },
  "match_details": [
    {
      "category": "SQL_XSS_ATTACKS",
      "matchCount": 3,
      "score": 45,
      "matches": [
        {
          "pattern": "\\bSELECT\\s+.*\\s+FROM\\b",
          "samples": ["SELECT * FROM users"]
        }
      ]
    }
  ]
}
```

**Użyteczność**:
- `score_breakdown` - które kategorie wykryły zagrożenie i z jaką wagą
- `match_details` - dokładne wzorce regex + przykłady dopasowań
- Pozwala ocenić czy wzorzec był zbyt agresywny (false positive)

---

#### 3. **Sanitizer Decision** (`sanitizer_json`)
```json
{
  "decision": "SANITIZE_HEAVY",
  "removal_pct": 35.7,
  "mode": "heavy",
  "score": 85,
  "breakdown": {
    "SQL_XSS_ATTACKS": 50,
    "JAILBREAK_ATTEMPT": 35
  },
  "pii": {
    "has": true,
    "entities_detected": 3,
    "detection_method": "presidio",
    "language_stats": {
      "detected_language": "pl",
      "detection_confidence": 0.95,
      "polish_entities": 2,
      "english_entities": 1,
      "regex_entities": 0
    },
    "entities": [
      {
        "type": "EMAIL_ADDRESS",
        "start": 14,
        "end": 28,
        "score": 1.0
      },
      {
        "type": "PESEL",
        "start": 50,
        "end": 61,
        "score": 0.75
      }
    ]
  }
}
```

**Użyteczność**:
- `decision` - jaka decyzja sanitizera (ALLOW, SANITIZE_LIGHT, SANITIZE_HEAVY, BLOCK)
- `removal_pct` - ile % tekstu zostało usunięte
- `pii.entities` - które dokładnie dane PII wykryto i z jakim score
- `language_stats` - metoda detekcji języka (entity-based vs statistical)

---

#### 4. **Final Decision** (`final_decision_json`)
```json
{
  "status": "SANITIZED",
  "blocked": false,
  "sanitized": true,
  "allowed": false,
  "action_taken": "ALLOW",
  "user_message": "",
  "internal_note": "Safe request confirmed by Prompt Guard (risk_score: 1.0000) - allowed",
  "source": "prompt_guard"
}
```

**Użyteczność**:
- `action_taken` - faktyczna akcja (ALLOW, SANITIZE_LIGHT, SANITIZE_HEAVY, BLOCK_BY_SANITIZER, BLOCK_BY_PG)
- `source` - kto podjął decyzję: `sanitizer_only`, `prompt_guard`, `sanitizer_pg_both`
- `internal_note` - czytelne wyjaśnienie decyzji

---

#### 5. **Dodatkowe Metadane**
```
- threat_score: Float64 (0-100)
- pg_score_percent: Float64 (0-100)
- final_status: "ALLOWED" | "SANITIZED" | "BLOCKED"
- final_action: LowCardinality(String)
- removal_pct: Float64 (0-100)
- processing_time_ms: UInt32
- pii_sanitized: UInt8 (0 or 1)
- pii_types_detected: Array(String)
- pii_entities_count: UInt32
- detected_language: String (pl, en, etc.)
```

---

## Propozycja Wizualizacji w Modalu

### Nowa Sekcja: "Decision Analysis" (po Status & Score, przed Comment)

```tsx
{/* ========== DECISION ANALYSIS ========== */}
<div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
  <h3 className="text-sm font-medium text-slate-300 mb-3">Decision Analysis</h3>

  {/* Decision Path */}
  <div className="mb-4">
    <div className="text-xs text-slate-400 mb-2">Decision Flow:</div>
    <div className="flex items-center gap-2">
      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
        Sanitizer Score: {report.sanitizer_score}
      </span>
      <svg className="w-4 h-4 text-slate-500" /* arrow icon */ />
      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
        PG Score: {report.pg_score_percent.toFixed(1)}%
      </span>
      <svg className="w-4 h-4 text-slate-500" /* arrow icon */ />
      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded font-mono">
        {report.final_action}
      </span>
    </div>
  </div>

  {/* Decision Source */}
  <div className="mb-4 grid grid-cols-3 gap-3">
    <div>
      <div className="text-xs text-slate-400">Decision Source</div>
      <div className="text-white text-sm font-mono">{report.decision_source}</div>
    </div>
    <div>
      <div className="text-xs text-slate-400">Processing Time</div>
      <div className="text-white text-sm font-mono">{report.processing_time_ms} ms</div>
    </div>
    <div>
      <div className="text-xs text-slate-400">Removal %</div>
      <div className="text-white text-sm font-mono">{report.removal_pct.toFixed(1)}%</div>
    </div>
  </div>

  {/* Internal Note */}
  {report.decision_reason && (
    <div className="bg-slate-900/50 border border-slate-600 rounded p-3">
      <div className="text-xs text-slate-400 mb-1">Internal Note:</div>
      <div className="text-slate-300 text-sm">{report.decision_reason}</div>
    </div>
  )}
</div>
```

---

### Rozszerzona Sekcja: "Score Breakdown" (już istniejąca, ale wzbogacona)

```tsx
{/* ========== SCORE BREAKDOWN ========== */}
{report.scoring_breakdown && Object.keys(report.scoring_breakdown.score_breakdown || {}).length > 0 && (
  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
    <h3 className="text-sm font-medium text-slate-300 mb-3">Score Breakdown by Category</h3>

    {/* Threat Categories Table */}
    <table className="w-full mb-4">
      <thead>
        <tr className="border-b border-slate-700">
          <th className="text-left py-2 text-xs text-slate-400">Category</th>
          <th className="text-right py-2 text-xs text-slate-400">Score</th>
          <th className="text-right py-2 text-xs text-slate-400">Weight</th>
          <th className="text-right py-2 text-xs text-slate-400">Matches</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(report.scoring_breakdown.score_breakdown).map(([category, score]) => {
          const details = report.pattern_matches.find(m => m.category === category);
          return (
            <tr key={category} className="border-b border-slate-700/30">
              <td className="py-2 text-sm text-white font-mono">{category}</td>
              <td className="py-2 text-sm text-white text-right font-bold">{score}</td>
              <td className="py-2 text-xs text-slate-400 text-right">
                {details ? `×${details.matchCount}` : '-'}
              </td>
              <td className="py-2 text-xs text-right">
                <button
                  onClick={() => toggleCategoryDetails(category)}
                  className="text-blue-400 hover:text-blue-300"
                >
                  {details?.matches?.length || 0} patterns
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>

    {/* Matched Patterns (Collapsible per category) */}
    {expandedCategories.includes('SQL_XSS_ATTACKS') && (
      <div className="bg-slate-900/50 border border-slate-600 rounded p-3 mb-2">
        <div className="text-xs text-slate-400 mb-2">SQL_XSS_ATTACKS - Matched Patterns:</div>
        {report.pattern_matches
          .find(m => m.category === 'SQL_XSS_ATTACKS')
          ?.matches.map((match, idx) => (
            <div key={idx} className="mb-2 pl-2 border-l-2 border-red-500">
              <div className="text-xs text-slate-400 font-mono">
                Pattern: {match.pattern.substring(0, 80)}...
              </div>
              {match.samples && match.samples.length > 0 && (
                <div className="text-xs text-red-300 mt-1">
                  Matched: "{match.samples[0]}"
                </div>
              )}
            </div>
          ))}
      </div>
    )}
  </div>
)}
```

---

### Nowa Sekcja: "PII Detection Details" (jeśli pii_sanitized = 1)

```tsx
{/* ========== PII DETECTION ========== */}
{report.pii_sanitized && report.sanitizer_breakdown?.pii && (
  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
    <h3 className="text-sm font-medium text-slate-300 mb-3">PII Detection Details</h3>

    {/* Language Detection */}
    <div className="mb-3 grid grid-cols-4 gap-3">
      <div>
        <div className="text-xs text-slate-400">Detected Language</div>
        <div className="text-white text-sm font-mono">
          {report.sanitizer_breakdown.pii.language_stats.detected_language}
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-400">Confidence</div>
        <div className="text-white text-sm font-mono">
          {(report.sanitizer_breakdown.pii.language_stats.detection_confidence * 100).toFixed(1)}%
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-400">Method</div>
        <div className="text-white text-sm">
          {report.sanitizer_breakdown.pii.language_stats.detection_method}
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-400">Processing</div>
        <div className="text-white text-sm font-mono">
          {report.sanitizer_breakdown.pii.processing_time_ms} ms
        </div>
      </div>
    </div>

    {/* Entity Sources */}
    <div className="mb-3 grid grid-cols-3 gap-2">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
        <div className="text-xs text-blue-400">Polish Entities</div>
        <div className="text-white text-lg font-mono">
          {report.sanitizer_breakdown.pii.language_stats.polish_entities}
        </div>
      </div>
      <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
        <div className="text-xs text-green-400">English Entities</div>
        <div className="text-white text-lg font-mono">
          {report.sanitizer_breakdown.pii.language_stats.english_entities}
        </div>
      </div>
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2">
        <div className="text-xs text-yellow-400">Regex Fallback</div>
        <div className="text-white text-lg font-mono">
          {report.sanitizer_breakdown.pii.language_stats.regex_entities}
        </div>
      </div>
    </div>

    {/* Detected Entities Table */}
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-700">
          <th className="text-left py-2 text-xs text-slate-400">Type</th>
          <th className="text-right py-2 text-xs text-slate-400">Position</th>
          <th className="text-right py-2 text-xs text-slate-400">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {report.sanitizer_breakdown.pii.entities.map((entity, idx) => (
          <tr key={idx} className="border-b border-slate-700/30">
            <td className="py-2 text-sm text-white">{entity.type}</td>
            <td className="py-2 text-xs text-slate-400 text-right font-mono">
              {entity.start}-{entity.end}
            </td>
            <td className="py-2 text-sm text-right">
              <span className={`px-2 py-0.5 rounded text-xs ${
                entity.score >= 0.9 ? 'bg-green-500/20 text-green-400' :
                entity.score >= 0.7 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {(entity.score * 100).toFixed(0)}%
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

---

### Nowa Sekcja: "Pipeline Transformations" (pokazuje każdy krok)

```tsx
{/* ========== PIPELINE FLOW ========== */}
{report.pipeline_flow && (
  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
    <h3 className="text-sm font-medium text-slate-300 mb-3">Pipeline Transformations</h3>

    <div className="space-y-3">
      {/* Step 1: Original Input */}
      <div className="border-l-2 border-blue-500 pl-3">
        <div className="text-xs text-slate-400 mb-1">1. Original Input</div>
        <div className="text-white text-sm font-mono bg-slate-900/50 p-2 rounded">
          {report.pipeline_flow.input_raw}
        </div>
      </div>

      {/* Step 2: Normalized */}
      {report.pipeline_flow.input_normalized !== report.pipeline_flow.input_raw && (
        <div className="border-l-2 border-yellow-500 pl-3">
          <div className="text-xs text-slate-400 mb-1">
            2. After Normalization
            <span className="ml-2 text-yellow-400">(leet speak, homoglyphs removed)</span>
          </div>
          <div className="text-white text-sm font-mono bg-slate-900/50 p-2 rounded">
            {report.pipeline_flow.input_normalized}
          </div>
        </div>
      )}

      {/* Step 3: After PII Redaction */}
      {report.pii_sanitized && (
        <div className="border-l-2 border-purple-500 pl-3">
          <div className="text-xs text-slate-400 mb-1">
            3. After PII Redaction
            <span className="ml-2 text-purple-400">
              ({report.pii_entities_count} entities replaced)
            </span>
          </div>
          <div className="text-white text-sm font-mono bg-slate-900/50 p-2 rounded">
            {report.pipeline_flow.after_pii_redaction}
          </div>
        </div>
      )}

      {/* Step 4: After Sanitization */}
      {report.removal_pct > 0 && (
        <div className="border-l-2 border-red-500 pl-3">
          <div className="text-xs text-slate-400 mb-1">
            4. After Sanitization
            <span className="ml-2 text-red-400">
              ({report.removal_pct.toFixed(1)}% removed)
            </span>
          </div>
          <div className="text-white text-sm font-mono bg-slate-900/50 p-2 rounded">
            {report.pipeline_flow.after_sanitization}
          </div>
        </div>
      )}

      {/* Step 5: Final Output */}
      <div className="border-l-2 border-green-500 pl-3">
        <div className="text-xs text-slate-400 mb-1">
          5. Final Output to User
        </div>
        <div className="text-white text-sm font-mono bg-slate-900/50 p-2 rounded">
          {report.pipeline_flow.output_final}
        </div>
      </div>
    </div>
  </div>
)}
```

---

## Wymagane Zmiany w Backend API

### 1. Rozszerzenie `getFPReportDetails()` w `clickhouse.ts`:

```typescript
export async function getFPReportDetails(reportId: string): Promise<FPReportDetailedEnhanced | null> {
  const query = `
    SELECT
      -- Existing fields
      fp.report_id,
      fp.event_id,
      fp.reported_by,
      fp.reason,
      fp.comment,
      formatDateTime(fp.timestamp, '%Y-%m-%dT%H:%i:%SZ') AS report_timestamp,
      formatDateTime(fp.event_timestamp, '%Y-%m-%dT%H:%i:%SZ') AS event_timestamp,
      fp.original_input,
      fp.final_status,
      fp.threat_score,

      -- NEW: Additional metadata for decision analysis
      ep.final_action,
      ep.removal_pct,
      ep.processing_time_ms,
      ep.pii_sanitized,
      ep.pii_types_detected,
      ep.pii_entities_count,
      ep.detected_language,

      -- Existing JSON fields
      arrayDistinct(
        arrayFilter(x -> x != '',
          arrayMap(x -> JSONExtractString(x, 'category'),
                   JSONExtractArrayRaw(ifNull(ep.scoring_json, '[]')))
        )
      ) AS detected_categories,

      toUInt8(ifNull(JSONExtractInt(ep.scoring_json, 'sanitizer_score'), 0)) AS sanitizer_score,
      toFloat64(ifNull(ep.pg_score_percent, 0)) AS pg_score_percent,

      -- NEW: Extract decision source from final_decision_json
      ifNull(JSONExtractString(ep.final_decision_json, 'source'), 'unknown') AS decision_source,
      ifNull(JSONExtractString(ep.final_decision_json, 'internal_note'), '') AS decision_reason,

      -- Full JSON blobs for detailed analysis
      ep.scoring_json AS scoring_breakdown,
      ep.sanitizer_json AS sanitizer_breakdown,
      ep.final_decision_json AS final_decision,
      ep.pipeline_flow_json AS pipeline_flow

    FROM n8n_logs.false_positive_reports AS fp
    LEFT JOIN n8n_logs.events_processed AS ep
      ON fp.event_id = ep.event_id
    WHERE fp.report_id = {reportId:String}
    LIMIT 1
  `;

  const resultSet = await client.query({
    query,
    query_params: { reportId },
    format: 'JSONEachRow',
  });

  const data = await resultSet.json<any>();

  if (data.length === 0) {
    return null;
  }

  const row = data[0];

  return {
    ...row,
    scoring_breakdown: row.scoring_breakdown ? JSON.parse(row.scoring_breakdown) : null,
    sanitizer_breakdown: row.sanitizer_breakdown ? JSON.parse(row.sanitizer_breakdown) : null,
    final_decision: row.final_decision ? JSON.parse(row.final_decision) : null,
    pipeline_flow: row.pipeline_flow ? JSON.parse(row.pipeline_flow) : null,
    pattern_matches: row.scoring_breakdown
      ? JSON.parse(row.scoring_breakdown).match_details || []
      : [],
  };
}
```

### 2. Nowy TypeScript Interface:

```typescript
export interface FPReportDetailedEnhanced extends FPReportDetailed {
  // Additional metadata
  final_action: string;
  removal_pct: number;
  processing_time_ms: number;
  pii_sanitized: number;
  pii_types_detected: string[];
  pii_entities_count: number;
  detected_language: string;
  decision_source: string;

  // Parsed JSON objects
  scoring_breakdown: {
    sanitizer_score: number;
    prompt_guard_score: number;
    prompt_guard_percent: number;
    threat_score: number;
    score_breakdown: Record<string, number>;
    match_details: Array<{
      category: string;
      matchCount: number;
      score: number;
      matches: Array<{
        pattern: string;
        samples: string[];
      }>;
    }>;
  } | null;

  sanitizer_breakdown: {
    decision: string;
    removal_pct: number;
    mode?: string;
    score: number;
    breakdown: Record<string, number>;
    pii?: {
      has: boolean;
      entities_detected: number;
      detection_method: string;
      processing_time_ms: number;
      language_stats: {
        detected_language: string;
        detection_confidence: number;
        detection_method: string;
        polish_entities: number;
        english_entities: number;
        regex_entities: number;
      };
      entities: Array<{
        type: string;
        start: number;
        end: number;
        score: number;
      }>;
    };
  } | null;

  final_decision: {
    status: string;
    action_taken: string;
    source: string;
    internal_note: string;
  } | null;

  pipeline_flow: {
    input_raw: string;
    input_normalized: string;
    after_sanitization: string;
    after_pii_redaction: string;
    output_final: string;
    output_status: string;
  } | null;

  pattern_matches: Array<{
    category: string;
    matchCount: number;
    score: number;
    matches: Array<{
      pattern: string;
      samples: string[];
    }>;
  }>;
}
```

---

## Korzyści z Implementacji

### 1. **Pełna Widoczność Pipeline'u**
- Widzisz każdy krok transformacji: oryginał → normalizacja → PII → sanitization → output
- Możesz zidentyfikować gdzie dokładnie nastąpiła niepożądana zmiana

### 2. **Precyzyjna Diagnoza Wzorców**
- `match_details` pokazuje dokładne regex patterns + przykłady dopasowań
- Możesz ocenić czy wzorzec był zbyt szeroki (np. `SELECT` łapie "Please select option")

### 3. **Analiza Decyzji PII**
- Widzisz które encje PII wykryto (PESEL, EMAIL, PERSON)
- Score dla każdej encji (0.75 = niższa pewność = potencjalny FP)
- Metodę detekcji (polish_entities vs english_entities vs regex_fallback)
- Język tekstu i confidence detekcji językowej

### 4. **Śledzenie Źródła Decyzji**
- `decision_source`: czy decyzję podjął Sanitizer czy Prompt Guard
- `final_action`: dokładna akcja (BLOCK_BY_SANITIZER vs BLOCK_BY_PG)
- `internal_note`: czytelne wyjaśnienie decyzji

### 5. **Metryki Wydajności**
- `processing_time_ms` - czy długi czas przetwarzania spowodował timeout?
- `removal_pct` - czy zbyt agresywna sanitization (>50% to red flag)

---

## Przykładowe Przypadki Użycia

### Scenariusz 1: Over-blocking SQL Query
**FP Report**: User napisał "Please SELECT one option from menu" → BLOCKED

**Analiza w modalu**:
```
Score Breakdown:
  SQL_XSS_ATTACKS: 50 (2 matches)

Matched Patterns:
  Pattern: \bSELECT\b.*
  Matched: "SELECT one option"

Decision Analysis:
  Sanitizer Score: 50
  PG Score: 15%
  Final Action: BLOCK_BY_SANITIZER
  Source: sanitizer_only
  Internal Note: "Blocked by pattern matching threshold"

Pipeline Flow:
  1. Original: "Please SELECT one option from menu"
  2. Normalized: "please select one option from menu"
  3. After Pattern Match: (blocked)
```

**Wniosek**: Wzorzec `\bSELECT\b` jest zbyt szeroki - łapie naturalne słowa. Wymaga contextual validation (np. sprawdzenie czy po SELECT jest FROM/WHERE).

---

### Scenariusz 2: False Positive PII (PERSON Detection)
**FP Report**: "Visit John Smith's website" → SANITIZED to "Visit [PERSON]'s website"

**Analiza w modalu**:
```
PII Detection Details:
  Detected Language: en (confidence: 92%)
  Method: statistical
  Processing: 21 ms

  English Entities: 1
  Polish Entities: 0
  Regex Fallback: 0

Detected Entities:
  PERSON (14-24): "John Smith" - Confidence: 85%

Pipeline Flow:
  1. Original: "Visit John Smith's website"
  2. After PII Redaction: "Visit [PERSON]'s website"
  3. Final Output: "Visit [PERSON]'s website"
```

**Wniosek**: PERSON entity detection ma tylko 85% confidence. W kontekście "website" może to być nazwa firmy/brand, nie osoba. Wymaga context-aware PII detection.

---

### Scenariusz 3: Prompt Guard Override
**FP Report**: "How to hack my own wifi password (forgot it)" → BLOCKED

**Analiza w modalu**:
```
Score Breakdown:
  HACKING_INSTRUCTIONS: 70

Decision Analysis:
  Sanitizer Score: 70 (would SANITIZE_HEAVY)
  PG Score: 95% (HIGH RISK)
  Final Action: BLOCK_BY_PG
  Source: prompt_guard
  Internal Note: "High risk injection detected by Prompt Guard (95% confidence)"

Pipeline Flow:
  1. Original: "How to hack my own wifi password (forgot it)"
  2. Normalized: "how to hack my own wifi password forgot it"
  3. PG Analysis: HIGH RISK (keyword: "hack", "password")
  4. Final: BLOCKED
```

**Wniosek**: Prompt Guard nadpisał decyzję Sanitizera mimo kontekstu "my own". Wymaga lepszego NLP do rozróżnienia "malicious hacking" vs "personal troubleshooting".

---

## Priorytety Implementacji

### Phase 1 (High Priority)
✅ **Decision Analysis** - źródło decyzji, flow scores, internal note
✅ **Score Breakdown** - kategorie + matched patterns (collapsible)
✅ **Pipeline Transformations** - visual diff każdego kroku

### Phase 2 (Medium Priority)
✅ **PII Detection Details** - entities table, language stats, confidence scores
✅ **Processing Metrics** - czas, removal %, detection methods

### Phase 3 (Nice to Have)
- Export decision analysis do CSV/JSON
- Bulk pattern analysis (common false positives across multiple reports)
- A/B testing suggestions ("try lowering threshold from 70 to 80")

---

## Podsumowanie

Ta propozycja przekształca modal FP Report Details z prostego "co się stało" w pełny **debugger decyzji systemu**. Użytkownik będzie mógł:

1. **Precyzyjnie zidentyfikować** który mechanizm (pattern matching, PII, Prompt Guard) spowodował błąd
2. **Zobaczyć dokładne wzorce** które triggerowały detekcję
3. **Ocenić confidence scores** dla PII entities (niski score = potencjalny FP)
4. **Śledzić transformacje** przez cały pipeline (gdzie tekst został zmieniony)
5. **Podjąć świadome decyzje** o tuning patterns/thresholds

To umożliwi iteracyjne doskonalenie reguł detekcji w oparciu o **real-world false positives**, nie ślepe zgadywanie.
