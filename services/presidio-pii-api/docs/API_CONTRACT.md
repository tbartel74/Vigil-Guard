# Presidio PII Detection API - Contract Specification

**Version:** 1.6.0
**Service:** vigil-presidio-pii
**Port:** 5001
**Protocol:** HTTP/REST
**Content-Type:** application/json

---

## Overview

This API provides PII (Personally Identifiable Information) detection using Microsoft Presidio with custom Polish recognizers. It's designed for integration with the Vigil Guard n8n workflow.

**Key Features:**
- 50+ entity types (built-in + custom Polish)
- NLP-based detection (spaCy models)
- Checksum validation (PESEL, NIP, REGON, credit cards)
- Context-aware scoring
- Fully offline (no external API calls)
- <200ms latency

---

## Endpoints

### 1. Health Check

**GET** `/health`

**Response:**
```json
{
  "status": "healthy",
  "version": "1.6.0",
  "service": "presidio-pii-api",
  "models_loaded": ["en_core_web_sm", "pl_core_news_sm"],
  "custom_recognizers": ["PL_REGON", "PL_NIP", "PL_ID_CARD", "PL_PESEL_ENHANCED"],
  "uptime_seconds": 3600
}
```

**Status Codes:**
- `200 OK` - Service healthy
- `503 Service Unavailable` - Models not loaded

---

### 2. Analyze Text for PII

**POST** `/analyze`

**Request Schema:**
```json
{
  "text": "string (required, 1-10000 chars)",
  "language": "string (optional, default: 'pl', values: 'pl'|'en')",
  "entities": ["string"] (optional, default: all),
  "score_threshold": "float (optional, default: 0.7, range: 0.0-1.0)",
  "return_decision_process": "boolean (optional, default: false)"
}
```

**Example Request:**
```json
{
  "text": "Jan Kowalski, PESEL 92032100157, NIP 123-456-32-18, email: jan@example.com",
  "language": "pl",
  "entities": ["PERSON", "PL_PESEL", "PL_NIP", "EMAIL"],
  "score_threshold": 0.7,
  "return_decision_process": true
}
```

**Response Schema:**
```json
{
  "entities": [
    {
      "type": "string (entity type)",
      "start": "integer (start position)",
      "end": "integer (end position)",
      "score": "float (confidence 0.0-1.0)",
      "text": "string (detected text)",
      "recognition_metadata": {
        "recognizer_name": "string",
        "recognizer_identifier": "string"
      }
    }
  ],
  "detection_method": "string (presidio|regex_fallback)",
  "processing_time_ms": "integer",
  "language": "string",
  "entities_requested": ["string"] (if specified),
  "decision_process": {} (optional, if return_decision_process=true)
}
```

**Example Response:**
```json
{
  "entities": [
    {
      "type": "PERSON",
      "start": 0,
      "end": 12,
      "score": 0.95,
      "text": "Jan Kowalski",
      "recognition_metadata": {
        "recognizer_name": "SpacyRecognizer",
        "recognizer_identifier": "SpacyRecognizer_139862847512320"
      }
    },
    {
      "type": "PL_PESEL",
      "start": 21,
      "end": 32,
      "score": 0.98,
      "text": "92032100157",
      "recognition_metadata": {
        "recognizer_name": "PL_PESEL_ENHANCED",
        "recognizer_identifier": "PatternRecognizer_PL_PESEL"
      }
    },
    {
      "type": "PL_NIP",
      "start": 38,
      "end": 51,
      "score": 0.95,
      "text": "123-456-32-18",
      "recognition_metadata": {
        "recognizer_name": "PL_NIP",
        "recognizer_identifier": "PatternRecognizer_PL_NIP"
      }
    },
    {
      "type": "EMAIL",
      "start": 59,
      "end": 75,
      "score": 1.0,
      "text": "jan@example.com",
      "recognition_metadata": {
        "recognizer_name": "EmailRecognizer",
        "recognizer_identifier": "EmailRecognizer_139862847513920"
      }
    }
  ],
  "detection_method": "presidio",
  "processing_time_ms": 124,
  "language": "pl",
  "entities_requested": ["PERSON", "PL_PESEL", "PL_NIP", "EMAIL"]
}
```

**Status Codes:**
- `200 OK` - Analysis completed successfully
- `400 Bad Request` - Invalid request (missing text, invalid language, etc.)
- `422 Unprocessable Entity` - Text too long (>10000 chars)
- `500 Internal Server Error` - Unexpected error

**Error Response:**
```json
{
  "error": "Invalid request",
  "message": "Text field is required",
  "status_code": 400
}
```

---

## Supported Entity Types

