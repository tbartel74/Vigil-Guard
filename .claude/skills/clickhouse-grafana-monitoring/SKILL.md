---
name: clickhouse-grafana-monitoring
description: ClickHouse analytics and Grafana dashboard configuration for Vigil Guard monitoring. Use when querying logs, creating dashboards, analyzing threat detection metrics, optimizing schema, investigating events, or working with n8n_logs database.
version: 1.0.0
allowed-tools: [Read, Write, Bash, Grep, Glob]
---

# ClickHouse & Grafana Monitoring

## Overview
Analytics and monitoring stack for Vigil Guard using ClickHouse database and Grafana dashboards for real-time threat analysis.

## When to Use This Skill
- Querying event logs from ClickHouse
- Creating/modifying Grafana dashboards
- Analyzing detection metrics and trends
- Investigating specific threats or prompts
- Optimizing ClickHouse queries
- Understanding schema (events_raw, events_processed, retention_config)
- Troubleshooting logging issues
- Generating analytics reports
- **Configuring data retention policies (TTL)**
- **Monitoring disk usage and partition management**
- **Force cleanup operations**

## ClickHouse Schema

### Database: n8n_logs
```sql
-- events_raw: Raw webhook inputs (90 days TTL)
CREATE TABLE n8n_logs.events_raw (
  timestamp DateTime64(3, 'UTC'),
  original_input String,
  session_id String
) ENGINE = MergeTree()
PARTITION BY partition_date
ORDER BY (timestamp, event_id)
TTL toDateTime(timestamp) + INTERVAL 90 DAY DELETE
SETTINGS
  merge_with_ttl_timeout = 3600,
  ttl_only_drop_parts = 1;

-- events_processed: Processed with detection results (365 days TTL)
CREATE TABLE n8n_logs.events_processed (
  timestamp DateTime64(3, 'UTC'),
  original_input String,
  sanitized_output String,
  final_status String,  -- ALLOWED, SANITIZED, BLOCKED
  threat_score Float64,
  threat_labels Array(String),
  score_breakdown Map(String, Float64)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, sessionId, id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY DELETE
SETTINGS
  merge_with_ttl_timeout = 3600,
  ttl_only_drop_parts = 1;

-- retention_config: Data retention policy configuration
CREATE TABLE n8n_logs.retention_config (
  id UInt8 DEFAULT 1,
  events_raw_ttl_days UInt16 DEFAULT 90,
  events_processed_ttl_days UInt16 DEFAULT 365,
  merge_with_ttl_timeout_seconds UInt32 DEFAULT 3600,
  ttl_only_drop_parts UInt8 DEFAULT 1,
  warn_disk_usage_percent UInt8 DEFAULT 80,
  critical_disk_usage_percent UInt8 DEFAULT 90,
  last_modified_at DateTime DEFAULT now(),
  last_modified_by String DEFAULT 'system',
  CONSTRAINT single_row CHECK id = 1
) ENGINE = MergeTree()
ORDER BY id;
```

## Common Queries

### Recent Events
```sql
SELECT
  timestamp,
  original_input,
  status,
  total_score
FROM n8n_logs.events_processed
ORDER BY timestamp DESC
LIMIT 20;
```

### Status Distribution (Last 24h)
```sql
SELECT
  status,
  count() as count
FROM n8n_logs.events_processed
WHERE timestamp > now() - INTERVAL 1 DAY
GROUP BY status;
```

### Top Threat Categories
```sql
SELECT
  arrayJoin(categories) as category,
  count() as occurrences
FROM n8n_logs.events_processed
WHERE timestamp > now() - INTERVAL 1 DAY
GROUP BY category
ORDER BY occurrences DESC
LIMIT 10;
```

### Search Prompts
```sql
SELECT * FROM n8n_logs.events_processed
WHERE original_input LIKE '%SQL%'
ORDER BY timestamp DESC;
```

