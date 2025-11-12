# Presidio PII Detection API

**Version:** 1.6.0
**Service:** vigil-presidio-pii
**Port:** 5001
**Language Support:** Polish (pl), English (en)

---

## Overview

Presidio PII Detection API is a Flask-based microservice that provides PII (Personally Identifiable Information) detection using Microsoft Presidio with custom Polish recognizers. It's designed for integration with the Vigil Guard n8n workflow.

**Key Features:**
- 50+ entity types (built-in Presidio + 4 custom Polish recognizers)
- NLP-based detection using spaCy models (offline capable)
- Checksum validation for Polish ID numbers (NIP, REGON, PESEL)
- Context-aware scoring (keywords boost confidence)
- Fully offline operation (no external API calls)
- <200ms latency for typical requests
- Docker containerized with multi-stage builds

---

## Quick Start

### 1. Install Dependencies

```bash
cd services/presidio-pii-api

# Install Python dependencies
pip install -r requirements.txt

# Download spaCy models (if not already cached)
python -m spacy download en_core_web_sm
python -m spacy download pl_core_news_sm
```

### 2. Run Locally (Development)

```bash
python app.py
```

Service will start on `http://localhost:5001`

### 3. Run with Docker

```bash
# Build image
docker build -t vigil-presidio-pii:1.6.0 .

# Run container
docker run -d \
  --name vigil-presidio-pii \
  -p 5001:5001 \
  --network vigil-network \
  vigil-presidio-pii:1.6.0
```

### 4. Test Health Check

```bash
curl http://localhost:5001/health
```

Expected output:
```json
{
  "status": "healthy",
  "version": "1.6.0",
  "service": "presidio-pii-api",
  "models_loaded": ["en_core_web_sm", "pl_core_news_sm"],
  "custom_recognizers": [
    {"name": "PL_REGON", "entity": "PL_REGON", "language": "pl"},
    {"name": "PL_NIP", "entity": "PL_NIP", "language": "pl"},
    {"name": "PL_ID_CARD", "entity": "PL_ID_CARD", "language": "pl"},
    {"name": "PL_PESEL_ENHANCED", "entity": "PL_PESEL", "language": "pl"}
  ],
  "recognizers_count": 4,
  "offline_capable": true
}
```

---

## API Endpoints

### 1. Health Check

**GET** `/health`

Returns service status, loaded models, and custom recognizers.

### 2. Analyze Text

**POST** `/analyze`

Analyzes text for PII entities.

**Request:**
```json
{
  "text": "Jan Kowalski, PESEL: 92032100157, email: jan@example.com",
  "language": "pl",
  "entities": ["PERSON", "PL_PESEL", "EMAIL"],
  "score_threshold": 0.7,
  "return_decision_process": false
}
```

**Response:**
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
      "type": "EMAIL",
      "start": 41,
      "end": 57,
      "score": 1.0,
      "text": "jan@example.com"
    }
  ],
  "detection_method": "presidio",
  "processing_time_ms": 124,
  "language": "pl"
}
```

**See full API specification:** [docs/API_CONTRACT.md](docs/API_CONTRACT.md)

---

## Supported Entity Types

### Built-in (Presidio Standard)
- **EMAIL** - Email addresses
- **PHONE_NUMBER** - Phone numbers (international)
- **PERSON** - Person names (NLP-based)
- **CREDIT_CARD** - Credit cards with Luhn checksum
- **IBAN** - IBAN with checksum
- **IP_ADDRESS** - IPv4/IPv6 addresses
- **URL** - Web URLs
- And 40+ more standard types

### Custom Polish Recognizers
| Entity Type | Description | Checksum | Example |
|-------------|-------------|----------|---------|
| **PL_PESEL** | Polish National ID (11 digits) | ✅ Yes | `92032100157` |
| **PL_NIP** | Tax ID (10 digits) | ✅ Yes | `123-456-32-18` |
| **PL_REGON** | Business ID (9 or 14 digits) | ✅ Yes | `123-456-785` |
| **PL_ID_CARD** | ID card number | ❌ No | `ABC123456` |

---

## Configuration

### Custom Recognizers (YAML)

Custom recognizers are defined in `config/recognizers.yaml`:

```yaml
recognizers:
  - name: PL_NIP
    supported_language: pl
    supported_entity: PL_NIP
    patterns:
      - name: nip_formatted
        regex: '\b\d{3}-\d{3}-\d{2}-\d{2}\b'
        score: 0.95
      - name: nip_bare
        regex: '\b\d{10}\b'
        score: 0.50
    context:
      - "nip"
      - "NIP"
      - "podatku"
      - "vat"
    validators:
      - checksum_nip