### Built-in (Presidio Standard)
| Entity Type | Description | Languages | Example |
|-------------|-------------|-----------|---------|
| `EMAIL` | Email address | all | `user@example.com` |
| `PHONE_NUMBER` | Phone number (international) | all | `+48 123 456 789` |
| `PERSON` | Person name (NLP) | pl, en | `Jan Kowalski` |
| `CREDIT_CARD` | Credit card with Luhn checksum | all | `4532-1234-5678-9010` |
| `IBAN` | IBAN with checksum | all | `PL61109010140000071219812874` |
| `IP_ADDRESS` | IPv4/IPv6 address | all | `192.168.1.1` |
| `URL` | Web URL | all | `https://example.com` |
| `US_SSN` | US Social Security Number | en | `123-45-6789` |
| `US_PASSPORT` | US Passport Number | en | `A12345678` |
| `UK_NHS` | UK NHS Number | en | `123 456 7890` |

### Custom Polish Recognizers
| Entity Type | Description | Checksum | Example |
|-------------|-------------|----------|---------|
| `PL_PESEL` | Polish PESEL (11 digits) | ✅ Yes | `92032100157` |
| `PL_NIP` | Tax ID (10 digits) | ✅ Yes | `123-456-32-18` |
| `PL_REGON` | Business ID (9 or 14 digits) | ✅ Yes | `123-456-785` |
| `PL_ID_CARD` | ID card number | ❌ No | `ABC123456` |

---

## Request Parameters

### `text` (required)
- Type: string
- Min length: 1 character
- Max length: 10,000 characters
- Description: Text to analyze for PII

**Example:**
```json
{
  "text": "Contact: Jan Kowalski, email: jan@example.com"
}
```

### `language` (optional)
- Type: string
- Default: `"pl"`
- Values: `"pl"`, `"en"`
- Description: Language of the text (affects NLP model and recognizers)

**Example:**
```json
{
  "text": "John Doe, SSN: 123-45-6789",
  "language": "en"
}
```

### `entities` (optional)
- Type: array of strings
- Default: all available entities
- Description: Filter which entity types to detect

**Example (detect only email and phone):**
```json
{
  "text": "Contact: jan@example.com, +48 123 456 789",
  "entities": ["EMAIL", "PHONE_NUMBER"]
}
```

**Example (detect only Polish PII):**
```json
{
  "text": "NIP: 123-456-32-18, PESEL: 92032100157",
  "entities": ["PL_NIP", "PL_PESEL", "PL_REGON", "PL_ID_CARD"]
}
```

### `score_threshold` (optional)
- Type: float
- Default: `0.7`
- Range: `0.0` - `1.0`
- Description: Minimum confidence score to include in results

**Example (high confidence only):**
```json
{
  "text": "Maybe an email: user@test",
  "score_threshold": 0.9
}
```

**Response (low-confidence entity filtered out):**
```json
{
  "entities": [],
  "detection_method": "presidio",
  "processing_time_ms": 45
}
```

### `return_decision_process` (optional)
- Type: boolean
- Default: `false`
- Description: Include detailed decision process metadata

**Example:**
```json
{
  "text": "NIP: 123-456-32-18",
  "return_decision_process": true
}
```

**Response includes:**
```json
{
  "decision_process": {
    "recognizers_used": ["PL_NIP"],
    "context_detected": ["nip", "podatku"],
    "score_adjustments": [
      {"reason": "context_match", "delta": +0.15},
      {"reason": "checksum_valid", "delta": +0.10}
    ]
  }
}
```

---

## Entity Detection Logic

### Confidence Scoring

1. **Base Pattern Match** (0.5-0.7)
   - Regex pattern matches entity format
   - Example: `\b\d{3}-\d{3}-\d{2}-\d{2}\b` for NIP

2. **Context Enhancement** (+0.1 to +0.3)
   - Surrounding words match context keywords
   - Example: "NIP podatnika:" → +0.2 for NIP entity

3. **Checksum Validation** (+0.1 to +0.2)
   - Mathematical validation passes
   - Example: NIP checksum valid → +0.15

4. **NLP Recognition** (0.8-0.95)
   - spaCy model recognizes entity (PERSON names)
   - Confidence from neural network

**Final Score Formula:**
```
final_score = min(1.0, base_score + context_boost + checksum_boost)
```

### Context-Aware Detection

**Example: NIP Detection**

Input text: `"Numer NIP podatnika: 123-456-32-18"`

1. Pattern match: `123-456-32-18` matches `\b\d{3}-\d{3}-\d{2}-\d{2}\b` → score = 0.60
2. Context words found: ["NIP", "podatnika"] → +0.20 boost
3. Checksum valid (algorithm passes) → +0.15 boost
4. **Final score: 0.95** ✅ (above threshold 0.7)

Input text: `"Numer zamówienia: 1234567890"`

