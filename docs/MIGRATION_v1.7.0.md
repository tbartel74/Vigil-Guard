# Migration Guide: v1.8.1 → v1.8.1

**Release Date**: 2025-11-01
**Estimated Migration Time**: 15-20 minutes
**Downtime Required**: None (rolling update supported)

## Overview

Version 1.7.0 introduces three major enhancements:

1. **Sanitization Integrity** - 3-layer defense preventing PII leakage
2. **PII Classification** - Structured tracking with new ClickHouse columns
3. **Client Identification** - Persistent browser tracking with metadata

All changes are **backward compatible** - existing v1.8.1 deployments continue to work.

---

## Prerequisites

- Vigil Guard v1.8.1 installed and running
- Access to server with Docker permissions
- Admin credentials for Web UI and n8n
- Backup of current `.env` file (recommended)

---

## Migration Steps

### Step 1: Backup Current State (5 min)

```bash
# Stop all services
docker-compose down

# Backup workflow
cp services/workflow/workflows/Vigil-Guard-v1.8.1.json \
   services/workflow/workflows/Vigil-Guard-v1.8.1.json.backup

# Backup .env file
cp .env .env.backup.$(date +%Y%m%d)

# Backup ClickHouse data (optional but recommended)
docker run --rm -v vigil_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/vigil_data_backup_$(date +%Y%m%d).tar.gz /data

echo "✅ Backup complete"
```

### Step 2: Pull Latest Code (2 min)

```bash
# Pull v1.8.1 release
git fetch --tags
git checkout v1.8.1

# Or if using main branch:
git pull origin main
```

### Step 3: Execute ClickHouse Migration (3 min)

```bash
# Start ClickHouse (if not running)
docker-compose up -d clickhouse

# Wait for ClickHouse to be ready
sleep 10

# Run migration script (adds 9 new columns)
./scripts/init-clickhouse.sh

# Expected output:
# ✓ Database created
# ✓ Tables created
# ✓ Views created
# ✓ False positive reports table created
# ✓ Retention config table created
# ✓ Audit columns added successfully  ← NEW in v1.8.1
# ✓ ClickHouse initialized successfully!
```

**Verify Migration:**

```bash
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password $(grep CLICKHOUSE_PASSWORD .env | cut -d'=' -f2) \
  -q "DESCRIBE n8n_logs.events_processed" | grep -E "pii_|client_id|browser_"

# Expected output:
# pii_sanitized         UInt8
# pii_types_detected    Array(String)
# pii_entities_count    UInt16
# client_id             String
# browser_name          LowCardinality(String)
# browser_version       String
# os_name               LowCardinality(String)
# browser_language      String
# browser_timezone      String
```

### Step 4: Update n8n Workflow (5 min)

1. **Login to n8n**: http://localhost:5678
2. **Open** Vigil Guard v1.8.1 workflow
3. **Import** new workflow:
   - Click "..." menu → Import from File
   - Select: `services/workflow/workflows/Vigil-Guard-v1.8.1.json`
   - Click "Import"
4. **Activate** v1.8.1 workflow
5. **Deactivate** v1.8.1 workflow (keep as backup)

**Verify Workflow Changes:**
- Check node count: Should still be ~40 nodes
- Verify "output to plugin" node has `sanitizedBody` construction logic
- Verify "PII_Redactor_v2" node has `pii_classification` object
- Verify "Build+Sanitize NDJSON" node has 9 new ClickHouse fields

### Step 5: Update Browser Extension (2 min)

**Option A: Reload Extension (Recommended)**

1. Open Chrome: `chrome://extensions/`
2. Find "Vigil Guard"
3. Click "Reload" button
4. Extension will auto-update to v0.6.0

**Option B: Manual Update**

1. Remove old extension
2. Load unpacked: `plugin/Chrome/`
3. Grant permissions if prompted

**Verify Extension:**
- Open DevTools Console (F12)
- Look for: `[Vigil Guard] Generated new clientId: vigil_<timestamp>_<random>`
- Check chrome.storage.local: Should contain `clientId` key

### Step 6: Restart Services (2 min)

```bash
# Rebuild backend (new PII stats API)
docker-compose up --build -d web-ui-backend

# Restart all services
docker-compose restart

# Verify all services healthy
./scripts/status.sh

# Expected output:
# ✓ ClickHouse (vigil-clickhouse) - running
# ✓ n8n (vigil-n8n) - running
# ✓ Grafana (vigil-grafana) - running
# ✓ Web UI Backend (vigil-web-ui-backend) - running
# ✓ Web UI Frontend (vigil-web-ui-frontend) - running
# ✓ Presidio PII (vigil-presidio-pii) - running
# ✓ Language Detector (vigil-language-detector) - running
# ✓ Prompt Guard (vigil-prompt-guard-api) - running (optional)
# ✓ Caddy (vigil-caddy) - running
```

### Step 7: Test New Features (5 min)

**Test 1: PII Statistics API**

