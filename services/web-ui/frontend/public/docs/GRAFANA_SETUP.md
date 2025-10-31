# Grafana Setup Guide

> **Complete guide for configuring Grafana integration with Vigil Guard monitoring dashboard**

## 🎯 Overview

This guide covers the complete setup and configuration of Grafana for the Vigil Guard monitoring dashboard. The integration provides 6 specialized panels for real-time security analytics and threat monitoring.

## 📋 Prerequisites

- Docker installed and running
- Vigil Guard backend running on port 8787
- Network access to ClickHouse database (if using external data source)
- Basic understanding of Grafana configuration

## 🚀 Quick Start

### 1. Start Grafana Container

```bash
# Create data directory
mkdir -p grafana-data
sudo chown 472:472 grafana-data

# Start Grafana with proper configuration
docker run -d \
  --name vigil-grafana \
  --restart unless-stopped \
  -p 3001:3000 \
  -v $(pwd)/grafana-data:/var/lib/grafana \
  -e GF_SECURITY_ALLOW_EMBEDDING=true \
  -e GF_SECURITY_COOKIE_SAMESITE=lax \
  -e GF_AUTH_ANONYMOUS_ENABLED=true \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
  -e GF_USERS_ALLOW_SIGN_UP=false \
  -e GF_SECURITY_DISABLE_GRAVATAR=true \
  grafana/grafana:latest
```

### 2. Verify Installation

```bash
# Check container status
docker ps | grep vigil-grafana

# Test Grafana accessibility
curl -I http://localhost:3001

# Expected response should include:
# HTTP/1.1 200 OK
# X-Frame-Options should NOT be present
```

### 3. Initial Login

```bash
# Wait for Grafana to fully start
sleep 30

# Reset admin password to 'admin'
docker exec -it vigil-grafana grafana-cli admin reset-admin-password admin

# Test login
curl -u admin:admin http://localhost:3001/api/health
```

Access Grafana at: http://localhost:3001
- **Username**: `admin`
- **Password**: `admin`

## ⚙️ Configuration Details

### Security Settings

The container starts with these critical security settings:

| Setting | Value | Purpose |
|---------|-------|---------|
| `GF_SECURITY_ALLOW_EMBEDDING` | `true` | Enables iframe embedding in Web UI |
| `GF_SECURITY_COOKIE_SAMESITE` | `lax` | Prevents CORS issues |
| `GF_AUTH_ANONYMOUS_ENABLED` | `true` | **Enabled by default** - Required for Web UI iframe embeds |
| `GF_AUTH_ANONYMOUS_ORG_ROLE` | `Viewer` | Read-only access (cannot modify dashboards) |

**Security Architecture**: Anonymous access is **enabled by default** but secured through:
1. **JWT Authentication at Web UI layer** - Users must login to Web UI first
2. **Read-only Viewer role** - Anonymous users cannot modify Grafana configuration
3. **Reverse proxy (Caddy)** - All traffic routed through authenticated frontend
4. **Iframe embedding only** - Grafana accessed via authenticated Web UI dashboard page

```
User Login → Web UI (JWT Auth) → Grafana iframe (anonymous Viewer) → ClickHouse
```

This design allows seamless dashboard embedding while maintaining security at the application layer. For direct Grafana access hardening, see **Production Configuration** section below.

### Custom Configuration File

For advanced configuration, create `grafana.ini`:

```ini
[server]
protocol = http
http_port = 3000
domain = localhost
root_url = http://localhost:3001/

[security]
allow_embedding = true
cookie_samesite = lax
disable_gravatar = true
cookie_secure = false

[auth.anonymous]
enabled = true
org_name = Main Org.
org_role = Viewer
hide_version = true

[users]
allow_sign_up = false
auto_assign_org = true
auto_assign_org_id = 1
auto_assign_org_role = Viewer

[dashboards]
default_home_dashboard_path = /var/lib/grafana/dashboards/vigil-dashboard.json

[panels]
disable_sanitize_html = false

[security]
disable_initial_admin_creation = false
admin_user = admin
admin_password = admin
```