```

**Key Components:**
- **patterns**: Regex patterns with base confidence scores
- **context**: Keywords that boost score when found nearby (±30 chars)
- **validators**: Python functions for checksum validation

### Adding New Recognizers

1. **Add pattern to `config/recognizers.yaml`:**
   ```yaml
   - name: CUSTOM_ID
     supported_language: pl
     supported_entity: CUSTOM_ID
     patterns:
       - name: custom_pattern
         regex: '\b[A-Z]{2}\d{8}\b'
         score: 0.80
     context: ["custom", "id"]
   ```

2. **Add validator (optional) in `validators/polish.py`:**
   ```python
   def checksum_custom(text: str) -> bool:
       """Validate CUSTOM_ID checksum"""
       # Implementation here
       return True
   ```

3. **Register validator in `validators/polish.py` __all__:**
   ```python
   __all__ = [
       # ...
       "checksum_custom"
   ]
   ```

4. **Import in `app.py` validator_map:**
   ```python
   validator_map = {
       # ...
       'checksum_custom': checksum_custom
   }
   ```

5. **Rebuild Docker image:**
   ```bash
   docker build -t vigil-presidio-pii:1.6.0 .
   ```

---

## Checksum Validation

### NIP (Tax ID)
**Algorithm:** Weighted modulo-11

```python
def validate_nip(nip: str) -> bool:
    digits = [int(d) for d in nip if d.isdigit()]
    if len(digits) != 10:
        return False
    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    checksum = sum(d * w for d, w in zip(digits[:9], weights)) % 11
    return checksum == digits[9]
```

### REGON (Business ID)
**Algorithm:** Weighted modulo-11 (different weights for 9 vs 14 digits)

**REGON-9:**
```python
weights = [8, 9, 2, 3, 4, 5, 6, 7]
checksum = sum(d * w for d, w in zip(digits[:8], weights)) % 11
```

**REGON-14:**
```python
weights = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]
checksum = sum(d * w for d, w in zip(digits[:13], weights)) % 11
```

### PESEL (National ID)
**Algorithm:** Weighted modulo-10

```python
def validate_pesel(pesel: str) -> bool:
    digits = [int(d) for d in pesel if d.isdigit()]
    if len(digits) != 11:
        return False
    weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
    weighted_sum = sum(d * w for d, w in zip(digits[:10], weights))
    checksum = (10 - (weighted_sum % 10)) % 10
    return checksum == digits[10]
```

**References:**
- [GUS - REGON specification](https://www.gov.pl/web/kas/numery-identyfikacyjne)
- [Ministry of Finance - NIP](https://www.gov.pl/web/finanse/nip)
- [Ministry of Interior - PESEL](https://www.gov.pl/web/gov/czym-jest-numer-pesel)

---

## Testing

### Run Unit Tests

```bash
cd services/presidio-pii-api

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_polish_recognizers.py -v

# Run with coverage
pytest tests/ --cov=validators --cov-report=html
```

**Expected output:**
```
tests/test_polish_recognizers.py::TestNIPValidation::test_valid_nip_formatted PASSED
tests/test_polish_recognizers.py::TestREGON9Validation::test_valid_regon_9_bare PASSED
tests/test_polish_recognizers.py::TestPESELValidation::test_valid_pesel_1992 PASSED
...
========================= 24 passed in 2.34s =========================
```

### Run Integration Tests

```bash
# Start service first
python app.py