### Blocked Events Analysis
```sql
SELECT
  original_input,
  total_score,
  categories,
  score_breakdown
FROM n8n_logs.events_processed
WHERE status = 'BLOCKED'
  AND timestamp > now() - INTERVAL 7 DAY
ORDER BY total_score DESC;
```

## ClickHouse CLI

### Access Container
```bash
# Interactive client
docker exec -it vigil-clickhouse clickhouse-client

# Single query
docker exec vigil-clickhouse clickhouse-client -q "SELECT count() FROM n8n_logs.events_processed"

# Pretty format
docker exec vigil-clickhouse clickhouse-client -q "SELECT * FROM n8n_logs.events_processed LIMIT 5 FORMAT Pretty"
```

### Connection Details
- Host: `vigil-clickhouse` (internal) or `localhost:8123` (HTTP)
- Port: 8123 (HTTP), 9000 (native)
- Database: `n8n_logs`
- User: `admin`
- Password: (from `.env` file, auto-generated)

## Grafana Dashboards

### Panel Configuration
```json
{
  "datasource": "ClickHouse",
  "targets": [{
    "rawSql": "SELECT timestamp, total_score FROM n8n_logs.events_processed"
  }],
  "title": "Threat Score Trends",
  "type": "timeseries"
}
```

### Embedded in Web UI
```typescript
<iframe
  src="http://localhost:3001/d/vigil-guard/dashboard?panelId=1&orgId=1&theme=dark&kiosk"
  className="w-full h-96"
/>
```

### Required Config
```ini
# grafana.ini
[security]
allow_embedding = true
```

## Investigation Panel Integration

The Web UI's Investigation Panel uses these queries:

```typescript
// Search events
GET /api/search?q=sql&status=BLOCKED&from=2025-01-01&to=2025-01-31

// Backend executes:
SELECT * FROM n8n_logs.events_processed
WHERE original_input LIKE '%sql%'
  AND status = 'BLOCKED'
  AND timestamp BETWEEN '2025-01-01' AND '2025-01-31'
ORDER BY timestamp DESC
LIMIT 100;
```

## Performance Optimization

### Indexes
```sql
-- Timestamp index (primary key)
ORDER BY timestamp

-- Status index (for filtering)
ALTER TABLE events_processed
ADD INDEX idx_status status TYPE set(0) GRANULARITY 4;
```

### Partition Management
```sql
-- View partition info
SELECT partition, sum(rows) AS rows, formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE database = 'n8n_logs' AND table = 'events_processed' AND active = 1
GROUP BY partition
ORDER BY partition DESC;

-- Drop old partitions (manual - auto-managed by TTL)
ALTER TABLE events_processed DROP PARTITION 202401;

-- Force TTL cleanup (triggers immediate merge and deletion)
OPTIMIZE TABLE n8n_logs.events_raw FINAL;
OPTIMIZE TABLE n8n_logs.events_processed FINAL;
```

## Data Retention Policy

### TTL Configuration

ClickHouse automatically deletes expired data using TTL (Time To Live):

**Default Retention Periods**:
- `events_raw`: 90 days (debug data, raw inputs) ~1-2 GB
- `events_processed`: 365 days (full analysis data) ~9-18 GB
- **Total estimated**: 10-20 GB/year @ 5,000 prompts/day

**TTL Behavior**:
- Checks for expired data every hour (`merge_with_ttl_timeout = 3600`)
- Deletion happens during background merge operations
- Drops whole partitions for efficiency (`ttl_only_drop_parts = 1`)

### Retention Management UI

**Location**: Configuration → System → Data Retention
**URL**: `http://localhost/ui/config/retention`
**Permissions**: Requires `can_view_configuration`

**Features**:
- View system disk usage (total/used/free with color-coded thresholds)
- Monitor per-table metrics (rows, size, compression ratio, partitions)
- Edit TTL days (1-3650 range) for both tables
- Configure warning/critical disk usage thresholds (default: 80%/90%)
- Force cleanup button (OPTIMIZE TABLE FINAL)
- Audit trail (last modified by/at)

### Retention API Endpoints