Mount the configuration:
```bash
docker run -d \
  --name vigil-grafana \
  -p 3001:3000 \
  -v $(pwd)/grafana.ini:/etc/grafana/grafana.ini \
  -v $(pwd)/grafana-data:/var/lib/grafana \
  grafana/grafana:latest
```

## 📊 Dashboard Configuration

### Dashboard Overview

**Dashboard Details:**
- **Title**: Vigil
- **UID**: `6cf14bba-9b61-45d7-82c3-04e1005dea38`
- **Version**: 17
- **Data Source**: ClickHouse (`vertamedia-clickhouse-datasource`)
- **Database**: `n8n_logs.events_processed`
- **Default Time Range**: Last 24 hours

### Dashboard Structure

The Vigil monitoring dashboard consists of 6 specialized panels that correspond exactly to the GUI monitoring interface:

| Panel ID | GUI Order | Name | Type | Grid Position | Purpose |
|----------|-----------|------|------|---------------|---------|
| **1** | 1st (Top) | Input/Output Processing Table | Table | Full width (w:12, h:8) | Real-time processing data with decisions |
| **5** | 2nd (Below table) | TOP-10 Detection Categories | Bar Chart | Full width (w:12, h:8) | Threat category analysis by total score |
| **2** | 3rd (Left) | Volume + Decision Status | Time Series | Half width (w:12, h:8) | ALLOWED/SANITIZED/BLOCKED trends |
| **3** | 4th (Right) | Block Rate % Over Time | Bar Chart | Half width (w:12, h:8) | Security effectiveness percentage |
| **4** | 5th (Left bottom) | Maliciousness Trend | Time Series | Half width (w:12, h:8) | AVG & P95 risk score analysis |
| **6** | 6th (Right bottom) | Histogram Time Series | Histogram | Half width (w:12, h:8) | Score distribution buckets |

### Panel URLs

Each panel uses this URL structure:
```
http://localhost:3001/d-solo/{dashboard-id}/vigil
?orgId=1
&from=now-{timeRange}
&to=now
&timezone=browser
&panelId={panel-number}
&__feature.dashboardSceneSolo=true
&refresh={refreshInterval}s
&_={cache-buster}
```

### Dashboard Import

The complete dashboard configuration is available in `doc/Grafana_dashboard.JSON`. To import:

1. **Download Dashboard JSON**
   ```bash
   # The dashboard JSON is located at:
   cat doc/Grafana_dashboard.JSON
   ```

2. **Import via Grafana UI**
   - Login to Grafana: http://localhost:3001
   - Go to **Dashboards** → **Import**
   - Copy the JSON content from `Grafana_dashboard.JSON`
   - Paste and click **Load**
   - Configure data source if needed
   - Click **Import**

3. **Import via API**
   ```bash
   curl -X POST http://localhost:3001/api/dashboards/db \
     -H "Content-Type: application/json" \
     -u admin:admin \
     -d @doc/Grafana_dashboard.JSON
   ```

### Dashboard Key Features

- **Real-time Updates**: All panels support dynamic time ranges and auto-refresh
- **ClickHouse Integration**: Direct queries to `n8n_logs.events_processed` table
- **Responsive Layout**: Panels adapt to different screen sizes
- **Interactive Filtering**: Table supports column filtering and sorting
- **Color Coding**: Status-based color schemes for quick threat identification

## 🔗 GUI-Dashboard Mapping

### Frontend Integration Details

The React frontend (`frontend/src/routes.tsx`) embeds exactly these 6 panels in the monitoring dashboard:

