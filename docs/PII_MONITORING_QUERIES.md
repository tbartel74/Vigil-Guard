# PII Detection Monitoring Queries

**Phase 4 of Critical PII False Positive Fix**

## Overview

This document contains ClickHouse queries for monitoring PERSON entity false positive rates in Grafana dashboards.

## Key Metrics

### 1. PERSON Entity Detection Rate (Histogram)

Tracks number of PERSON entities detected per request over time.

```sql
SELECT
    toStartOfHour(timestamp) as hour,
    COUNT(*) as total_requests,
    SUM(CASE
        WHEN JSONExtractString(sanitizer_json, 'entities[0].type') = 'PERSON'
        THEN 1
        ELSE 0
    END) as requests_with_person_entities,
    (requests_with_person_entities / total_requests) * 100 as person_detection_rate_pct
FROM n8n_logs.events_processed
WHERE toDate(timestamp) >= today() - INTERVAL 7 DAY
    AND JSONHas(sanitizer_json, 'entities')
GROUP BY hour
ORDER BY hour DESC
LIMIT 168  -- 7 days * 24 hours
```

**Grafana Config:**
- Visualization: Time series
- Y-axis: `person_detection_rate_pct` (percentage)
- Expected range: 10-30% (healthy), >50% indicates potential over-detection

### 2. Rejection Reason Breakdown

Analyzes why PERSON entities were rejected by post-processing filters.

```sql
SELECT
    JSONExtractString(sanitizer_json, 'rejection_reason') as rejection_reason,
    COUNT(*) as rejection_count
FROM n8n_logs.events_processed
WHERE toDate(timestamp) = today()
    AND JSONHas(sanitizer_json, 'rejected_entities')
    AND JSONExtractString(sanitizer_json, 'rejected_entities[0].type') = 'PERSON'
GROUP BY rejection_reason
ORDER BY rejection_count DESC
```

**Expected Breakdown:**
- `pronoun_filter`: 20-30%
- `single_word_name`: 15-25%
- `all_caps_acronym`: 5-10%
- `low_score`: 30-40%

### 3. Allow-List Effectiveness

Tracks how many detections were prevented by allow-list.

```sql
SELECT
    toStartOfHour(timestamp) as hour,
    COUNT(*) as total_requests,
    SUM(CASE
        WHEN JSONExtractString(sanitizer_json, 'allow_list_hits') > '0'
        THEN 1
        ELSE 0
    END) as requests_with_allow_list_hits
FROM n8n_logs.events_processed
WHERE toDate(timestamp) >= today() - INTERVAL 1 DAY
GROUP BY hour
ORDER BY hour DESC
```

**Grafana Config:**
- Visualization: Stat panel
- Expected: 15-30% of requests hit allow-list

### 4. False Positive Rate Calculation

Estimates false positive rate based on rejected entities.

```sql
SELECT
    toStartOfHour(timestamp) as hour,
    COUNT(*) as total_person_entities,
    SUM(CASE
        WHEN JSONExtractFloat(sanitizer_json, 'entities[0].score') < 0.6
        THEN 1
        ELSE 0
    END) as rejected,
    SUM(CASE
        WHEN JSONExtractFloat(sanitizer_json, 'entities[0].score') >= 0.6
        THEN 1
        ELSE 0
    END) as accepted,
    (rejected / total_person_entities) * 100 as false_positive_rate
FROM n8n_logs.events_processed
WHERE toDate(timestamp) = today()
    AND JSONHas(sanitizer_json, 'entities')
    AND JSONExtractString(sanitizer_json, 'entities[0].type') = 'PERSON'
GROUP BY hour
ORDER BY hour DESC
```

**Target KPI:**
- False positive rate: <10% (after fix)
- Pre-fix baseline: ~40-60% (estimated)

### 5. Jailbreak Narrative Detection

Monitors detection of jailbreak personas (Sigma, DAN, UCAR).

```sql
SELECT
    toDate(timestamp) as date,
    COUNT(*) as total_jailbreak_attempts,
    SUM(CASE
        WHEN final_status = 'BLOCK'
        THEN 1
        ELSE 0
    END) as blocked,
    SUM(CASE
        WHEN final_status IN ('SANITIZE_LIGHT', 'SANITIZE_HEAVY')
        THEN 1
        ELSE 0
    END) as sanitized,
    SUM(CASE
        WHEN final_status = 'ALLOWED'
        THEN 1
        ELSE 0
    END) as bypassed
FROM n8n_logs.events_processed
WHERE toDate(timestamp) >= today() - INTERVAL 30 DAY
    AND (
        input LIKE '%Sigma%'
        OR input LIKE '%DAN%'
        OR input LIKE '%UCAR%'
        OR input LIKE '%Yool%'
    )
GROUP BY date
ORDER BY date DESC
```

**Alert Condition:**
- Trigger if `bypassed` > 5% of `total_jailbreak_attempts` in 24h window

## Grafana Dashboard Layout

### Top Row: Key Metrics
- **Stat 1:** False Positive Rate (today vs yesterday)
- **Stat 2:** Allow-List Hit Rate
- **Stat 3:** Total PERSON Entities Detected (24h)
- **Stat 4:** Jailbreak Bypass Rate

### Middle Row: Time Series
- **Panel 1:** PERSON Detection Rate (7 days)
- **Panel 2:** Rejection Reason Breakdown (pie chart)

### Bottom Row: Detailed Analysis
- **Panel 3:** Hourly Entity Count (stacked bar: accepted vs rejected)
- **Panel 4:** Top Rejected Terms (table)

## Implementation Steps

1. **Create new dashboard:** `PII Detection Monitoring`
2. **Add ClickHouse data source** (existing: `vigil-clickhouse`)
3. **Create 4-6 panels** using queries above
4. **Set alerts:**
   - False positive rate >25% (warning)
   - False positive rate >50% (critical)
   - Jailbreak bypass >5% (critical)

## Testing Queries

Before adding to Grafana, test queries directly:

```bash
docker exec -it vigil-clickhouse clickhouse-client \
  --password="$CLICKHOUSE_PASSWORD" \
  --query="SELECT COUNT(*) FROM n8n_logs.events_processed WHERE toDate(timestamp) = today()"
```

## References

- Critical_to_Fix.md: Lines 604-634 (dashboard specification)
- ClickHouse schema: `services/monitoring/clickhouse/init-db.sql`
- Existing dashboards: `services/monitoring/grafana/provisioning/dashboards/`

---

**Last Updated:** 2025-11-12 (Phase 4 implementation)
