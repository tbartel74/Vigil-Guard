# TESTING_CLEAN_INSTALL.md

**Vigil Guard v1.7.0 - Clean Installation Testing Guide**

This document provides comprehensive procedures for testing clean installations and upgrades of Vigil Guard v1.7.0, focusing on verification of browser fingerprinting and PII classification infrastructure.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Scenario 1: Clean Installation Test](#scenario-1-clean-installation-test)
3. [Scenario 2: Upgrade from v1.6.11](#scenario-2-upgrade-from-v16.11)
4. [Verification Checklist](#verification-checklist)
5. [Common Issues](#common-issues)
6. [Rollback Procedure](#rollback-procedure)

---

## Prerequisites

### System Requirements

- Docker Engine 20.10+ and Docker Compose 1.29+
- Minimum 4GB RAM, 20GB disk space
- macOS, Linux, or Windows with WSL2
- Port availability: 80, 3001, 5001, 5002, 5678, 8000, 8123, 8787, 9000

### Tools Required

```bash
# Verify installations
docker --version
docker-compose --version
curl --version
jq --version  # Optional but recommended for JSON parsing
```

### Backup Warning

⚠️ **CRITICAL**: Clean installation tests will **DESTROY ALL DATA**. Backup production data before proceeding:

```bash
# Backup ClickHouse data
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password <your_password> \
  --query "BACKUP DATABASE n8n_logs TO Disk('backups', 'backup-$(date +%Y%m%d).zip')"

# Backup .env file
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Backup vigil_data (optional, large)
tar -czf vigil_data_backup_$(date +%Y%m%d).tar.gz vigil_data/
```

---

## Scenario 1: Clean Installation Test

**Objective**: Verify that `./install.sh` on a clean system creates all v1.7.0 infrastructure correctly.

### Step 1: Complete System Cleanup

```bash
# Stop all containers
docker-compose down -v

# Remove all Vigil Guard data (⚠️ DESTRUCTIVE)
rm -rf vigil_data/
rm .env
rm .install-state.lock

# Verify cleanup
ls -la | grep -E "vigil_data|\.env"
# Should return nothing
```

**Expected Result**: No `vigil_data/`, no `.env`, clean slate.

---

### Step 2: Run Installation

```bash
# Execute installation script
./install.sh
```

**What to Watch For**:

1. **Secrets Generation**:
   ```
   ✓ Generated secure passwords
   ```

2. **ClickHouse Initialization**:
   ```
   ℹ Creating ClickHouse tables...
   ✓ Tables created
   ℹ Creating retention config table...
   ✓ Retention config table created
   ℹ Adding v1.7.0 audit columns (PII classification + browser fingerprinting)...
   ✓ Audit columns added successfully
   ✓ ClickHouse initialized successfully (7 tables/views)
   ```

   **Critical**: Must see "Audit columns added successfully"

3. **Service Health**:
   ```
   ✓ All 9 services running
   ```

**Expected Duration**: 5-10 minutes (depending on internet speed for Docker image pulls).

---

### Step 3: Verify ClickHouse Schema

```bash
# Get ClickHouse password from .env
CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)

# Verify browser fingerprinting columns exist
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --database n8n_logs \
  -q "DESCRIBE TABLE events_processed" | grep -E "client_id|browser_|pii_"
```

**Expected Output**:
```
client_id              String
browser_name           LowCardinality(String)
browser_version        String
os_name                LowCardinality(String)
browser_language       String
browser_timezone       String
pii_sanitized          UInt8
pii_types_detected     Array(String)
pii_entities_count     UInt16
```

**Validation**: All 9 columns must be present.

---

### Step 4: Verify Retention Config Table

```bash
# Check retention_config table exists
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --database n8n_logs \
  -q "SELECT * FROM retention_config FORMAT Vertical"
```

**Expected Output**:
```
Row 1:
──────
id:                           1
events_raw_ttl_days:          90
events_processed_ttl_days:    365
disk_usage_warn_gb:           500
disk_usage_critical_gb:       800
auto_cleanup_enabled:         1
last_modified_at:             2025-11-02 12:00:00
last_modified_by:             system
```

**Validation**: Table exists with default values.

---

### Step 5: Test Workflow v1.7.0

```bash
# Load workflow in n8n
echo "1. Open http://localhost:5678"
echo "2. Import workflow: services/workflow/workflows/Vigil-Guard-v1.7.0.json"
echo "3. Activate workflow"
echo "4. Send test request:"

# Test webhook with browser metadata
curl -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
  -H "Content-Type: application/json" \
  -d '{
    "chatInput": "Test prompt for clean install verification",
    "sessionId": "test_clean_install_'$(date +%s)'",
    "clientId": "vigil_'$(date +%s)'_test123",
    "browser_metadata": {
      "browser_name": "Chrome",
      "browser_version": "120.0.0",
      "os_name": "macOS",
      "browser_language": "en-US",
      "browser_timezone": "America/New_York"
    }
  }'
```

**Expected Response**:
```json
{
  "result": "ALLOW",
  "sanitizedBody": "Test prompt for clean install verification",
  ...
}
```

---

### Step 6: Verify Data in ClickHouse

```bash
# Wait 3 seconds for data to be written
sleep 3

# Query latest record with browser metadata
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --database n8n_logs \
  -q "SELECT
    client_id,
    browser_name,
    browser_version,
    os_name,
    browser_language,
    browser_timezone,
    pii_sanitized,
    length(pii_types_detected) as pii_types_count
FROM events_processed
ORDER BY timestamp DESC
LIMIT 1
FORMAT Vertical"
```

**Expected Output**:
```
Row 1:
──────
client_id:           vigil_1730000000_test123
browser_name:        Chrome
browser_version:     120.0.0
os_name:             macOS
browser_language:    en-US
browser_timezone:    America/New_York
pii_sanitized:       0
pii_types_count:     0
```

**Validation**:
- ✅ client_id matches sent value (not empty!)
- ✅ browser_name = "Chrome" (not "unknown"!)
- ✅ All metadata fields populated

---

### Step 7: Verify Grafana Dashboard

```bash
# Get Grafana password
GRAFANA_PASSWORD=$(grep "^GF_SECURITY_ADMIN_PASSWORD=" .env | cut -d'=' -f2)

echo "1. Open http://localhost:3001"
echo "2. Login: admin / $GRAFANA_PASSWORD"
echo "3. Navigate to 'Vigil' dashboard"
echo "4. Check 'Input/Output Processing Table' panel"
```

**What to Check**:

1. **Column Order** (first 6 columns):
   - client_id
   - browser
   - version
   - os
   - language
   - timezone

2. **Data Presence**:
   - Latest row shows browser metadata from Step 5 test
   - No "unknown" values (unless deliberately sent)

**Validation**: All 6 browser columns visible and populated.

---

### Step 8: Verify View Compatibility

```bash
# Query view directly
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --database n8n_logs \
  -q "DESCRIBE TABLE v_grafana_prompts_table" | grep -E "client_id|browser_|pii_"
```

**Expected Output**:
```
client_id              String
browser_name           LowCardinality(String)
browser_version        String
os_name                LowCardinality(String)
browser_language       String
browser_timezone       String
pii_sanitized          UInt8
pii_types_detected     Array(String)
pii_entities_count     UInt16
```

**Validation**: View contains all v1.7.0 columns.

---

## Scenario 2: Upgrade from v1.6.11

**Objective**: Verify that existing v1.6.11 installation upgrades correctly to v1.7.0.

### Step 1: Prepare Test Environment

```bash
# Assume you have v1.6.11 running with data
# Backup current state
cp .env .env.v1.6.11.backup
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password <your_password> \
  --query "SELECT count() FROM n8n_logs.events_processed" \
  > record_count_before_upgrade.txt
```

---

### Step 2: Pull v1.7.0 Code

```bash
# Checkout v1.7.0 branch
git fetch origin
git checkout security-audit-remediation-phases-3-4
git pull origin security-audit-remediation-phases-3-4
```

---

### Step 3: Run Schema Migration

```bash
# Execute ClickHouse migration
./scripts/init-clickhouse.sh
```

**Expected Output**:
```
ℹ Initializing ClickHouse database...
✓ Tables verified
✓ Views verified
ℹ Adding v1.7.0 audit columns (PII classification + browser fingerprinting)...
✓ Audit columns added successfully
ℹ Retention config already exists
✓ ClickHouse initialized successfully!
```

**Critical**: Must see "Audit columns added successfully".

---

### Step 4: Verify Backward Compatibility

```bash
# Check old records have default values
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --database n8n_logs \
  -q "SELECT
    count() as old_records_with_defaults
FROM events_processed
WHERE client_id = ''
  AND browser_name = 'unknown'
  AND timestamp < now() - INTERVAL 1 HOUR"
```

**Expected**: Count > 0 (old records exist with defaults).

---

### Step 5: Import v1.7.0 Workflow

```bash
echo "1. Open http://localhost:5678"
echo "2. Import: services/workflow/workflows/Vigil-Guard-v1.7.0.json"
echo "3. Deactivate old workflow"
echo "4. Activate v1.7.0 workflow"
```

---

### Step 6: Test New Data with Metadata

```bash
# Send test request with v1.7.0 payload
curl -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
  -H "Content-Type: application/json" \
  -d '{
    "chatInput": "Upgrade test from v1.6.11 to v1.7.0",
    "sessionId": "test_upgrade_'$(date +%s)'",
    "clientId": "vigil_upgrade_test",
    "browser_metadata": {
      "browser_name": "Firefox",
      "browser_version": "121.0",
      "os_name": "Linux",
      "browser_language": "pl-PL",
      "browser_timezone": "Europe/Warsaw"
    }
  }'

# Wait and verify
sleep 3
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --database n8n_logs \
  -q "SELECT client_id, browser_name, os_name
FROM events_processed
WHERE sessionId LIKE 'test_upgrade_%'
ORDER BY timestamp DESC
LIMIT 1"
```

**Expected Output**:
```
vigil_upgrade_test    Firefox    Linux
```

**Validation**:
- ✅ New records have populated browser metadata
- ✅ Old records still queryable with default values

---

### Step 7: Verify Data Integrity

```bash
# Count records before and after
BEFORE=$(cat record_count_before_upgrade.txt)
AFTER=$(docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --query "SELECT count() FROM n8n_logs.events_processed")

echo "Records before upgrade: $BEFORE"
echo "Records after upgrade:  $AFTER"

# Should be AFTER = BEFORE + 1 (from upgrade test in Step 6)
```

**Validation**: No data loss, record count correct.

---

## Verification Checklist

Use this checklist for both clean install and upgrade scenarios:

### ClickHouse Schema

- [ ] `events_processed` table has 9 new columns (client_id, browser_*, pii_*)
- [ ] `retention_config` table exists
- [ ] View `v_grafana_prompts_table` includes v1.7.0 columns
- [ ] No errors in ClickHouse logs: `docker logs vigil-clickhouse | grep -i error`

### Workflow

- [ ] Vigil-Guard-v1.7.0.json successfully imported to n8n
- [ ] Workflow activates without errors
- [ ] Webhook accepts payloads with `clientId` and `browser_metadata`
- [ ] No errors in n8n logs: `docker logs vigil-n8n | grep -i error`

### Data Flow

- [ ] Test request successfully processed
- [ ] ClickHouse receives browser fingerprinting data
- [ ] client_id is NOT empty ('')
- [ ] browser_name is NOT 'unknown' (for new records)
- [ ] PII classification columns functional (pii_sanitized, pii_types_detected)

### Grafana Dashboard

- [ ] Dashboard loads without errors
- [ ] "Input/Output Processing Table" shows 6 browser columns
- [ ] Data displays correctly (no "unknown" for fresh data)
- [ ] ClickHouse datasource connected (green icon)

### Services Health

- [ ] All 9 services running: `docker-compose ps`
- [ ] No crash-loops: `docker ps --filter "status=restarting"`
- [ ] Health checks passing: `./scripts/status.sh`

---

## Common Issues

### Issue 1: "Audit columns added successfully" Not Appearing

**Symptom**: Installation completes but message missing.

**Cause**: `install.sh` not executing `06-add-audit-columns-v1.7.0.sql`.

**Fix**:
```bash
# Manual migration
CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
cat services/monitoring/sql/06-add-audit-columns-v1.7.0.sql | \
  docker exec -i vigil-clickhouse clickhouse-client \
    --user admin \
    --password "$CLICKHOUSE_PASSWORD" \
    --multiquery

# Verify
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password "$CLICKHOUSE_PASSWORD" \
  --database n8n_logs \
  -q "DESCRIBE TABLE events_processed" | grep client_id
```

---

### Issue 2: client_id Always Empty

**Symptom**: New records have `client_id = ''`.

**Cause**: Workflow v1.7.0 not imported or old workflow still active.

**Fix**:
```bash
echo "1. Verify active workflow in n8n (http://localhost:5678)"
echo "2. Check workflow name ends with 'v1.7.0'"
echo "3. Deactivate old workflows"
echo "4. Re-send test request"
```

---

### Issue 3: browser_name Always "unknown"

**Symptom**: New records have `browser_name = 'unknown'`.

**Cause**: Payload missing `browser_metadata` field or workflow node not passing data.

**Fix**:
```bash
# Verify payload structure
curl -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "chatInput": "Debug test",
  "sessionId": "debug_test",
  "clientId": "debug_client",
  "browser_metadata": {
    "browser_name": "Chrome",
    "browser_version": "120.0.0",
    "os_name": "macOS",
    "browser_language": "en-US",
    "browser_timezone": "America/New_York"
  }
}
EOF
```

---

### Issue 4: Grafana Dashboard Empty

**Symptom**: Dashboard shows "No data" despite records in ClickHouse.

**Cause**: Outdated ClickHouse datasource password or dashboard not reloaded.

**Fix**:
```bash
# Update Grafana datasource password
CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)

# Edit: services/monitoring/grafana/provisioning/datasources/clickhouse.yml
# Update basicAuthPassword with correct password

# Recreate Grafana container
docker-compose up --force-recreate -d grafana

# Wait 30 seconds and reload dashboard
```

---

### Issue 5: Table Count Still Shows "≥7"

**Symptom**: Installer says "7 tables/views" but expected 8.

**Note**: This is **CORRECT**. `retention_config` is a table, but audit columns are `ALTER TABLE` operations, not new tables. Count remains 7:

1. `events_raw`
2. `events_processed`
3. `retention_config`
4. `false_positives`
5. `v_grafana_prompts_table` (view)
6. `v_malice_index_timeseries` (view)
7. `v_workflow_performance` (view)

---

## Rollback Procedure

If testing reveals critical issues, rollback to v1.6.11:

### Step 1: Stop Services

```bash
docker-compose down
```

---

### Step 2: Restore v1.6.11 Code

```bash
git checkout main  # or v1.6.11 tag
```

---

### Step 3: Restore .env

```bash
cp .env.v1.6.11.backup .env
```

---

### Step 4: Restore ClickHouse Data (Optional)

```bash
# If you backed up vigil_data
rm -rf vigil_data/
tar -xzf vigil_data_backup_<date>.tar.gz
```

---

### Step 5: Restart Services

```bash
docker-compose up -d
```

---

### Step 6: Verify v1.6.11 Functionality

```bash
# Check version in workflow
curl http://localhost:5678/healthz

# Verify old data accessible
docker exec vigil-clickhouse clickhouse-client \
  --user admin \
  --password <your_password> \
  --query "SELECT count() FROM n8n_logs.events_processed"
```

---

## Pre-Release Checklist

Before merging PR #38 to main:

- [ ] Clean installation test passed (Scenario 1)
- [ ] Upgrade test passed (Scenario 2)
- [ ] All verification checklist items ✅
- [ ] Performance acceptable (workflow response < 300ms)
- [ ] No errors in any service logs
- [ ] Grafana dashboard displays correctly
- [ ] Documentation updated (CHANGELOG.md, USER_GUIDE.md)
- [ ] Code reviewed by at least 2 team members

---

## Support

If you encounter issues not covered in this guide:

1. Check logs: `./scripts/logs.sh` or `docker logs <service_name>`
2. Review troubleshooting: `docs/TROUBLESHOOTING.md`
3. Search GitHub issues: https://github.com/tbartel74/Vigil-Guard/issues
4. Contact: security@vigilguard.local

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-02
**Compatible with**: Vigil Guard v1.7.0
**Maintained by**: Vigil Guard Team
