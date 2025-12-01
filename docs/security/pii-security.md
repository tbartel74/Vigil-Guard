# PII Security

Last updated: 2025-12-01

## Overview

Vigil Guard implements dual-language PII (Personally Identifiable Information) detection using Microsoft Presidio with regex fallback. The system supports Polish and English languages, with specialized recognizers for regional identifiers.

## Architecture

```
Input Text
    │
    ├─→ Language Detection (hybrid algorithm)
    │       │
    │       ├─ Entity-based hints (PESEL → Polish)
    │       └─ Statistical detection (langdetect)
    │
    ├─→ Presidio Analysis (parallel)
    │       │
    │       ├─ Polish model (pl_core_news_sm)
    │       │   └─ PL_PESEL, PL_NIP, PL_REGON, PL_ID_CARD
    │       │
    │       └─ English model (en_core_web_sm)
    │           └─ EMAIL, PHONE, CREDIT_CARD, PERSON
    │
    ├─→ Regex Fallback (when Presidio offline)
    │       └─ 13 patterns from pii.conf
    │
    └─→ Entity Deduplication
            └─ Remove overlaps, keep highest score
```

## Supported Entity Types

### Polish-Specific Entities

| Entity | Description | Validator |
|--------|-------------|-----------|
| `PL_PESEL` | Polish national ID (11 digits) | Checksum validation |
| `PL_NIP` | Tax ID (10 digits) | Checksum validation |
| `PL_REGON` | Business registry (9/14 digits) | Checksum validation |
| `PL_ID_CARD` | ID card number (3 letters + 6 digits) | Format + checksum |

### International Entities

| Entity | Description | Validator |
|--------|-------------|-----------|
| `EMAIL_ADDRESS` | Email addresses | RFC 5322 regex |
| `PHONE_NUMBER` | Phone numbers (international) | Format validation |
| `CREDIT_CARD` | Credit/debit cards | Luhn algorithm |
| `IBAN_CODE` | Bank account numbers | IBAN checksum |
| `IP_ADDRESS` | IPv4 and IPv6 addresses | Format validation |
| `URL` | Web addresses | URL parsing |
| `PERSON` | Person names | spaCy NER |
| `US_SSN` | US Social Security Number | Format validation |
| `UK_NHS` | UK NHS Number | Checksum validation |

## Redaction Tokens

Each entity type is replaced with a standardized token:

```
Original: My email is john@example.com and PESEL 44051401359
Redacted: My email is [EMAIL] and PESEL [PL_PESEL]
```

| Entity | Token |
|--------|-------|
| `EMAIL_ADDRESS` | `[EMAIL]` |
| `PHONE_NUMBER` | `[PHONE]` |
| `CREDIT_CARD` | `[CREDIT_CARD]` |
| `PL_PESEL` | `[PL_PESEL]` |
| `PL_NIP` | `[PL_NIP]` |
| `PERSON` | `[PERSON]` |
| `URL` | `[URL]` |

## False Positive Prevention

### PERSON Entity Filtering

The SmartPersonRecognizer includes multiple filter layers:

**Allow-list (90+ entries):**
- AI models: ChatGPT, Claude, Gemini, Llama, GPT-4
- Jailbreak personas: DAN, Sigma, UCAR, Yool NaN
- Tech brands: Instagram, Facebook, Twitter
- Pronouns: He, She, They, Him, Her

**Boundary Trimming:**
- Fixes Presidio's boundary extension bug
- Removes lowercase continuations from matches

**Pattern Filtering:**
- Rejects single-word matches
- Rejects ALL CAPS (NASA, FBI)
- Rejects pronouns

### Brand and Keyword Filtering

```json
{
  "pii_detection": {
    "false_positive_filters": {
      "brands": ["vigil guard", "claude", "chatgpt"],
      "operational": ["timestamp", "session", "request_id"]
    }
  }
}
```

## Regex Fallback

When Presidio is unavailable, the system uses regex patterns from `pii.conf`:

```json
{
  "EMAIL": {
    "pattern": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    "replacement": "[EMAIL]",
    "validator": null
  },
  "PL_PESEL": {
    "pattern": "\\b\\d{11}\\b",
    "replacement": "[PL_PESEL]",
    "validator": "pesel_checksum"
  }
}
```

### Validator Functions

- `pesel_checksum`: PESEL 11-digit checksum
- `nip_checksum`: NIP 10-digit checksum
- `regon_checksum`: REGON 9/14-digit checksum
- `luhn`: Credit card Luhn algorithm
- `iban_checksum`: IBAN mod-97 validation

## Configuration

### Detection Settings

```json
{
  "pii_detection": {
    "enabled": true,
    "confidence_threshold": 0.7,
    "languages": ["pl", "en"],
    "timeout_ms": 5000,
    "fallback_to_regex": true
  }
}
```

### Entity Selection

Enable/disable specific entity types via Web UI:

```json
{
  "pii_detection": {
    "entities": {
      "EMAIL_ADDRESS": true,
      "PHONE_NUMBER": true,
      "CREDIT_CARD": true,
      "PL_PESEL": true,
      "PERSON": false  // Disabled due to false positives
    }
  }
}
```

## ClickHouse Logging

PII detection results are logged to ClickHouse:

```sql
CREATE TABLE events_v2 (
    -- ... other columns ...
    pii_sanitized UInt8 DEFAULT 0,
    pii_types_detected Array(String) DEFAULT [],
    pii_entities_count UInt32 DEFAULT 0,
    pii_classification_json String DEFAULT '{}'
)
```

### Query Examples

```sql
-- Events with PII detected
SELECT * FROM events_v2 WHERE pii_sanitized = 1;

-- Top PII types
SELECT
    arrayJoin(pii_types_detected) as pii_type,
    count() as count
FROM events_v2
GROUP BY pii_type
ORDER BY count DESC;
```

## Security Best Practices

### Configuration Recommendations

1. **Set appropriate thresholds:**
   - High security: `confidence_threshold: 0.5`
   - Balanced: `confidence_threshold: 0.7`
   - Low false positives: `confidence_threshold: 0.85`

2. **Enable validators for critical entities:**
   - Always use checksum validation for PESEL, NIP, REGON
   - Enable Luhn for credit cards

3. **Monitor detection rates:**
   - Expected: 15-25% of requests contain PII
   - Alert if rate drops below 5% (detection issue)

### Compliance

- **GDPR/RODO:** All PII processing is local (no external API calls)
- **Data Minimization:** Only necessary fields logged
- **Right to Erasure:** Retention policies configurable

## Troubleshooting

### PII Not Detected

**Check:**
1. Presidio service health: `curl http://localhost:5001/health`
2. Language detection: `curl http://localhost:5002/detect`
3. Entity enabled in configuration
4. Confidence threshold not too high

### False Positives

**Actions:**
1. Add to brand filter list
2. Disable problematic entity type
3. Report via false positive feedback
4. Review SmartPersonRecognizer allow-list

### Performance Issues

**Optimization:**
1. Increase Presidio timeout
2. Reduce enabled entity types
3. Use regex fallback for high-volume scenarios
4. Scale Presidio container resources

## Related Documentation

- [Sanitization](sanitization.md) - Threat sanitization
- [PII Detection Guide](../PII_DETECTION.md) - Detailed architecture
- [API Reference](../API.md) - PII API endpoints
