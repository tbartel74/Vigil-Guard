# Language Detection Microservice

Fast and accurate language detection for Vigil Guard PII detection system.

## Purpose

Eliminates cross-language false positives in PII detection by accurately detecting text language **before** routing to appropriate spaCy models.

## Problem Solved

**Before**: Polish text "to jeszcze jeden test" analyzed by EN spaCy model → "jeszcze jeden" detected as PERSON (false positive)

**After**: Text detected as Polish → routed to PL spaCy model → no false positive

## Technology

- **Library**: `langdetect` (Python port of Google's language-detection)
- **Algorithm**: Character n-gram analysis
- **Languages**: 55+ languages supported
- **Accuracy**: >99% for texts longer than 20 characters
- **Speed**: ~5-10ms per detection

## Key Feature

✅ **Handles Polish without diacritics**:
- "to jeszcze jeden test" → detected as Polish
- "jeszcze" (without ę) → still recognized as Polish

## API Endpoints

### POST /detect
Detect language for a single text.

**Request**:
```json
{
  "text": "to jeszcze jeden test",
  "detailed": false
}
```

**Response**:
```json
{
  "language": "pl",
  "language_name": "Polish",
  "confidence": 0.9999,
  "processing_time_ms": 5.2
}
```

### POST /batch
Detect languages for multiple texts.

**Request**:
```json
{
  "texts": [
    "to jeszcze jeden test",
    "this is another test",
    "das ist ein Test"
  ]
}
```

**Response**:
```json
{
  "results": [
    {"text": "to jeszcze jeden test", "language": "pl", "confidence": 0.9999},
    {"text": "this is another test", "language": "en", "confidence": 0.9998},
    {"text": "das ist ein Test", "language": "de", "confidence": 0.9997}
  ]
}
```

### GET /health
Health check endpoint.

## Docker

```bash
# Build
docker build -t vigil-language-detector:1.0.0 .

# Run
docker run -p 5002:5002 vigil-language-detector:1.0.0

# Test
curl -X POST http://localhost:5002/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"to jeszcze jeden test"}'
```

## Integration with n8n Workflow

```javascript
// In PII_Redactor_v2 node:
const axios = require('axios');

// Detect language
const langResponse = await axios.post('http://vigil-language-detector:5002/detect', {
  text: text
}, { timeout: 1000 });

const detectedLang = langResponse.data.language; // 'pl' or 'en'
const isProbablyPolish = (detectedLang === 'pl');

// Route to appropriate models
if (isProbablyPolish) {
  // Call PL model with PERSON
  // Call EN model without PERSON
} else {
  // Call EN model with PERSON
  // Call PL model without PERSON
}
```

## Supported Languages

Polish (pl), English (en), German (de), French (fr), Spanish (es), Italian (it), Czech (cs), Slovak (sk), Ukrainian (uk), Russian (ru), and 45+ more.

## Performance

- **Latency**: 5-10ms per request
- **Memory**: ~50MB
- **CPU**: Minimal (<1% idle)

## License

Part of Vigil Guard project