# In another terminal
pytest tests/test_integration.py -v
```

### Test Offline Operation

```bash
# Build and run without network
docker build -t vigil-presidio-pii:1.6.0 .
docker run --rm --network=none -p 5001:5001 vigil-presidio-pii:1.6.0

# In another terminal
curl -X POST http://localhost:5001/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"test@example.com", "language":"en"}'
```

Expected: Service works without internet access ✅

---

## Performance

### Latency Benchmarks

| Text Length | Entities | Avg Latency | P95 Latency |
|-------------|----------|-------------|-------------|
| 100 chars | 0-2 | 45ms | 80ms |
| 500 chars | 2-5 | 95ms | 150ms |
| 1000 chars | 5-10 | 135ms | 200ms |
| 5000 chars | 10-20 | 180ms | 250ms |

**Target:** <200ms average for typical requests (500-1000 chars)

### Resource Usage
- **Memory:** ~250MB (includes spaCy models)
- **CPU:** 5-15% per request (single core)
- **Throughput:** ~50-100 requests/second (single instance)
- **Startup Time:** ~5-10 seconds (model loading)

### Optimization Tips

1. **Filter entity types:** Specify only needed entities
   ```json
   {"text": "...", "entities": ["EMAIL", "PL_NIP"]}
   ```

2. **Increase score threshold:** Reduce false positives
   ```json
   {"text": "...", "score_threshold": 0.8}
   ```

3. **Limit text length:** Split large texts into chunks (<1000 chars)

4. **Scale horizontally:** Run multiple instances behind load balancer

---

## Troubleshooting

### Problem: PERSON Entity False Positives (Fixed in v1.7.9+)

**Issue**: AI model names, jailbreak personas, pronouns, or tech brands detected as PERSON entities

**Root Cause**: Presidio boundary extension bug in SmartPersonRecognizer
- Regex patterns match correctly (e.g., `\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}` for "John Smith")
- Presidio incorrectly extends entity boundaries beyond regex match
- Example: Regex should match "John Smith" but Presidio returns "John Smith lives"
- Result: False positives for lowercase phrases like "every command", "amoral and obeys"

**Architecture Decision (v1.7.9+)**:
- **English PERSON Detection**: spaCy NER ONLY
  - SmartPersonRecognizer DISABLED due to boundary extension bug (app.py lines 607-631)
  - spaCy en_core_web_sm provides baseline detection
  - Post-processing filters applied (allow-list, pronouns, boundary trimming)
  - Trade-off: Lower detection rate, but zero false positives for AI models/jailbreak personas

- **Polish PERSON Detection**: spaCy NER + PatternRecognizer
  - spaCy pl_core_news_sm for linguistic detection
  - PatternRecognizer from recognizers.yaml (lines 98-124)
  - Fixed: `supported_language: pl` (was incorrectly set to `en`)
  - Post-processing filters applied

**Solution**:
1. **Disable SmartPersonRecognizer for English** (app.py lines 607-631):
   ```python
   # English SmartPersonRecognizer - DISABLED due to Presidio boundary extension bug
   # smart_person_recognizer_en = SmartPersonRecognizer(...)  # COMMENTED OUT
   ```

2. **Fix PERSON_PL language** (recognizers.yaml line 99):
   ```yaml
   - name: PERSON_PL
     supported_language: pl  # Fixed (was: en)
   ```

3. **Re-enable spaCy for English** (app.py line 509):
   ```python
   # PERSON entity: Use spaCy for English (SmartPersonRecognizer disabled)
   if language == 'en' and 'PERSON' in entities_filter:
       # spaCy en_core_web_sm enabled
   ```

4. **Post-processing filters** (app.py lines 500-605):
   - Allow-list: 90+ entries (AI models, pronouns, jailbreak personas, tech brands)
   - Boundary trimming, pronoun filtering, single-word filtering, ALL CAPS filtering

**Test Coverage**:
- Test file: `services/workflow/tests/e2e/pii-person-false-positives.test.js`
- Total: 16 tests, 100% passing
- Categories: Product names, jailbreak personas, pronouns, generic references, narrative text, valid names, edge cases

**Verification**:
```bash
# Test that ChatGPT is NOT detected as PERSON
curl -X POST http://localhost:5001/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "text": "ChatGPT is an AI assistant",
    "language": "en",
    "entities": ["PERSON"],
    "allow_list": ["ChatGPT"]
  }'