```typescript
// Panel mapping correspondence
const panelMapping = {
  1: { // Input/Output Table
    title: "Input/Output Processing Table",
    description: "Real-time processing data with input/output analysis",
    position: "full-width-top",
    height: "300px"
  },
  5: { // TOP-10 Categories
    title: "TOP-10 Detection Categories (Total Score)",
    description: "Dominant abuse types analysis: identify which threats are most prevalent",
    position: "full-width-below-table",
    height: "300px"
  },
  2: { // Volume + Status
    title: "Volume + Decision Status (Stacked)",
    description: "Prompt volume over time with ALLOWED / SANITIZED / BLOCKED status distribution",
    position: "half-width-left",
    height: "250px"
  },
  3: { // Block Rate
    title: "Block Rate % Over Time",
    description: "Percentage of BLOCKED requests - early indicator of traffic quality degradation",
    position: "half-width-right",
    height: "250px"
  },
  4: { // Maliciousness Trend
    title: "Maliciousness Trend — AVG & P95 Score",
    description: "Risk trend analysis: Average smooths patterns, P95 captures tail risks",
    position: "half-width-bottom-left",
    height: "250px"
  },
  6: { // Histogram
    title: "Histogram \"Time Series\" (Stacked)",
    description: "Distribution of buckets (0–10, 10–20, …) over time",
    position: "half-width-bottom-right",
    height: "250px"
  }
};
```

### URL Generation Pattern

Each panel in the GUI uses this exact URL pattern:

```typescript
const generatePanelURL = (panelId: number, timeRange: string, refreshInterval: number) => {
  return `http://localhost:3001/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil` +
         `?orgId=1` +
         `&from=now-${timeRange}` +
         `&to=now` +
         `&timezone=browser` +
         `&panelId=${panelId}` +
         `&__feature.dashboardSceneSolo=true` +
         `&refresh=${refreshInterval}s` +
         `&_=${Date.now()}`;
};
```

### Database Schema Requirements

The dashboard expects this ClickHouse table structure:

```sql
CREATE TABLE n8n_logs.events_processed (
  timestamp DateTime64(3, 'UTC'),
  final_status LowCardinality(String),      -- ALLOWED, SANITIZED, BLOCKED
  final_action String,                      -- SANITIZER, PROMPT_GUARD, etc.
  pg_score_percent Float64,                 -- 0.0-1.0 or 0-100 range
  scoring_json String,                      -- JSON with match_details array
  pipeline_flow_json String                 -- JSON with input_raw, output_final
) ENGINE = MergeTree()
ORDER BY timestamp;
```

### Sample Data Format

**scoring_json structure**:
```json
{
  "sanitizer_score": 75,
  "match_details": [
    {
      "category": "JAILBREAK_ATTEMPT",
      "score": 85
    },
    {
      "category": "CRITICAL_INJECTION",
      "score": 92
    }
  ]
}
```

**pipeline_flow_json structure**:
```json
{
  "input_raw": "Original user prompt text...",
  "output_final": "Final processed output after security decisions..."
}
```

## 🔗 Data Source Configuration

### ClickHouse Data Source

If using ClickHouse for data storage:

```bash
# Install ClickHouse plugin
docker exec -it vigil-grafana grafana-cli plugins install vertamedia-clickhouse-datasource

# Restart Grafana
docker restart vigil-grafana
```

Data source configuration:
```json
{
  "name": "Vigil ClickHouse",
  "type": "vertamedia-clickhouse-datasource",
  "url": "http://clickhouse-server:8123",
  "access": "proxy",
  "database": "vigil_logs",
  "basicAuth": false,
  "jsonData": {
    "timeout": 10,
    "queryTimeout": "1m"
  }
}
```

### Prometheus Data Source (Alternative)

For Prometheus metrics:
```json
{
  "name": "Vigil Prometheus",
  "type": "prometheus",
  "url": "http://prometheus:9090",
  "access": "proxy",
  "isDefault": true
}
```

## 🎨 Panel Configuration Details

### Panel 1: Input/Output Processing Table

**Purpose**: Shows the latest 10 processed requests with full input/output details and decision information.

**ClickHouse Query**:
```sql
WITH
  JSONExtractArrayRaw(scoring_json, 'match_details') AS details,
  arrayMap(
    d -> (
      JSONExtractString(d, 'category'),
      toInt32( ifNull(JSONExtract(d, 'score', 'Int32'), 0) )
    ),
    details
  ) AS catscores,
  arraySort(x -> -x.2, catscores) AS sorted_catscores