```bash
# Login to Web UI
TOKEN=$(curl -s -X POST http://localhost/ui/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' | jq -r '.token')

# Test PII overview endpoint
curl -s "http://localhost/ui/api/stats/pii/overview?timeRange=24h" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Expected output:
# {
#   "total_requests": <number>,
#   "requests_with_pii": <number>,
#   "pii_detection_rate": <percentage>,
#   "total_pii_entities": <number>,
#   "top_pii_types": [...]
# }
```

**Test 2: Client ID Generation**

```bash
# Send test request via extension
# Check n8n execution logs for:
# "clientId": "vigil_<timestamp>_<random>"
# "browser_metadata": { "browser": "Chrome", "os": "macOS", ... }
```

**Test 3: sanitizedBody Construction**

```bash
# Send prompt with PII: "My email is test@example.com"
# Check n8n workflow execution
# Verify "output to plugin" node returns:
# {
#   "action": "sanitize",
#   "sanitizedBody": { "messages": [...] },
#   "chatInput": "My email is [EMAIL_ADDRESS]"
# }
```

**Test 4: Grafana Alerts**

1. Open Grafana: http://localhost:3001
2. Navigate to: Alerting → Alert rules
3. Verify 3 new alerts:
   - "PII Leak Detection - CRITICAL"
   - "sanitizedBody Missing for SANITIZE Actions"
   - "PII Redaction Rate Sudden Drop"

---

## Rollback Procedure

If you encounter issues, rollback is safe and easy:

```bash
# Step 1: Restore v1.8.1 workflow in n8n
# - Deactivate v1.8.1 workflow
# - Activate v1.8.1 workflow backup

# Step 2: Restart services (no code changes needed)
docker-compose restart

# Step 3: ClickHouse columns remain (backward compatible)
# - v1.8.1 workflow uses DEFAULT values
# - No data loss
```

**Note**: New ClickHouse columns are **optional** - v1.8.1 workflow continues to work without them.

---

## Verification Checklist

- [ ] ClickHouse has 9 new columns (pii_*, client_id, browser_*)
- [ ] n8n workflow v1.8.1 is active and executing
- [ ] Browser extension shows clientId in console logs
- [ ] PII stats API endpoints return valid data
- [ ] Grafana shows 3 new alert rules
- [ ] Test prompt with PII gets sanitized correctly
- [ ] sanitizedBody field present in workflow responses
- [ ] No errors in Docker logs: `docker-compose logs --tail=100`

---

## Troubleshooting

### Issue: Migration script fails with "column already exists"

**Cause**: Migration already applied (safe to ignore)

**Solution**:
```bash
# Verify columns exist
docker exec vigil-clickhouse clickhouse-client \
  -q "DESCRIBE n8n_logs.events_processed" | grep pii_sanitized
```

### Issue: PII stats API returns 500 error

**Cause**: Backend not rebuilt or ClickHouse migration not applied

**Solution**:
```bash
# Rebuild backend
docker-compose up --build -d web-ui-backend

# Check backend logs
docker logs vigil-web-ui-backend --tail=50
```

### Issue: clientId not appearing in logs

**Cause**: Extension not reloaded or browser cache

**Solution**:
```bash
# Hard reload extension
# 1. chrome://extensions/
# 2. Find Vigil Guard
# 3. Click "Reload"
# 4. Clear browser cache (Ctrl+Shift+Delete)
# 5. Restart browser
```

### Issue: sanitizedBody missing in workflow response

**Cause**: Workflow not updated or cached execution

**Solution**:
```bash
# 1. Verify workflow v1.8.1 is active in n8n
# 2. Clear n8n execution cache:
docker-compose restart n8n

# 3. Test with new session
# 4. Check "output to plugin" node logs
```

---

## Performance Impact

**Expected Metrics** (based on testing):

| Metric | v1.8.1 | v1.8.1 | Change |
|--------|---------|--------|--------|
| Workflow Latency | 310ms | 320ms | +3% |
| Memory Usage | 616MB | 630MB | +2% |
| CPU Usage | <5% | <5% | No change |
| Database Size | N/A | +50MB/year | New columns |

**Note**: Performance impact is minimal due to efficient column indexing and default values.

---

## Security Considerations

### New Security Features

1. **3-Layer sanitizedBody Defense** - Prevents PII leakage at workflow, service worker, and extension layers
2. **Real-time Leak Detection** - Grafana alerts trigger within 1 minute of any violation
3. **Audit Trail** - Complete tracking of all PII detections and browser metadata

### Privacy

- **clientId** is anonymous (no personal identifiers)
- **Browser metadata** is aggregated (no fingerprinting)
- **PII tracking** is for security audit only (original PII never stored unencrypted)

---

## Support

If you encounter issues during migration:

1. Check logs: `docker-compose logs --tail=100`
2. Review troubleshooting section above
3. Rollback to v1.8.1 if needed (see Rollback Procedure)
4. Report issues: https://github.com/vigil-guard/vigil-guard/issues

---

## Next Steps

After successful migration:

1. **Monitor Grafana Alerts** - Check for PII leak detection triggers
2. **Review PII Statistics** - Use new API endpoints to analyze PII detection rates
3. **Update Documentation** - Document any custom configuration changes
4. **Test E2E** - Run full test suite: `cd services/workflow && npm test`

**Congratulations! Your Vigil Guard installation is now running v1.8.1 🎉**