# Expected: "entities": []

# Test that John Smith IS detected as PERSON
curl -X POST http://localhost:5001/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "text": "John Smith lives in London",
    "language": "en",
    "entities": ["PERSON"]
  }'
# Expected: "entities": [{"type": "PERSON", "text": "John Smith", ...}]
```

**References**:
- Implementation: `app.py` lines 500-650
- Configuration: `config/recognizers.yaml` lines 98-124
- Test suite: `services/workflow/tests/e2e/pii-person-false-positives.test.js`
- Documentation: `docs/PII_DETECTION.md` Issue 0

---

### Problem: Service returns 503 on startup

**Cause:** spaCy models not loaded yet

**Solution:**
```bash
# Check logs
docker logs vigil-presidio-pii

# Wait for: "✅ Presidio Analyzer initialized successfully"
# Startup takes 5-10 seconds
```

### Problem: Custom recognizers not loaded

**Cause:** recognizers.yaml syntax error or file not found

**Solution:**
```bash
# Validate YAML syntax
python -c "import yaml; yaml.safe_load(open('config/recognizers.yaml'))"

# Check file exists
ls -la config/recognizers.yaml

# Check logs for error messages
docker logs vigil-presidio-pii | grep recognizer
```

### Problem: False positives (order numbers detected as NIP)

**Cause:** Pattern match without context or invalid checksum

**Solution:**
1. **Increase score threshold:**
   ```json
   {"text": "...", "score_threshold": 0.8}
   ```

2. **Add context keywords:**
   - Use "NIP:", "REGON:", "PESEL:" in your text
   - Context boosts score significantly

3. **Rely on checksum validation:**
   - Invalid checksums are rejected automatically
   - Only valid Polish IDs pass validation

### Problem: Slow response times (>500ms)

**Cause:** Large text or many entities

**Solution:**
1. **Split large texts** into chunks (<1000 chars each)
2. **Filter entities** to only needed types
3. **Increase container memory** (default: 512MB, increase to 1GB)
   ```yaml
   deploy:
     resources:
       limits:
         memory: 1G
   ```

### Problem: Models not working offline

**Cause:** Models not embedded in Docker image

**Solution:**
```bash
# Verify models in image
docker run --rm vigil-presidio-pii:1.6.0 python -c "import spacy; print(spacy.load('pl_core_news_sm'))"