SELECT
  toTimeZone(timestamp, 'Europe/Warsaw') AS time,
  JSONExtractString(pipeline_flow_json, 'input_raw') AS original_prompt,
  JSONExtractString(pipeline_flow_json, 'output_final') AS output_after_decision,
  final_status,
  multiIf(
    positionCaseInsensitive(final_action, 'SANITIZER') > 0, 'SANITIZER',
    positionCaseInsensitive(final_action, 'PROMPT_GUARD') > 0, 'PROMPT_GUARD',
    final_action
  ) AS decision_source,
  arrayStringConcat(
    arraySlice(arrayMap(x -> x.1, sorted_catscores), 1, 2),
    ' + '
  ) AS main_criteria
FROM n8n_logs.events_processed
WHERE timestamp >= toDateTime64($from, 3, 'UTC')
  AND timestamp <= toDateTime64($to, 3, 'UTC')
ORDER BY time DESC
LIMIT 10
```

**Key Features**:
- **Large Cell Height**: Enhanced readability for long prompts
- **Filterable Columns**: Interactive filtering capability
- **Color Coding**: Status-based background colors
- **Timezone Conversion**: Local time display (Europe/Warsaw)

### Panel 5: TOP-10 Detection Categories

**Purpose**: Bar chart showing the most detected threat categories by total score.

**ClickHouse Query**:
```sql
SELECT
  JSONExtractString(d, 'category') AS category,
  sum( toInt32( ifNull(JSONExtract(d, 'score', 'Int32'), 0) ) ) AS score_sum,
  count() AS events
FROM n8n_logs.events_processed
ARRAY JOIN JSONExtractArrayRaw(scoring_json, 'match_details') AS d
WHERE timestamp >= toDateTime64($from, 3, 'UTC')
  AND timestamp <= toDateTime64($to, 3, 'UTC')
GROUP BY category
ORDER BY score_sum DESC NULLS LAST
LIMIT 10
```

**Key Features**:
- **Dominant Threats**: Identifies most prevalent attack types
- **Score Aggregation**: Total threat scores per category
- **Event Count**: Number of occurrences per category
- **TOP-10 Limit**: Focuses on most critical categories

### Panel 2: Volume + Decision Status (Stacked)

**Purpose**: Time series showing request volume trends with stacked decision status distribution.

**ClickHouse Query**:
```sql
SELECT
  toStartOfMinute(timestamp) AS time,
  final_status,
  count() AS cnt
FROM n8n_logs.events_processed
WHERE timestamp >= toDateTime64($from, 3, 'UTC')
  AND timestamp <= toDateTime64($to, 3, 'UTC')
GROUP BY time, final_status
ORDER BY time
```

**Key Features**:
- **Stacked Visualization**: Shows ALLOWED/SANITIZED/BLOCKED distribution
- **Minute Granularity**: 1-minute time buckets
- **Volume Trends**: Identifies traffic patterns
- **Decision Tracking**: Monitors security effectiveness over time

### Panel 3: Block Rate % Over Time

**Purpose**: Bar chart showing the percentage of blocked requests over time.

**ClickHouse Query**:
```sql
SELECT
  toStartOfMinute(timestamp) AS time,
  (sum(final_status = 'BLOCKED') / count()) * 100.0 AS block_rate_pct
FROM n8n_logs.events_processed
WHERE timestamp >= toDateTime64($from, 3, 'UTC')
  AND timestamp <= toDateTime64($to, 3, 'UTC')
GROUP BY time
ORDER BY time
```

**Key Features**:
- **Percentage Calculation**: Shows block rate as percentage
- **Early Warning**: Identifies security degradation
- **Traffic Quality**: Monitors overall threat levels
- **Threshold Monitoring**: Can trigger alerts at specific percentages

### Panel 4: Maliciousness Trend — AVG & P95 Score

**Purpose**: Time series showing average and 95th percentile maliciousness scores.

**ClickHouse Query**:
```sql
-- AVG
SELECT
  toStartOfMinute(timestamp) AS time,
  'avg' AS metric,
  avg(
    greatest(
      least(100.0, greatest(0.0, if(pg_score_percent <= 1, pg_score_percent * 100.0, pg_score_percent))),
      toFloat64(ifNull(JSONExtract(scoring_json, 'sanitizer_score', 'Int32'), 0))
    )
  ) AS value