1. Pattern match: `1234567890` matches `\b\d{10}\b` → score = 0.40
2. Context words: none found → +0.00
3. Checksum valid: ❌ invalid → +0.00
4. **Final score: 0.40** ❌ (below threshold 0.7)

---

## Checksum Algorithms

### PL_NIP (Tax ID)
**Format:** 10 digits (formatted: `123-456-78-90` or bare: `1234567890`)

**Algorithm:**
```python
def validate_nip(nip: str) -> bool:
    digits = [int(d) for d in nip if d.isdigit()]
    if len(digits) != 10:
        return False

    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    checksum = sum(d * w for d, w in zip(digits[:9], weights)) % 11
    return checksum == digits[9]
```

**Example:**
- Input: `123-456-32-18`
- Digits: `[1,2,3,4,5,6,3,2,1,8]`
- Calculation: `(1*6 + 2*5 + 3*7 + 4*2 + 5*3 + 6*4 + 3*5 + 2*6 + 1*7) % 11 = 8`
- Valid: `8 == 8` ✅

### PL_REGON (Business ID)
**Format:** 9 or 14 digits (formatted: `123-456-789` or `123-456-789-12345`)

**Algorithm (REGON-9):**
```python
def validate_regon_9(regon: str) -> bool:
    digits = [int(d) for d in regon if d.isdigit()]
    if len(digits) != 9:
        return False

    weights = [8, 9, 2, 3, 4, 5, 6, 7]
    checksum = sum(d * w for d, w in zip(digits[:8], weights)) % 11
    return checksum == digits[8]
```

**Algorithm (REGON-14):**
```python
def validate_regon_14(regon: str) -> bool:
    digits = [int(d) for d in regon if d.isdigit()]
    if len(digits) != 14:
        return False

    weights = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]
    checksum = sum(d * w for d, w in zip(digits[:13], weights)) % 11
    return checksum == digits[13]
```

### PL_PESEL (National ID)
**Format:** 11 digits (YYMMDDXXXXC)

**Algorithm:**
```python
def validate_pesel(pesel: str) -> bool:
    digits = [int(d) for d in pesel if d.isdigit()]
    if len(digits) != 11:
        return False

    weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
    checksum = (10 - (sum(d * w for d, w in zip(digits[:10], weights)) % 10)) % 10
    return checksum == digits[10]
```

**Example:**
- Input: `92032100157`
- Valid date: 1992-03-21 (or 2092-03-21 depending on month encoding)
- Checksum: `7` ✅

---

## Integration with n8n

### n8n Code Node Example

```javascript
const presidioUrl = 'http://vigil-presidio-pii:5001/analyze';

const response = await axios.post(presidioUrl, {
  text: $json.chatInput,
  language: 'pl',
  entities: ['EMAIL', 'PHONE_NUMBER', 'PERSON', 'PL_PESEL', 'PL_NIP', 'PL_REGON', 'CREDIT_CARD'],
  score_threshold: 0.7,
  return_decision_process: false
}, {
  timeout: 3000  // 3s timeout
});

const entities = response.data.entities || [];
const detectionMethod = response.data.detection_method;
const processingTime = response.data.processing_time_ms;

// Redaction logic (replace, hash, mask)
let redactedText = $json.chatInput;
for (const entity of entities.reverse()) {
  const replacement = `[${entity.type}]`;
  redactedText = redactedText.substring(0, entity.start) +
                 replacement +
                 redactedText.substring(entity.end);
}

return [{
  json: {
    original_text: $json.chatInput,
    redacted_text: redactedText,
    entities_detected: entities,
    detection_method: detectionMethod,
    processing_time_ms: processingTime
  }
}];
```

### Fallback to Regex (if Presidio offline)

```javascript
let detectionMethod = 'presidio';
let entities = [];

try {
  const response = await axios.post('http://vigil-presidio-pii:5001/analyze', payload, {
    timeout: 3000
  });
  entities = response.data.entities || [];
} catch (error) {
  // Presidio offline → fallback to regex rules
  detectionMethod = 'regex_fallback';
  entities = applyLegacyPiiRules($json.chatInput);
}

function applyLegacyPiiRules(text) {
  // 13 regex patterns from pii.conf (legacy)
  // ... (implementation in n8n PII_Redactor node)
}
```

---

## Performance Characteristics

### Latency Benchmarks
| Text Length | Entities Detected | Avg Latency | P95 Latency |
|-------------|-------------------|-------------|-------------|
| 100 chars | 0-2 | 45ms | 80ms |
| 500 chars | 2-5 | 95ms | 150ms |
| 1000 chars | 5-10 | 135ms | 200ms |
| 5000 chars | 10-20 | 180ms | 250ms |

**Target:** <200ms average for typical requests (500-1000 chars)

