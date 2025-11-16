# Language Detection E2E Tests

**Test Suite:** `e2e/language-detection.test.js`
**Total Test Cases:** 50
**Webhook:** `http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1`

## Prerequisites

1. **Language Detection Service Running:**
   ```bash
   docker-compose ps language-detector
   # Should show: Up (healthy)
   ```

2. **n8n Workflow Active:**
   - Open: http://localhost:5678
   - Import: `services/workflow/workflows/Vigil-Guard-v1.8.1.json`
   - **Activate workflow** (toggle ON)

3. **ClickHouse Password Set:**
   ```bash
   grep CLICKHOUSE_PASSWORD .env
   export CLICKHOUSE_PASSWORD=<your-password>
   ```

## Running Tests

```bash
cd services/workflow

# Run all language detection tests (50 tests)
npm test -- language-detection.test.js

# Run specific test group
npm test -- language-detection.test.js -t "Polish Text"
npm test -- language-detection.test.js -t "Edge Cases"
npm test -- language-detection.test.js -t "PII Cross-Language"

# Watch mode (for development)
npm test -- language-detection.test.js --watch
```

## Test Coverage

### 1. Polish Text Detection (8 tests)
Tests proper detection of Polish language and prevention of false positives.

**Key Tests:**
- ✅ Common Polish words ("to jeszcze jeden test")
- ✅ Word "jest" not masked as [PERSON]
- ✅ Polish questions ("Czy to działa poprawnie?")
- ✅ Polish with diacritics ("Zażółć gęślą jaźń")
- ✅ Polish without diacritics (common in informal writing)
- ✅ Formal Polish text
- ✅ Polish with numbers
- ✅ Longer Polish text (multi-sentence)

**Expected Behavior:**
- Language detected as `pl`
- Polish words like "jest", "jeszcze" NOT masked as PERSON
- Polish-only entities (PESEL, NIP) detected by PL model

### 2. English Text Detection (6 tests)
Validates English language detection and processing.

**Key Tests:**
- ✅ Simple English sentences
- ✅ English questions
- ✅ Technical terminology
- ✅ English with numbers
- ✅ Formal English text
- ✅ Longer English paragraphs

**Expected Behavior:**
- Language detected as `en`
- English PERSON entities detected correctly
- Cross-language PII (email, credit card) detected

### 3. Edge Cases (10 tests)
Tests unusual or boundary conditions.