FROM n8n_logs.events_processed
WHERE timestamp >= toDateTime64($from, 3, 'UTC')
  AND timestamp <= toDateTime64($to, 3, 'UTC')
GROUP BY time

UNION ALL

-- P95
SELECT
  toStartOfMinute(timestamp) AS time,
  'p95' AS metric,
  quantileExact(0.95)(
    greatest(
      least(100.0, greatest(0.0, if(pg_score_percent <= 1, pg_score_percent * 100.0, pg_score_percent))),
      toFloat64(ifNull(JSONExtract(scoring_json, 'sanitizer_score', 'Int32'), 0))
    )
  ) AS value
FROM n8n_logs.events_processed
WHERE timestamp >= toDateTime64($from, 3, 'UTC')
  AND timestamp <= toDateTime64($to, 3, 'UTC')
GROUP BY time

ORDER BY time, metric
```

**Key Features**:
- **Dual Metrics**: Average smooths patterns, P95 captures tail risks
- **Score Normalization**: Handles both 0-1 and 0-100 score ranges
- **Multi-source Scoring**: Combines Prompt Guard and Sanitizer scores
- **Emerging Threats**: P95 detects anomalous high-risk events

### Panel 6: Histogram Time Series (Stacked)

**Purpose**: Histogram showing distribution of maliciousness scores in time-based buckets.

**ClickHouse Query**:
```sql
SELECT
  time,
  concat(toString(bucket), '–', toString(bucket + 10), '%') AS bucket_label,
  count() AS cnt
FROM
(
  SELECT
    toStartOfMinute(timestamp) AS time,
    floor( if(pg_score_percent <= 1, pg_score_percent * 100.0, pg_score_percent) / 10 ) * 10 AS bucket
  FROM n8n_logs.events_processed
  WHERE timestamp >= toDateTime64($from, 3, 'UTC')
    AND timestamp <= toDateTime64($to, 3, 'UTC')
)
GROUP BY time, bucket
ORDER BY time, bucket
```

**Key Features**:
- **10% Buckets**: Score ranges (0-10%, 10-20%, etc.)
- **Time-based Grouping**: Shows how score distribution changes over time
- **Pattern Recognition**: Identifies unusual score patterns
- **Visual Distribution**: Easy to spot score concentrations

## 🔧 Frontend Integration

### Iframe Embedding Code

The frontend embeds Grafana panels using the `GrafanaEmbed` component:

```typescript
<GrafanaEmbed
  src={`http://localhost:3001/d-solo/6cf14bba-9b61-45d7-82c3-04e1005dea38/vigil?orgId=1&from=now-${timeRange}&to=now&timezone=browser&panelId=1&__feature.dashboardSceneSolo=true&refresh=${refreshInterval}s&_=${Date.now()}`}
  title="Vigil Input/Output Table"
  height="300"
  refreshInterval={refreshInterval}