# Rebuild with models
docker build --no-cache -t vigil-presidio-pii:1.6.0 .
```

---

## Architecture

### Service Structure

```
services/presidio-pii-api/
├── app.py                  # Flask application
├── config/
│   ├── nlp_config.yaml     # spaCy model configuration
│   └── recognizers.yaml    # Custom recognizer patterns
├── validators/
│   ├── __init__.py
│   └── polish.py           # Checksum validation functions
├── tests/
│   ├── __init__.py
│   ├── test_polish_recognizers.py  # Unit tests
│   └── test_integration.py         # API integration tests
├── docs/
│   └── API_CONTRACT.md     # Full API specification
├── models/                 # spaCy models cache (not in repo)
│   ├── en_core_web_sm-3.7.1.whl
│   ├── pl_core_news_sm-3.7.0.whl
│   └── checksums.sha256
├── Dockerfile              # Multi-stage build
├── requirements.txt        # Python dependencies
├── .dockerignore          # Docker build exclusions
└── README.md              # This file
```

### Data Flow

1. **Request arrives** at `/analyze` endpoint
2. **Validation** checks text length, parameters
3. **Presidio Analyzer** processes text:
   - **spaCy NLP** extracts linguistic features (PERSON names)
   - **Pattern recognizers** match regex patterns (EMAIL, PHONE, Polish IDs)
   - **Custom recognizers** from YAML (PL_NIP, PL_REGON, etc.)
4. **Context enhancement** boosts scores for matches near keywords
5. **Checksum validation** filters out invalid Polish IDs
6. **Score threshold** filters results
7. **Response** with entities + metadata

### Integration with n8n

```javascript
// n8n Code Node (PII_Redactor_v2)
const response = await axios.post(
  'http://vigil-presidio-pii:5001/analyze',
  {
    text: $json.chatInput,
    language: 'pl',
    entities: ['EMAIL', 'PHONE_NUMBER', 'PERSON', 'PL_PESEL', 'PL_NIP', 'PL_REGON'],
    score_threshold: 0.7
  },
  { timeout: 3000 }
);

const entities = response.data.entities || [];
// Redaction logic here...
```

---

## Docker Configuration

### Dockerfile (Multi-Stage Build)

```dockerfile
# Stage 1: Builder (install dependencies + models)
FROM python:3.12-slim AS builder
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY models/*.whl /tmp/models/
RUN pip install --no-index --find-links=/tmp/models en-core-web-sm pl-core-news-sm

# Stage 2: Runtime (copy only needed files)
FROM python:3.12-slim
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY config/ /app/config/
COPY validators/ /app/validators/
COPY app.py /app/
WORKDIR /app
EXPOSE 5001
CMD ["python", "app.py"]
```

### docker-compose.yml

```yaml
services:
  presidio-pii-api:
    build:
      context: ./services/presidio-pii-api
      dockerfile: Dockerfile
    container_name: vigil-presidio-pii
    image: vigil-presidio-pii:1.6.0
    ports:
      - "5001:5001"
    networks:
      - vigil-network
    volumes:
      - ./services/presidio-pii-api/config:/app/config:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

---

## Development

### Local Development Setup

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Download models
python -m spacy download en_core_web_sm
python -m spacy download pl_core_news_sm

# 4. Run app
python app.py

# 5. Run tests
pytest tests/ -v
```

### Code Style

- **Python:** PEP 8 compliant
- **Docstrings:** Google style
- **Type hints:** Where applicable
- **Line length:** Max 100 characters

### Testing Strategy

1. **Unit tests:** `validators/polish.py` functions
2. **Integration tests:** Flask API endpoints
3. **Manual tests:** Context-aware detection, false positives
4. **Performance tests:** Latency benchmarks

---

## Security

### Data Privacy
- **No persistence:** API does not store or log analyzed text
- **No external calls:** Fully offline operation (GDPR/RODO compliant)
- **Local network only:** Runs on Docker internal network (`vigil-network`)

### Input Validation
- Text length limited to 10,000 characters
- JSON schema validation on all inputs
- Score threshold validation (0.0-1.0)

### Container Security
- **Non-root user:** Runs as user `presidio` (UID 1001)
- **Read-only volumes:** Config files mounted as `:ro`
- **Health checks:** Automated restart on failure

---

## License

**Presidio:** Apache License 2.0 (Microsoft)
**spaCy:** MIT License
**Vigil Guard:** [Project License]

---

## References

- [Microsoft Presidio Documentation](https://microsoft.github.io/presidio/)
- [spaCy Models](https://spacy.io/models)
- [Polish PII Specifications (GUS)](https://www.gov.pl/web/kas/numery-identyfikacyjne)
- [Vigil Guard Main Documentation](../../docs/)

---

**Last Updated:** 2025-10-29
**Maintained By:** Vigil Guard Team
