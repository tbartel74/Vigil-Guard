# PII Detection with Microsoft Presidio

**Version:** 1.6.10
**Last Updated:** 2025-01-31
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation & Setup](#installation--setup)
4. [Configuration Reference](#configuration-reference)
5. [Custom Polish Recognizers](#custom-polish-recognizers)
6. [API Contract](#api-contract)
7. [Performance Tuning](#performance-tuning)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedure](#rollback-procedure)
10. [Migration from v1.5](#migration-from-v15)

---

## Overview

Vigil Guard v1.6 replaces 13 regex-based PII rules with **Microsoft Presidio**, an NLP-powered PII detection framework offering:

### Key Features

- **50+ PII Entity Types**: EMAIL, PHONE, PERSON (NLP), CREDIT_CARD (Luhn validation), IBAN, IP_ADDRESS, URL, etc.
- **Custom Polish Recognizers**: PESEL, NIP, REGON, Polish ID cards with checksum validation
- **Context-Aware Detection**: Reduces false positives by 60-80% using spaCy NLP models
- **100% Offline Operation**: No external API calls, all models embedded in Docker image
- **Automatic Fallback**: If Presidio offline, automatically falls back to legacy regex rules
- **GDPR/RODO Compliant**: Data never leaves local network

### Performance Improvements

| Metric | Before (Regex) | After (Presidio) | Improvement |
|--------|----------------|------------------|-------------|
| **Detection Coverage** | 13 patterns | 50+ entity types | +285% |
| **False Positive Rate** | ~30% | <10% | -67% |
| **Person Name Detection** | ❌ Not supported | ✅ NLP-based | NEW |
| **Checksum Validation** | ❌ Not supported | ✅ PESEL, NIP, REGON, cards | NEW |
| **Latency** | ~10ms | <200ms | Acceptable |

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Vigil Guard v1.6                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────┐    ┌──────────────────┐   ┌─────────────┐  │
│  │ n8n        │───>│ PII_Redactor_v2  │──>│ Presidio    │  │
│  │ Workflow   │    │ (Code Node)      │   │ PII API     │  │
│  └────────────┘    └──────────────────┘   │ :5001       │  │
│                              │             │             │  │
│                              │ Fallback   │ • en_core   │  │
│                              v             │ • pl_core   │  │
│                    ┌──────────────────┐   │ • Custom    │  │
│                    │ Legacy Regex     │   │   Polish    │  │
│                    │ Rules (13)       │   └─────────────┘  │
│                    └──────────────────┘                     │
│                                                             │
│  ┌────────────┐    ┌──────────────────┐   ┌─────────────┐  │
│  │ ClickHouse │<───│ Logging          │   │ Web UI      │  │
│  │ Database   │    │ (detection_method)   │ Config      │  │
│  └────────────┘    └──────────────────┘   └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Prompt arrives** → n8n Chat trigger
2. **PII_Redactor_v2 node**:
   - Reads `unified_config.json` (pii_detection section)
   - If `enabled=true` AND Presidio online → Call Presidio API
   - If Presidio offline OR `fallback_to_regex=true` → Use legacy regex
3. **Presidio API** (`http://vigil-presidio-pii:5001/analyze`):
   - Loads spaCy models (en_core_web_sm, pl_core_news_sm)
   - Applies custom recognizers (PESEL, NIP, REGON, ID card)
   - Returns entities with scores (0.0-1.0)
4. **PII_Redactor_v2 redacts** based on `redaction_mode`:
   - `replace`: `[EMAIL]`, `[PESEL]`, `[NIP]`, etc.
   - `hash`: SHA-256 hash (irreversible)
   - `mask`: Partial masking (e.g., `j***@example.com`)
5. **Logs to ClickHouse**: `detection_method` field tracks Presidio vs regex usage

---

## Installation & Setup

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 2 GB RAM (1 GB for Presidio service)
- 1 GB disk space (spaCy models ~60MB)

### Step 1: Model Download

**Automated** (during `./install.sh`):
```bash
cd /Users/tomaszbartel/Documents/Projects/Vigil-Guard
./install.sh
```

**Manual** (if needed):
```bash
./scripts/download-pii-models.sh
```

Models downloaded:
- `en_core_web_sm==3.7.1` (12 MB)
- `pl_core_news_sm==3.7.0` (19 MB)

Checksums verified in `services/presidio-pii-api/models/checksums.sha256`.

### Step 2: Build Presidio Docker Image

```bash
cd services/presidio-pii-api
docker build --no-cache -t vigil-presidio-pii:1.6.0 .
```

**Build time**: ~5-10 minutes
**Image size**: ~616 MB (target: <700 MB)

### Step 3: Start Services

```bash
cd /Users/tomaszbartel/Documents/Projects/Vigil-Guard
docker-compose up -d presidio-pii-api
```

### Step 4: Verify Health

```bash
curl http://localhost:5001/health
```

**Expected response**:
```json
{
  "status": "healthy",
  "version": "1.6.0",
  "recognizers_loaded": 7,
  "spacy_models": ["en_core_web_sm", "pl_core_news_sm"],
  "uptime_seconds": 42
}
```

### Step 5: Import n8n Workflow v1.6

1. Open n8n: `http://localhost:5678`
2. Import `services/workflow/workflows/Vigil-Guard-v1.6.json`
3. Update PII_Redactor_v2 node with code from `vigil-misc/PII_Redactor_v2.js` (Rev 4 FINAL)
4. Activate workflow

**Manual import required**: n8n API doesn't support code node updates.

---

## Configuration Reference

### Web UI Configuration

**Location**: Web UI → Configuration → PII Detection
**File**: `services/workflow/config/unified_config.json`

### Configuration Options

#### 1. Enable PII Detection

```json
{
  "pii_detection": {
    "enabled": true
  }
}
```

**Default**: `true`
**Impact**: When `false`, no PII redaction occurs

#### 2. Confidence Threshold

```json
{
  "pii_detection": {
    "confidence_threshold": 0.7
  }
}
```

**Range**: 0.5 - 1.0
**Default**: 0.7 (70% confidence)

| Threshold | Detection Rate | False Positive Rate |
|-----------|----------------|---------------------|
| 0.5 | High (more detections) | Higher (~15-20%) |
| **0.7** | **Balanced** | **Low (<10%)** ⭐ |
| 0.9 | Low (conservative) | Very Low (<3%) |

#### 3. Entity Types

```json
{
  "pii_detection": {
    "entities": [
      "EMAIL_ADDRESS",
      "PHONE_NUMBER",
      "PERSON",
      "PL_PESEL",
      "PL_NIP",
      "PL_REGON",
      "PL_ID_CARD",
      "CREDIT_CARD",
      "IBAN_CODE",
      "IP_ADDRESS",
      "URL"
    ]
  }
}
```

**Categories**:
- **Contact**: EMAIL_ADDRESS, PHONE_NUMBER
- **Identity**: PERSON, PL_PESEL, PL_ID_CARD
- **Business**: PL_NIP, PL_REGON
- **Financial**: CREDIT_CARD, IBAN_CODE
- **Technical**: IP_ADDRESS, URL

**Note**: `PERSON` requires NLP (spaCy) and may have lower confidence.

#### 4. Redaction Mode

```json
{
  "pii_detection": {
    "redaction_mode": "replace"
  }
}
```

**Options**:
- `replace`: Token replacement (`[EMAIL]`, `[PESEL]`)
- `hash`: SHA-256 hash (irreversible, privacy-preserving)
- `mask`: Partial masking (`j***@example.com`)

**Example outputs**:
```
Original: "Contact jan@example.com"

replace: "Contact [EMAIL]"
hash:    "Contact [SHA256:a3b2c1...]"
mask:    "Contact j***@example.com"
```

#### 5. Languages

```json
{
  "pii_detection": {
    "languages": ["pl", "en"]
  }
}
```

**Supported**: `pl` (Polish), `en` (English)
**Multi-language**: Automatically detects based on prompt content

#### 6. Fallback to Regex

```json
{
  "pii_detection": {
    "fallback_to_regex": true
  }
}
```

**Default**: `true` (recommended)
**Behavior**: If Presidio API offline or timeout → use legacy regex rules (13 patterns)

#### 7. Context Enhancement

```json
{
  "pii_detection": {
    "context_enhancement": true
  }
}
```

**Default**: `true`
**Impact**: Uses NLP context to reduce false positives (e.g., "Order number: 123456789" won't be detected as PESEL)

---

## Custom Polish Recognizers

Vigil Guard includes 4 custom recognizers for Polish PII with **checksum validation**.

### 1. PL_PESEL (Polish National ID)

**Format**: 11 digits (YYMMDDXXXXC, where C = checksum digit)
**Example**: `92032100157`

**Checksum Algorithm**:
```python
weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
checksum = sum(digit[i] * weights[i] for i in range(10)) % 10
valid = (10 - checksum) % 10 == digit[10]
```

**Patterns**:
- `\b\d{11}\b` (bare format, score: 0.6)
- With context keywords: `pesel`, `urodzenia` (score: 0.95)

### 2. PL_NIP (Polish Tax ID)

**Format**: 10 digits (XXXXXXXXX-C, where C = checksum digit)
**Example**: `123-456-32-18` or `1234563218`

**Checksum Algorithm**:
```python
weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
checksum = sum(digit[i] * weights[i] for i in range(9)) % 11
valid = checksum == digit[9]
```

**Patterns**:
- `\b\d{3}-\d{3}-\d{2}-\d{2}\b` (formatted, score: 0.95)
- `\b\d{10}\b` (bare, score: 0.6)
- With context: `nip`, `podatku`, `vat` (score boost: +0.2)

### 3. PL_REGON (Polish Business ID)

**Format**: 9 or 14 digits with checksum
**Example**: `123-456-789` or `123456789`

**Checksum Algorithm** (REGON-9):
```python
weights = [8, 9, 2, 3, 4, 5, 6, 7]
checksum = sum(digit[i] * weights[i] for i in range(8)) % 11
valid = checksum == digit[8]
```

**Patterns**:
- `\b\d{3}-?\d{3}-?\d{3}\b` (9-digit, score: 0.85)
- `\b\d{3}-?\d{3}-?\d{3}-?\d{5}\b` (14-digit, score: 0.90)

### 4. PL_ID_CARD (Polish ID Card Number)

**Format**: ABC123456 (3 letters + 6 digits)
**Example**: `ABC 123456` or `ABC123456`

**Patterns**:
- `\b[A-Z]{3}\s?\d{6}\b` (score: 0.85)
- With context: `dowód`, `osobisty`, `seria` (score boost: +0.1)

### Custom Recognizers Configuration

**File**: `services/presidio-pii-api/config/recognizers.yaml`

**Example**:
```yaml
- name: PL_PESEL
  supported_language: pl
  patterns:
    - name: pesel_bare
      regex: '\b\d{11}\b'
      score: 0.60
    - name: pesel_hinted
      regex: '\b\d{11}\b'
      score: 0.95
  context: ["pesel", "urodzenia", "identyfikacyjny"]
  validators:
    - checksum
```

**Validators**: Located in `services/presidio-pii-api/validators/polish.py`

---

## API Contract

### POST /analyze

**Endpoint**: `http://vigil-presidio-pii:5001/analyze`

**Request**:
```json
{
  "text": "Jan Kowalski, PESEL 92032100157, NIP 123-456-32-18",
  "language": "pl",
  "entities": ["PERSON", "PL_PESEL", "PL_NIP", "EMAIL_ADDRESS"],
  "score_threshold": 0.7,
  "return_decision_process": true
}
```

**Response**:
```json
{
  "entities": [
    {
      "type": "PERSON",
      "start": 0,
      "end": 12,
      "score": 0.95,
      "text": "Jan Kowalski"
    },
    {
      "type": "PL_PESEL",
      "start": 21,
      "end": 32,
      "score": 0.98,
      "text": "92032100157"
    },
    {
      "type": "PL_NIP",
      "start": 38,
      "end": 51,
      "score": 0.92,
      "text": "123-456-32-18"
    }
  ],
  "detection_method": "presidio",
  "processing_time_ms": 124,
  "decision_process": {
    "recognizers_used": ["pl_core_news_sm", "PL_PESEL_ENHANCED", "PL_NIP"],
    "total_entities_found": 3,
    "entities_above_threshold": 3
  }
}
```

### GET /health

**Endpoint**: `http://vigil-presidio-pii:5001/health`

**Response**:
```json
{
  "status": "healthy",
  "version": "1.6.0",
  "recognizers_loaded": 7,
  "spacy_models": ["en_core_web_sm", "pl_core_news_sm"],
  "uptime_seconds": 3600
}
```

---

## Performance Tuning

### Target Metrics

| Metric | Target | Acceptable | Unacceptable |
|--------|--------|------------|--------------|
| **Latency** | <100ms | <200ms | >500ms |
| **Memory** | <500MB | <1GB | >1.5GB |
| **False Positives** | <5% | <10% | >15% |
| **Detection Rate** | >95% | >85% | <80% |

### Optimization Tips

#### 1. Reduce Entity Types

If experiencing high latency, disable unused entity types:

```json
{
  "entities": [
    "EMAIL_ADDRESS",
    "PL_PESEL",
    "PL_NIP"
    // Removed: PERSON, CREDIT_CARD, IP_ADDRESS, URL
  ]
}
```

**Impact**: ~30-50ms latency reduction

#### 2. Increase Confidence Threshold

For fewer false positives:

```json
{
  "confidence_threshold": 0.85
}
```

**Trade-off**: Misses 10-15% of valid PII

#### 3. Disable NLP-Based Detection

`PERSON` entity requires NLP (slow). If not needed:

```json
{
  "entities": [
    // Removed PERSON from list
  ]
}
```

**Impact**: ~50-80ms latency reduction

#### 4. Use Fallback Mode for High-Traffic

If Presidio latency is unacceptable:

```json
{
  "fallback_to_regex": true
  // Stop Presidio container: docker stop vigil-presidio-pii
}
```

**Trade-off**: No checksum validation, no NLP-based detection

---

## Troubleshooting

### Issue 1: Presidio Container Won't Start

**Symptoms**:
```
Error: failed to create shim task: OCI runtime create failed
```

**Diagnosis**:
```bash
docker logs vigil-presidio-pii
```

**Common Causes**:
1. **Out of memory**: Increase Docker memory limit (Settings → Resources → Memory: 4GB+)
2. **Model files missing**: Re-run `./scripts/download-pii-models.sh`
3. **Port conflict**: Check if port 5001 in use: `lsof -i :5001`

**Solution**:
```bash
# Restart with fresh image
docker stop vigil-presidio-pii
docker rm vigil-presidio-pii
docker-compose up -d --build presidio-pii-api
```

### Issue 2: Custom Recognizers Not Loading

**Symptoms**:
```
ClickHouse logs show: entities_detected=0 for valid Polish PII
```

**Diagnosis**:
```bash
curl http://localhost:5001/health | jq '.recognizers_loaded'
# Expected: 7
# If <7: recognizers.yaml not loaded
```

**Solution**:
```bash
# Verify recognizers.yaml exists in container
docker exec vigil-presidio-pii ls -la /app/config/recognizers.yaml

# If missing, rebuild image
cd services/presidio-pii-api
docker build --no-cache -t vigil-presidio-pii:1.6.0 .
docker-compose restart presidio-pii-api
```

### Issue 3: High False Positive Rate

**Symptoms**:
```
Benign prompts flagged as PII (e.g., "Order 123456789" detected as PESEL)
```

**Solution**:
1. Increase confidence threshold:
   ```json
   { "confidence_threshold": 0.85 }
   ```
2. Enable context enhancement:
   ```json
   { "context_enhancement": true }
   ```
3. Review ClickHouse logs for specific false positives:
   ```sql
   SELECT original_input, sanitizer_json
   FROM n8n_logs.events_processed
   WHERE final_status = 'SANITIZED'
   ORDER BY timestamp DESC
   LIMIT 100;
   ```

### Issue 4: Latency > 500ms

**Symptoms**:
```
PII detection slowing down workflow
```

**Diagnosis**:
```bash
# Check Presidio API latency
time curl -X POST http://localhost:5001/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"test@example.com","language":"en"}'
```

**Solution**:
1. Reduce entity types (see Performance Tuning)
2. Disable NLP-based PERSON detection
3. Use fallback mode during high traffic
4. Scale horizontally (run multiple Presidio containers with load balancer)

### Issue 5: Checksum Validation Failing

**Symptoms**:
```
Valid PESEL not detected (checksum error)
```

**Solution**:
```bash
# Test checksum validator directly
docker exec vigil-presidio-pii python3 -c "
from validators.polish import validate_pesel
print(validate_pesel('92032100157'))  # Should return True
"
```

If validator code is wrong, update `services/presidio-pii-api/validators/polish.py` and rebuild image.

---

## Rollback Procedure

If PII modernization causes issues, rollback to v1.5 (regex rules).

### Quick Rollback (5 minutes)

```bash
cd /Users/tomaszbartel/Documents/Projects/Vigil-Guard

# 1. Stop Presidio service
docker stop vigil-presidio-pii

# 2. Restore backup
BACKUP_DIR="/Users/tomaszbartel/Documents/Projects/vigil-misc/vigil-guard-pii-rollback-v1.5"
cp -R "$BACKUP_DIR/services" .
cp "$BACKUP_DIR/docker-compose.yml" .
cp -R "$BACKUP_DIR/docs/"* docs/

# 3. Reimport old workflow
# Open n8n: http://localhost:5678
# Import: $BACKUP_DIR/services/workflow/workflows/Vigil-Guard-v1.5.json

# 4. Verify
curl http://localhost:8787/health
```

**Rollback instructions**: See `vigil-misc/vigil-guard-pii-rollback-v1.5/README_ROLLBACK.md`

### Git Rollback

```bash
git checkout v1.5.0-pre-pii-modernization
docker-compose down --remove-orphans
docker-compose up -d
```

---

## Migration from v1.5

### Breaking Changes

1. **PII Configuration Moved**: `pii.conf` → `unified_config.json` (section: `pii_detection`)
2. **New Workflow Node**: PII_Redactor → PII_Redactor_v2 (manual code update required)
3. **New Service**: Presidio API runs on port 5001 (ensure port available)
4. **ClickHouse Schema**: New field `detection_method` in `sanitizer_json`

### Migration Steps

1. **Backup Current Config**:
   ```bash
   ./scripts/create-pii-backup.sh
   ```

2. **Update unified_config.json**:
   ```bash
   # Add pii_detection section (see Configuration Reference)
   vim services/workflow/config/unified_config.json
   ```

3. **Start Presidio**:
   ```bash
   docker-compose up -d presidio-pii-api
   ```

4. **Update n8n Workflow**:
   - Import v1.6 workflow
   - Replace PII_Redactor code with PII_Redactor_v2

5. **Test**:
   ```bash
   cd services/workflow
   npm test e2e/pii-detection-presidio.test.js
   ```

6. **Monitor**:
   - Check Grafana for detection rate
   - Review ClickHouse logs for fallback events

### Compatibility Matrix

| Component | v1.5 | v1.6 | Compatible? |
|-----------|------|------|-------------|
| n8n Workflow | v1.5.json | v1.6.json | ⚠️ Manual update |
| unified_config.json | No PII section | Has `pii_detection` | ✅ Backward compatible |
| ClickHouse Schema | `sanitizer_json` | + `detection_method` field | ✅ Additive |
| Web UI | No PII panel | + PII Settings | ✅ Optional |

---

## Migration from v1.6.10 to v1.6.11

### Changes

**v1.6.11** includes two critical bug fixes:

1. **CREDIT_CARD Polish Language Support**:
   - **Before**: CREDIT_CARD recognizer only worked for English text (`supported_language: en`)
   - **After**: CREDIT_CARD recognizer now supports Polish text (`supported_language: pl`)
   - **Impact**: Credit cards in Polish prompts (e.g., "Karta 5555555555554444") are now correctly detected

2. **Hybrid Language Detection**:
   - **Before**: Short Polish text with numbers misclassified (e.g., "Karta i PESEL" → Indonesian)
   - **After**: Entity-based hints + statistical fallback (PESEL/NIP patterns → Polish)
   - **Impact**: Better accuracy for short text containing Polish PII

### Breaking Changes

**None** - fully backward compatible with v1.6.10.

### Migration Steps

1. **Rebuild Docker Images** (automatic on fresh install):
   ```bash
   cd services/presidio-pii-api
   docker build --no-cache -t vigil-presidio-pii:1.6.11 .

   cd ../language-detector
   docker build --no-cache -t vigil-language-detector:1.0.1 .
   ```

2. **Restart Services**:
   ```bash
   docker-compose restart presidio-pii-api language-detector
   ```

3. **Verify Fix**:
   ```bash
   # Test hybrid language detection
   curl -X POST http://localhost:5002/detect \
     -H "Content-Type: application/json" \
     -d '{"text":"Karta 5555555555554444 i PESEL 44051401359","detailed":true}'

   # Expected: "language": "pl", "method": "entity_based"

   # Test CREDIT_CARD in Polish
   curl -X POST http://localhost:5001/analyze \
     -H "Content-Type: application/json" \
     -d '{"text":"Moja karta: 4532015112830366","language":"pl","entities":["CREDIT_CARD"]}'

   # Expected: Entities detected
   ```

### Compatibility

| Component | v1.6.10 | v1.6.11 | Compatible? |
|-----------|---------|---------|-------------|
| Presidio API | CREDIT_CARD (EN only) | CREDIT_CARD (PL) | ✅ Backward compatible |
| Language Detector | Statistical only | Hybrid (entity+stats) | ✅ Same API contract |
| n8n Workflow | v1.6.10.json | v1.6.10.json | ✅ No changes needed |
| unified_config.json | Same | Same | ✅ No changes needed |

---

## Additional Resources

- **API Reference**: `docs/API.md` (endpoints: `/api/pii-detection/*`)
- **User Guide**: `docs/USER_GUIDE.md` (Web UI configuration)
- **Testing Guide**: `services/workflow/tests/e2e/pii-detection-*.test.js`
- **Presidio Service README**: `services/presidio-pii-api/README.md`
- **Microsoft Presidio Docs**: https://microsoft.github.io/presidio/

---

## License & Attribution

- **Vigil Guard**: MIT License
- **Microsoft Presidio**: MIT License
- **spaCy**: MIT License
- **Models**: spaCy models (MIT), Custom Polish recognizers (Vigil Guard, MIT)

**Built with** ❤️ **and Presidio**