/>
```

### Auto-Refresh Implementation

```typescript
useEffect(() => {
  if (refreshInterval > 0) {
    const interval = setInterval(() => {
      const urlObj = new URL(iframeSrc);
      urlObj.searchParams.set('_', Date.now().toString());
      setIframeSrc(urlObj.toString());
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }
}, [refreshInterval, iframeSrc]);
```

## 🚨 Troubleshooting

### Common Issues

#### 1. X-Frame-Options Blocking

**Symptom**: Iframe shows "Refused to display in a frame"
**Solution**:
```bash
# Verify embedding is enabled
docker exec -it vigil-grafana grep -i "allow_embedding" /etc/grafana/grafana.ini

# Should show: allow_embedding = true
```

#### 2. CORS Issues

**Symptom**: Cookie/authentication errors
**Solution**:
```bash
# Check cookie settings
docker logs vigil-grafana | grep -i cookie

# Verify SameSite setting
curl -I http://localhost:3001 | grep -i "set-cookie"
```

#### 3. Panel Not Found

**Symptom**: "Panel not found" error
**Solution**:
```bash
# Check panel ID exists
curl -u admin:admin "http://localhost:3001/api/dashboards/uid/dashboard-uid" | jq '.dashboard.panels[].id'

# Verify time range parameters
# Use relative time: from=now-6h&to=now
```

#### 4. Authentication Issues

**Symptom**: 401 Unauthorized
**Solution**:
```bash
# Reset admin password
docker exec -it vigil-grafana grafana-cli admin reset-admin-password admin

# Enable anonymous access
docker exec -it vigil-grafana sh -c 'echo "[auth.anonymous]" >> /etc/grafana/grafana.ini'
docker exec -it vigil-grafana sh -c 'echo "enabled = true" >> /etc/grafana/grafana.ini'
docker restart vigil-grafana
```

### Debug Commands

```bash
# Check Grafana container logs
docker logs vigil-grafana --tail 50

# Test panel URLs directly
curl -u admin:admin "http://localhost:3001/d-solo/dashboard-id/panel-name?panelId=1"

# Verify data source connectivity
curl -u admin:admin "http://localhost:3001/api/datasources" | jq '.[].name'

# Check iframe embedding capability
curl -I "http://localhost:3001/d-solo/dashboard-id/panel-name" | grep -i "x-frame"
```

### Performance Optimization

#### 1. Query Optimization

```sql
-- Optimize queries with proper indexing
CREATE INDEX idx_timestamp ON vigil_logs(timestamp);
CREATE INDEX idx_decision ON vigil_logs(decision);

-- Use time-based partitioning
ALTER TABLE vigil_logs
PARTITION BY toYYYYMM(timestamp);
```

#### 2. Panel Refresh Tuning

```json
{
  "refresh": "30s",
  "time": {
    "from": "now-6h",
    "to": "now"
  },
  "liveNow": true,
  "timepicker": {
    "refresh_intervals": ["10s", "30s", "1m", "5m"]
  }
}
```

## 📊 Monitoring Grafana

### Health Checks

```bash
# Grafana health endpoint
curl http://localhost:3001/api/health

# Database connectivity
curl -u admin:admin http://localhost:3001/api/datasources/proxy/1/api/v1/label/__name__/values

# Panel performance
curl -u admin:admin "http://localhost:3001/api/dashboards/uid/dashboard-uid" | jq '.dashboard.panels | length'
```

### Resource Usage

```bash
# Monitor container resources
docker stats vigil-grafana

# Check disk usage
docker exec vigil-grafana du -sh /var/lib/grafana

# Memory usage
docker exec vigil-grafana cat /proc/meminfo | grep MemAvailable
```

## 🔒 Security Considerations

### Access Control

```bash
# Disable admin user creation after setup
docker exec -it vigil-grafana sh -c 'echo "disable_initial_admin_creation = true" >> /etc/grafana/grafana.ini'

# Configure user authentication
docker exec -it vigil-grafana sh -c 'echo "[auth.basic]" >> /etc/grafana/grafana.ini'
docker exec -it vigil-grafana sh -c 'echo "enabled = false" >> /etc/grafana/grafana.ini'
```

### Network Security

```bash
# Restrict network access (production)
docker run -d \
  --name vigil-grafana \
  --network vigil-network \
  -p 127.0.0.1:3001:3000 \
  grafana/grafana:latest
```

## 📚 Additional Resources

- [Grafana Documentation](https://grafana.com/docs/)
- [Iframe Embedding Guide](https://grafana.com/docs/grafana/latest/sharing/embed-panels/)
- [ClickHouse Data Source](https://grafana.com/grafana/plugins/vertamedia-clickhouse-datasource/)
- [Security Configuration](https://grafana.com/docs/grafana/latest/administration/security/)

---

**Next Steps**: After completing Grafana setup, verify the integration by accessing http://localhost:5173 and checking that all dashboard panels load correctly with real-time data.