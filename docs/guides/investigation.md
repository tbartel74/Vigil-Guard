# Investigation Panel

<!-- GUI-HELP: Advanced prompt search and forensic analysis -->
<!-- GUI-SECTION: investigation -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Overview

The Investigation Panel is a powerful search interface for analyzing historical prompts with comprehensive filtering capabilities.

**Location:** Investigation (sidebar)
**Permission:** Authentication required

**Features:**
- Advanced Filtering - Date, text, status, score, categories
- Pagination - Navigate through thousands of events
- Detailed Analysis - Complete decision breakdown
- Export - CSV/JSON (up to 10,000 records)

---

## Search Filters

### Date Range
| Field | Format | Description |
|-------|--------|-------------|
| Start Date | YYYY-MM-DD | Beginning of search period |
| End Date | YYYY-MM-DD | End of search period |

Both fields optional. Uses your configured timezone.

### Text Query
- Case-insensitive substring matching
- Example: `ignore previous instructions`
- Leave empty to match all prompts

### Status Filter
| Status | Color | Description |
|--------|-------|-------------|
| All | - | Show all (default) |
| ALLOWED | Green | Permitted prompts |
| SANITIZED | Yellow/Orange | Modified prompts |
| BLOCKED | Red | Rejected prompts |

### Threat Score Range
- Min/Max: 0-100
- Example: 85-100 shows critical threats only

### Detected Categories
- Comma-separated list
- Example: `prompt_injection,jailbreak,sql_injection`
- Case-sensitive

### Sorting
| Option | Description |
|--------|-------------|
| Timestamp | Chronological order (default) |
| Threat Score | Risk severity order |
| Status | Decision type order |
| DESC/ASC | Newest first / Oldest first |

### Pagination
- Page sizes: 10, 25, 50 (default), 100
- Shows "Page X of Y" with navigation

---

## Results Table

| Column | Description |
|--------|-------------|
| Timestamp | When prompt was processed |
| Prompt Input | First 100 characters |
| Status | Color-coded decision badge |
| Threat Score | 0-100 with color coding |
| Categories | Detected threat types |
| Actions | "View Details" button |

**Score Colors:**
- 0-29: Green (Low)
- 30-64: Yellow (Medium)
- 65-84: Orange (High)
- 85-100: Red (Critical)

---

## Detailed Analysis Modal

Click "View Details" to open full analysis.

### Modal Sections

**1. Original Input**
- Full unmodified prompt text
- Monospace font, scrollable

**2. Output Returned to User**
- ALLOWED: Same as original
- SANITIZED: Shows [REDACTED] markers
- BLOCKED: Block message or empty

**3. Status & Scores**
| Field | Description |
|-------|-------------|
| Final Status | ALLOWED/SANITIZED/BLOCKED |
| Sanitizer Score | Internal engine result (0-100) |
| Prompt Guard Score | AI model confidence (0.0-1.0) |

**4. Decision Reason**
- Action Taken: Technical decision
- Internal Note: Human-readable explanation
- Decision Source: Which component decided

**5. Score Breakdown by Category**
```
SQL_XSS_ATTACKS         65
ENCODING_SUSPICIOUS     36
PRIVILEGE_ESCALATION   82.5
```

**6. Detected Patterns**
```
Pattern: xp_cmdshell_sql_injection
Category: SQL_XSS_ATTACKS
Matched: "'; EXEC xp_cmdshell('whoami')--"
```

**7. Processing Pipeline**
- Input (Raw) → Normalized → PII Redacted → Sanitized → Final Output

---

## Use Cases

### 1. Investigating False Positives

**Scenario:** User reports legitimate prompt was blocked

1. Set date range to incident time
2. Search for user's prompt text
3. Filter by status: BLOCKED
4. Click "View Details"
5. Review "Decision Reason" and "Detected Patterns"
6. Adjust threshold in Configuration if needed

### 2. Analyzing Attack Patterns

**Scenario:** Multiple similar attacks detected

1. Filter by BLOCKED status and score 85-100
2. Review results for common patterns
3. Click "View Details" on several examples
4. Document attack signatures
5. Export as CSV for reporting

### 3. PII Audit

**Scenario:** Verify redaction is working

1. Filter by status: SANITIZED
2. Filter by categories: `pii_detected`
3. Compare "Original Input" vs "Output"
4. Verify sensitive data was redacted

### 4. Compliance Reporting

1. Set date range to reporting period
2. Export CSV
3. Analyze: total prompts, block rate, top categories
4. Generate charts for stakeholders

---

## Export Options

| Format | Max Records | Use Case |
|--------|-------------|----------|
| CSV | 10,000 | Spreadsheet analysis |
| JSON | 10,000 | Programmatic processing |

Filename: `vigil-prompts-YYYYMMDD-HHMMSS.csv`

---

## Troubleshooting

### No Results Found
1. Verify date range includes expected data
2. Clear filters and retry with broader search
3. Check ClickHouse data:
   ```bash
   docker exec vigil-clickhouse clickhouse-client -q \
     "SELECT count() FROM n8n_logs.events_v2"
   ```

### Slow Search Performance
1. Reduce date range
2. Add specific filters
3. Check ClickHouse health:
   ```bash
   docker exec vigil-clickhouse clickhouse-client -q "SELECT 1"
   ```

### Export Fails
1. Verify results exist
2. Check browser download settings
3. Try smaller export (reduce date range)

---

**Screenshots:**
- `docs/pic/Investigation.png`
- `docs/pic/Investigation-details.png`

**Related:** [Dashboard](dashboard.md) | [Configuration](configuration.md)