```bash
# Get current retention config
GET /api/retention/config

# Update TTL days
PUT /api/retention/config
{
  "events_raw_ttl_days": 90,
  "events_processed_ttl_days": 365,
  "warn_disk_usage_percent": 80,
  "critical_disk_usage_percent": 90
}

# Get disk usage statistics
GET /api/retention/disk-usage

# Force immediate cleanup
POST /api/retention/cleanup
{
  "table": "all"  # or "events_raw", "events_processed"
}

# Get partition information
GET /api/retention/partitions/events_processed
```

### Disk Usage Monitoring Queries

```sql
-- System disk usage percentage
SELECT
  round((sum(total_space) - sum(free_space)) / sum(total_space) * 100, 2) AS disk_usage_percent
FROM system.disks
WHERE name = 'default';

-- Table sizes
SELECT
  table,
  sum(rows) AS rows,
  formatReadableSize(sum(bytes_on_disk)) AS disk_size,
  formatReadableSize(sum(data_compressed_bytes)) AS compressed_size,
  uniq(partition) AS partition_count
FROM system.parts
WHERE database = 'n8n_logs' AND table IN ('events_raw', 'events_processed') AND active = 1
GROUP BY table;

-- Compression ratio
SELECT
  table,
  round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS compression_ratio
FROM system.parts
WHERE database = 'n8n_logs' AND active = 1
GROUP BY table;
```

### Grafana Disk Usage Dashboard

**Dashboard**: "ClickHouse Disk Usage & Retention"
**UID**: `clickhouse-disk-usage-001`
**Location**: `services/monitoring/grafana/provisioning/dashboards/disk-usage-dashboard.json`

**Panels**:
1. System Disk Usage (gauge) - Current disk usage 0-100%
2. Table Disk Usage Over Time (time series)
3. TTL Configuration Display (stat panels) - events_raw and events_processed days
4. Active Partitions Count (bars)
5. Compression Ratio (line chart)
6. Table Statistics Summary (table)

### Force Cleanup Operations

When immediate disk space reclamation is needed:

```bash
# Via ClickHouse CLI
docker exec vigil-clickhouse clickhouse-client -q "OPTIMIZE TABLE n8n_logs.events_raw FINAL"
docker exec vigil-clickhouse clickhouse-client -q "OPTIMIZE TABLE n8n_logs.events_processed FINAL"

# Via API (recommended)
curl -X POST http://localhost/ui/api/retention/cleanup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"table": "all"}'

# Via Web UI
# Navigate to Configuration → Data Retention → Force Cleanup button
```

**Note**: `OPTIMIZE TABLE FINAL` is resource-intensive. Run during low-traffic periods.

## Troubleshooting

### Connection Failed
```bash
# Test connection
docker exec vigil-clickhouse clickhouse-client -q "SELECT 1"

# Check credentials in .env
grep CLICKHOUSE_ .env
```

### No Data Logging
```bash
# Verify n8n workflow has ClickHouse credentials configured
# Check logs
docker logs vigil-n8n

# Test manual insert
docker exec vigil-clickhouse clickhouse-client -q "
  INSERT INTO n8n_logs.events_processed
  VALUES (now(), 'test', 'test', 'ALLOWED', 0, [], {})
"
```

## Related Skills
- `n8n-vigil-workflow` - Understanding what data is logged
- `react-tailwind-vigil-ui` - Investigation Panel integration
- `docker-vigil-orchestration` - Container management

## References
- ClickHouse docs: https://clickhouse.com/docs
- Grafana docs: https://grafana.com/docs
- Schema: `services/monitoring/sql/01-create-tables.sql`, `05-retention-config.sql`
- Dashboards: `services/monitoring/grafana/provisioning/dashboards/`
- Retention Policy: `docs/CLICKHOUSE_RETENTION.md`
- Backend Module: `services/web-ui/backend/src/retention.ts`
- Frontend Component: `services/web-ui/frontend/src/components/RetentionPolicy.tsx`