**Key Tests:**
- ✅ Very short text (3 words Polish/English)
- ✅ Text with mostly numbers
- ✅ Special characters (@, #, $, !)
- ✅ Emojis (👋 🚀)
- ✅ URLs (https://example.com)
- ✅ Code snippets (const x = 10;)
- ✅ Excessive punctuation (!!!???)
- ✅ Single word detection

**Expected Behavior:**
- Service gracefully handles edge cases
- Falls back to English on ambiguous input
- No crashes or errors

### 4. Mixed Language (3 tests)
Tests code-switching and multilingual input.

**Key Tests:**
- ✅ Polish text with English words
- ✅ English text with Polish words
- ✅ Sentence-level code-switching

**Expected Behavior:**
- Detects dominant language
- Handles mixed content gracefully

### 5. PII Cross-Language Handling (9 tests)
Critical tests for cross-language false positive prevention.

**Key Tests:**
- ✅ Credit card detection in Polish text
- ✅ Credit card detection in English text
- ✅ Email detection in both languages
- ✅ **"jest" NOT detected as PERSON in Polish** (regression test)
- ✅ **"jeszcze" NOT detected as PERSON in Polish** (regression test)
- ✅ PESEL detection (Polish-only entity)
- ✅ Multiple PII types in same text

**Expected Behavior:**
```
Input:  "Moja karta to 4111111111111111"
Lang:   pl
Output: "Moja karta to [CREDIT_CARD]" ✅

Input:  "System jest gotowy"
Lang:   pl
Output: "System jest gotowy" ✅ (NOT "System [PERSON] gotowy")
```

### 6. Performance (2 tests)
Validates response time and concurrent handling.

**Key Tests:**
- ✅ Single request < 500ms
- ✅ 5 concurrent requests succeed

**Expected Behavior:**
- Language detection adds ~5-10ms overhead
- No performance degradation under load

### 7. Regression Tests (3 tests)
Tests specific bugs that were fixed.

**Key Tests:**
- ✅ Original bug: "chyba caly czas system jest zbyt restrykcyjny"
- ✅ Original bug: "to jeszcze jeden test"
- ✅ English names still detected in English text

**Expected Behavior:**
- Historical bugs remain fixed
- No regressions in existing functionality

### 8. Statistics Logging (2 tests)
Validates ClickHouse logging of language stats.

**Key Tests:**
- ✅ Language stats logged correctly
- ✅ Entity counts by language tracked

**Expected Behavior:**
```json
{
  "language_stats": {
    "detected_language": "pl",
    "polish_entities": 1,
    "international_entities": 1,
    "total_after_dedup": 2
  }
}
```

### 9. Service Health (2 tests)
Checks language-detector service availability.

**Key Tests:**
- ✅ `/health` endpoint responds
- ✅ Detection method logged in results

## Test Results Interpretation

### Success Criteria

**Pass:** All 50 tests pass
```
✓ Language Detection - Polish Text (8/8)
✓ Language Detection - English Text (6/6)
✓ Language Detection - Edge Cases (10/10)
✓ Language Detection - Mixed Language (3/3)
✓ Language Detection - PII Cross-Language Handling (9/9)
✓ Language Detection - Performance (2/2)
✓ Language Detection - Regression Tests (3/3)
✓ Language Detection - Statistics Logging (2/2)
✓ Language Detection - Service Health (2/2)

Test Files  1 passed (1)
     Tests  50 passed (50)
  Start at  XX:XX:XX
  Duration  XX.XXs
```

### Common Failures

#### 1. Webhook Not Active
```
❌ Webhook is not active: Webhook returned HTTP 500
```
**Fix:** Import and activate workflow in n8n UI

#### 2. Language Detector Not Running
```
❌ ECONNREFUSED localhost:5002
```
**Fix:**
```bash
docker-compose up -d language-detector
docker logs vigil-language-detector  # Check for errors
```

#### 3. ClickHouse Connection Failed
```
❌ ClickHouse query failed: HTTP 401
```
**Fix:** Check `.env` has correct `CLICKHOUSE_PASSWORD`

#### 4. Event Not Found in ClickHouse
```
❌ Event not found in ClickHouse for sessionId: test_xxx
```
**Fix:**
- Check workflow is processing requests
- Check ClickHouse logging node is configured
- Increase wait time in test

## Debugging Failed Tests

### Enable Verbose Logging
```bash
# Run with debug output
DEBUG=* npm test -- language-detection.test.js

# Check service logs
docker logs vigil-language-detector --tail 50
docker logs vigil-n8n --tail 50
docker logs vigil-clickhouse --tail 50
```

### Manual Test
```bash
# Test language detector directly
curl -X POST http://localhost:5002/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"to jeszcze jeden test"}'

# Expected: {"language":"pl","confidence":1.0,...}

# Test workflow webhook
curl -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"test message","sessionId":"manual_test_123"}'

# Query ClickHouse
export CLICKHOUSE_PASSWORD=<your-password>
curl -s "http://localhost:8123/?user=admin&password=$CLICKHOUSE_PASSWORD" \
  --data "SELECT * FROM n8n_logs.events_processed WHERE sessionId='manual_test_123' FORMAT Pretty"
```

### Check Language Detection in Logs
```bash
# n8n logs should show:
docker logs vigil-n8n | grep -A 2 "Language detection"

# Example output:
# Language detection: pl (confidence: 1.0)
# Language-aware: 0 entities (pl:0, en:0) in 312ms
```

## Integration with Existing Tests

This test suite integrates with:
- `pii-detection-comprehensive.test.js` - PII detection accuracy
- `false-positives.test.js` - False positive prevention
- `smoke.test.js` - Basic system health

Run all PII-related tests:
```bash
npm test -- pii-detection
```

## Performance Benchmarks

**Target Metrics:**
- Language detection: < 10ms
- Total workflow latency: < 500ms
- Concurrent requests: 5+ without errors

**Measured Performance (50 tests):**
- Average language detection: ~2ms
- Average workflow response: ~250-400ms
- No errors under concurrent load (5 requests)

## CI/CD Integration

Add to GitHub Actions workflow:
```yaml
- name: Test Language Detection
  run: |
    cd services/workflow
    npm test -- language-detection.test.js
```

## Maintenance

**Update tests when:**
- Adding new language support
- Changing language detection logic
- Adding new PII entity types
- Modifying PERSON entity routing

**Review monthly:**
- False positive rate (should be < 1%)
- Detection accuracy (should be > 95%)
- Performance metrics (should be < 500ms)