### Resource Usage
- **Memory:** ~250MB (includes spaCy models)
- **CPU:** 5-15% per request (single core)
- **Throughput:** ~50-100 requests/second (single instance)

---

## Edge Cases and Special Behaviors

### 1. Empty Text
**Request:**
```json
{"text": ""}
```

**Response:**
```json
{
  "error": "Invalid request",
  "message": "Text field cannot be empty",
  "status_code": 400
}
```

### 2. Text Too Long
**Request:**
```json
{"text": "..." } // >10,000 characters
```

**Response:**
```json
{
  "error": "Text too long",
  "message": "Maximum text length is 10,000 characters",
  "status_code": 422
}
```

### 3. No Entities Detected
**Request:**
```json
{"text": "This is a clean sentence with no PII."}
```

**Response:**
```json
{
  "entities": [],
  "detection_method": "presidio",
  "processing_time_ms": 38,
  "language": "pl"
}
```

### 4. Invalid Entity Type Requested
**Request:**
```json
{
  "text": "test",
  "entities": ["INVALID_TYPE"]
}
```

**Response:**
```json
{
  "entities": [],
  "detection_method": "presidio",
  "processing_time_ms": 22,
  "language": "pl",
  "entities_requested": ["INVALID_TYPE"]
}
```
(API continues, but recognizer for unknown type doesn't exist, so no results)

### 5. Overlapping Entities
When multiple entity types overlap (e.g., email inside URL), Presidio returns both:

**Input:** `"Visit https://user@example.com"`

**Response:**
```json
{
  "entities": [
    {"type": "URL", "start": 6, "end": 30, "score": 0.95, "text": "https://user@example.com"},
    {"type": "EMAIL", "start": 13, "end": 29, "score": 1.0, "text": "user@example.com"}
  ]
}
```

### 6. Mixed Language Text
For mixed PL/EN text, use `language: "pl"` (Polish model includes basic English support):

**Input:**
```json
{
  "text": "John Doe, NIP: 123-456-32-18, email: john@example.com",
  "language": "pl"
}
```

**Response:**
```json
{
  "entities": [
    {"type": "PERSON", "start": 0, "end": 8, "score": 0.85, "text": "John Doe"},
    {"type": "PL_NIP", "start": 15, "end": 28, "score": 0.95, "text": "123-456-32-18"},
    {"type": "EMAIL", "start": 37, "end": 53, "score": 1.0, "text": "john@example.com"}
  ]
}
```

---

## Security Considerations

### 1. No Data Persistence
- API does not store or log analyzed text
- All processing is in-memory only
- No external API calls (fully offline)

### 2. GDPR/RODO Compliance
- PII data never leaves local Docker network
- No third-party services contacted
- Suitable for processing sensitive data

### 3. Rate Limiting (Future)
Currently not implemented. For production:
- Recommend nginx rate limiting: 100 req/min per IP
- Circuit breaker pattern in n8n workflow

### 4. Input Sanitization
- Text length limited to 10,000 chars
- Special characters handled by spaCy (no injection risk)
- JSON schema validation on all inputs

---

## Troubleshooting

### Problem: 503 Service Unavailable
**Cause:** spaCy models not loaded yet

**Solution:**
```bash
# Wait for container to fully start (check logs)
docker logs vigil-presidio-pii

# Expected: "Models loaded successfully"
```

### Problem: Slow Response (>500ms)
**Cause:** Large text or many entities

**Solution:**
- Reduce text length (<1000 chars recommended)
- Filter entities with `entities` parameter
- Increase `score_threshold` to reduce false positives

### Problem: False Positives (order numbers detected as NIP)
**Cause:** Pattern match without context

**Solution:**
- Increase `score_threshold` to 0.8+
- Ensure context words are present ("NIP:", "podatku:", etc.)
- Report pattern to improve recognizers.yaml

### Problem: False Negatives (valid PESEL not detected)
**Cause:** Invalid checksum or no context

**Solution:**
- Verify PESEL checksum is correct
- Add context words ("PESEL:", "numer identyfikacyjny:")
- Lower `score_threshold` to 0.6 (temporary)

---

## Changelog

### Version 1.6.0 (2025-MM-DD)
- Initial API contract specification
- Custom Polish recognizers (NIP, REGON, ID card, PESEL)
- Checksum validation for all Polish ID types
- Context-aware detection with score boosting
- Offline operation (embedded spaCy models)

---

## References

- **Presidio Documentation:** https://microsoft.github.io/presidio/
- **spaCy Models:** https://spacy.io/models
- **NIP Checksum:** GUS (Główny Urząd Statystyczny) specification
- **REGON Checksum:** GUS specification
- **PESEL Checksum:** Polish Ministry of Interior specification

---

**Last Updated:** 2025-10-29
**Maintained By:** Vigil Guard Team
