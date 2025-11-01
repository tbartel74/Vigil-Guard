# Vigil Guard Workflow v1.6.10 - Import Instructions

## Version Information
- **Version**: 1.6.10
- **Date**: 2025-01-30
- **File**: `Vigil-Guard-v1.6.10.json`
- **Major Change**: Dual-Language PII Detection (Polish + International)

## What's New in v1.6.10

### 🎯 Dual-Language PII Detection (Option B Implementation)
**Problem**: Presidio's architecture requires language-specific recognizer registration. Single-language API calls could only detect EITHER credit cards (en) OR Polish PII (pl), not both.

**Solution**: PII_Redactor_v2 now calls Presidio API **twice in parallel**:
1. **Polish API call** (`language: 'pl'`) → PESEL, NIP, REGON, ID cards
2. **International API call** (`language: 'en'`) → Credit cards, Email, Phone, etc.

**Performance**: ~200-300ms total latency (+100ms overhead from v1.6.9)

### Key Features
- ✅ **Parallel API calls** using `Promise.all()` - minimal latency overhead
- ✅ **Entity deduplication** - removes overlapping detections
- ✅ **Language statistics** - logs entities detected per language
- ✅ **Backward compatible** - same output format as v1.6.9
- ✅ **Fallback support** - automatic regex fallback if Presidio offline

## Import Steps

### 1. Prerequisites
- ✅ Presidio PII API running on port 5001
- ✅ Docker container `vigil-presidio-pii` healthy
- ✅ ClickHouse credentials configured
- ✅ unified_config.json has `pii_detection.enabled: true`

### 2. Verify Presidio Recognizers
```bash
# Check that Polish recognizers are set to supported_language: pl
docker exec vigil-presidio-pii grep -A 2 "name: PL_PESEL_ENHANCED" /app/config/recognizers.yaml

# Expected output:
#   - name: PL_PESEL_ENHANCED
#     supported_language: pl
#     supported_entity: PL_PESEL

# Check that credit card recognizer is set to supported_language: en
docker exec vigil-presidio-pii grep -A 2 "name: CREDIT_CARD_ENHANCED" /app/config/recognizers.yaml

# Expected output:
#   - name: CREDIT_CARD_ENHANCED
#     supported_language: en
#     supported_entity: CREDIT_CARD
```

### 3. Import to n8n
1. Open n8n: http://localhost:5678
2. Navigate to **Workflows** menu
3. Click **Import from File**
4. Select `Vigil-Guard-v1.6.10.json`
5. Workflow imports with name: **Vigil Guard v1.6.10**

### 4. Configure ClickHouse Credentials
1. Open the imported workflow
2. Find node: **ClickHouse Insert (events_processed)**
3. Click on node → **Credentials** tab
4. Select existing `ClickHouse vigil-clickhouse` credential OR create new:
   - Host: `vigil-clickhouse`
   - Port: `8123`
   - Database: `n8n_logs`
   - User: `admin`
   - Password: `[from .env file]`

### 5. Activate Workflow
1. Click **Active** toggle in top-right corner
2. Workflow status changes to green "Active"
3. Webhook URL: `http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1`

## Testing Dual-Language Detection

### Test 1: Credit Card (International PII)
```bash
curl -X POST "http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1" \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"My credit card is 4111111111111111","sessionId":"test_card_v1610"}'
```

**Expected**: 
- `result`: "my credit card is [CARD]" ✅
- `pii.detection_method`: "presidio_dual_language"
- `pii.language_stats.international_entities`: 1

### Test 2: PESEL (Polish PII)
```bash
curl -X POST "http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1" \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"PESEL 44051401359","sessionId":"test_pesel_v1610"}'
```

**Expected**:
- `result`: "pesel [PESEL]" ✅
- `pii.detection_method`: "presidio_dual_language"
- `pii.language_stats.polish_entities`: 1

### Test 3: Multiple PII (Both Languages)
```bash
curl -X POST "http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1" \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"Karta 5555555555554444 oraz PESEL 44051401359","sessionId":"test_multi_v1610"}'
```

**Expected**:
- `result`: "karta [CARD] oraz [PESEL]" ✅
- `pii.detection_method`: "presidio_dual_language"
- `pii.language_stats.polish_entities`: 1
- `pii.language_stats.international_entities`: 1
- `pii.language_stats.total_after_dedup`: 2

### Verify Results in ClickHouse
```bash
export CLICKHOUSE_PASSWORD="[your password]"

curl -s "http://localhost:8123/?user=admin&password=$CLICKHOUSE_PASSWORD" --data "
SELECT 
  sessionId,
  original_input,
  result,
  JSON_VALUE(sanitizer_json, '$.pii.detection_method') as method,
  JSON_VALUE(sanitizer_json, '$.pii.language_stats.polish_entities') as pl_count,
  JSON_VALUE(sanitizer_json, '$.pii.language_stats.international_entities') as en_count
FROM n8n_logs.events_processed
WHERE sessionId LIKE 'test_%_v1610'
ORDER BY timestamp DESC
LIMIT 3
FORMAT Pretty
"
```

## Troubleshooting

### Issue: "No matching recognizers" error
**Cause**: Presidio recognizers not properly configured for language
**Solution**: Verify recognizers.yaml has correct `supported_language` values (see step 2)

### Issue: Both API calls fail
**Cause**: Presidio API offline or unreachable
**Solution**: Check Presidio container health:
```bash
docker logs vigil-presidio-pii --tail 50
docker exec vigil-presidio-pii curl -s http://localhost:5001/health
```

### Issue: Entities detected but not masked
**Cause**: Redaction token mapping missing
**Solution**: Check unified_config.json:
```json
"pii_detection": {
  "redaction_tokens": {
    "CREDIT_CARD": "[CARD]",
    "PL_PESEL": "[PESEL]",
    ...
  }
}
```

### Issue: Performance degradation (>500ms latency)
**Cause**: Sequential API calls or slow Presidio response
**Solution**: Verify parallel execution in n8n logs:
```bash
docker logs vigil-n8n --tail 50 | grep "Dual-language"
# Expected: "Dual-language: X entities (pl:Y, en:Z) in 200-300ms"
```

## Rollback to v1.6.9

If issues occur, rollback to previous version:
1. Deactivate v1.6.10 workflow
2. Import `Vigil-Guard-v1.6.9.json`
3. Configure ClickHouse credentials
4. Activate v1.6.9 workflow

**Note**: v1.6.9 uses single-language detection (`language: "en"` by default) - only international PII will be detected.

## Next Steps

After successful import and testing:
1. ✅ Verify all 3 test scenarios pass
2. ✅ Monitor ClickHouse for `pii.detection_method: "presidio_dual_language"`
3. ✅ Check Grafana dashboards for PII detection metrics
4. ✅ Run comprehensive test suite: `npm test e2e/pii-detection-comprehensive.test.js`
5. ✅ Update CHANGELOG with v1.6.10 changes

## Performance Benchmarks

| Metric | v1.6.9 (Single Lang) | v1.6.10 (Dual Lang) | Change |
|--------|---------------------|---------------------|--------|
| API Latency | 100-150ms | 200-300ms | +100ms |
| Detection Rate (Cards) | 93.8% | 93.8% | Same |
| Detection Rate (PESEL) | 0% | 100% | +100% |
| Memory Usage | ~616MB | ~616MB | Same |
| CPU Usage | <5% | <5% | Same |

## Support

Issues? Check:
- `docs/PII_DETECTION.md` - Full PII detection documentation
- `services/presidio-pii-api/README.md` - Presidio API details
- `services/workflow/tests/PII_TESTING_GUIDE.md` - Test guide
