# Monitoring Service

ClickHouse analytics database and Grafana dashboards for Vigil Guard.

## Architecture

```
services/monitoring/
├── sql/
│   ├── 01-init-schema.sql       # Database creation
│   ├── 02-events-tables.sql     # Event tables
│   ├── 03-false-positives.sql   # Feedback tables
│   └── 04-retention-config.sql  # Retention policies
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/         # ClickHouse connection
│   │   └── dashboards/          # Dashboard definitions
│   └── dashboards/
│       └── vigil-guard.json     # Main dashboard
└── docker-compose.monitoring.yml
```

## Components

### ClickHouse

High-performance analytics database for event logging.

**Connection:**
- Host: `vigil-clickhouse`
- HTTP Port: 8123
- Native Port: 9000
- Database: `n8n_logs`

**Tables:**

| Table | Purpose |
|-------|---------|
| `events_v2` | Detection events with branch scores |
| `events_raw` | Raw input for audit |
| `false_positive_reports` | User feedback |
| `retention_config` | Data lifecycle settings |

### Grafana

Monitoring dashboards with real-time metrics.

**Connection:**
- URL: http://localhost:3001
- Default user: `admin`
- Password: from `.env` (GF_SECURITY_ADMIN_PASSWORD)

## Quick Start

### Access Services

```bash
# ClickHouse HTTP interface
curl http://localhost:8123/ping
# Returns: Ok.

# Grafana
open http://localhost:3001
```

### Query Events

```bash
# Via curl
curl "http://localhost:8123/?user=admin&password=<password>" \
  -d "SELECT count() FROM n8n_logs.events_v2"

# Via clickhouse-client
docker exec -it vigil-clickhouse clickhouse-client \
  --user admin \
  --password <password> \
  --query "SELECT * FROM n8n_logs.events_v2 LIMIT 5"
```

## Database Schema

### events_v2 Table

```sql
CREATE TABLE n8n_logs.events_v2 (
    timestamp DateTime64(3),
    event_id String,
    session_id String,

    -- Input
    original_input String,
    input_normalized String,
    detected_language String,

    -- Branch Scores
    branch_a_score UInt32,
    branch_b_score UInt32,
    branch_c_score UInt32,
    arbiter_score UInt32,

    -- Decision
    final_status Enum8('ALLOWED' = 0, 'SANITIZED' = 1, 'BLOCKED' = 2),
    categories_detected Array(String),
    boosts_applied Array(String),

    -- PII
    pii_sanitized UInt8,
    pii_types_detected Array(String),
    pii_entities_count UInt32,

    -- Metadata
    processing_time_ms UInt32,
    client_id String,
    browser_name String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, event_id)
TTL timestamp + INTERVAL 90 DAY;
```

## Grafana Dashboards

### Main Dashboard

Panels:
1. **Request Volume** - Total requests over time
2. **Status Distribution** - ALLOW/SANITIZE/BLOCK ratio
3. **Branch Performance** - Per-branch detection rates
4. **Top Categories** - Most triggered threat categories
5. **PII Detection** - PII entity types found
6. **Response Time** - Processing latency P50/P95/P99

### Alerts

- **High Block Rate** - >20% blocked in 5 minutes
- **PII Leak Risk** - Original PII reaching output
- **Service Latency** - P99 >500ms

## Data Retention

Configure via Web UI or API:

```json
{
  "events_v2": {
    "retention_days": 90,
    "partition_by": "toYYYYMM(timestamp)"
  },
  "events_raw": {
    "retention_days": 30
  }
}
```

### Manual Cleanup

```sql
-- Drop old partitions
ALTER TABLE n8n_logs.events_v2
DROP PARTITION '202409';

-- Optimize table
OPTIMIZE TABLE n8n_logs.events_v2 FINAL;
```

## Common Queries

### Detection Statistics

```sql
SELECT
    final_status,
    count() as count,
    avg(arbiter_score) as avg_score
FROM n8n_logs.events_v2
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY final_status;
```

### Top Threat Categories

```sql
SELECT
    arrayJoin(categories_detected) as category,
    count() as count
FROM n8n_logs.events_v2
WHERE final_status = 'BLOCKED'
GROUP BY category
ORDER BY count DESC
LIMIT 10;
```

### PII Detection Rate

```sql
SELECT
    toDate(timestamp) as date,
    countIf(pii_sanitized = 1) as with_pii,
    count() as total,
    round(with_pii / total * 100, 2) as pii_rate
FROM n8n_logs.events_v2
GROUP BY date
ORDER BY date DESC
LIMIT 7;
```

## Troubleshooting

### ClickHouse Won't Start

```bash
# Check logs
docker logs vigil-clickhouse

# Verify data directory
ls -la vigil_data/clickhouse/

# Reset data (WARNING: deletes all data)
rm -rf vigil_data/clickhouse/
docker-compose up -d clickhouse
```

### Grafana Dashboard Empty

1. Check datasource connection in Grafana
2. Verify ClickHouse credentials match `.env`
3. Ensure workflow is active and logging

### High Disk Usage

```sql
-- Check table sizes
SELECT
    table,
    formatReadableSize(sum(bytes)) as size
FROM system.parts
WHERE database = 'n8n_logs'
GROUP BY table;
```

## Related Documentation

- [ClickHouse Retention](../../docs/CLICKHOUSE_RETENTION.md)
- [Grafana Setup](../../docs/GRAFANA_SETUP.md)
- [API Reference](../../docs/API.md)
