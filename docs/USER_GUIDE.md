# Vigil Guard - User Guide

**Complete guide to using the Vigil Guard Web UI for security monitoring, threat analysis, and configuration management.**

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Monitoring Dashboard](#monitoring-dashboard)
4. [Investigation Panel](#investigation-panel)
5. [Prompt Analyzer](#prompt-analyzer)
6. [Configuration Management](#configuration-management)
   - [Configuration Version History & Rollback](#configuration-version-history--rollback)
7. [File Manager](#file-manager)
8. [User Administration](#user-administration)
9. [Settings & Preferences](#settings--preferences)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The Vigil Guard Web UI provides a comprehensive interface for:

- **Real-time Monitoring** - Live security metrics and threat detection analytics
- **Investigation** - Advanced prompt search and detailed decision analysis
- **Threat Analysis** - Detailed inspection of detected malicious prompts
- **Configuration** - Dynamic security policy management
- **File Management** - Direct configuration file editing with audit logging
- **User Management** - Role-based access control and user administration

### User Roles & Permissions

| Permission | Description | Access Level |
|-----------|-------------|--------------|
| `can_view_monitoring` | Access monitoring dashboard and analytics | Standard User |
| `can_view_configuration` | Edit security policies and configuration | Administrator |
| `can_manage_users` | Create, edit, and delete users | Super Admin |

---

## Getting Started

### Login

1. Navigate to: `http://localhost/ui` (or your configured domain)
2. Enter your credentials:
   - Default admin: `admin / admin123` (⚠️ change immediately!)
3. Click **Login**

### Dashboard Overview

After login, you'll see:

- **Top Bar** - User info, Prompt Guard status, logout
- **Left Sidebar** - Navigation menu:
  - Monitoring
  - Configuration
  - Administration (if authorized)
  - Settings
- **Main Content** - Active section content
- **Footer** - Copyright, version, "Built with Llama" attribution

---

## Monitoring Dashboard

The monitoring dashboard provides real-time security analytics through integrated Grafana panels and live statistics.

### Quick Statistics

**Location**: Top of Monitoring page

Displays last 24-hour metrics:
- **Requests Processed** - Total prompts analyzed
- **Threats Blocked** - Malicious requests stopped
- **Content Sanitized** - Requests modified for safety
- **Prompt Guard Status** - AI model health (✓ Running / ✗ Down)

**Auto-refresh**: Configurable (10s, 30s, 1m, 5m, or manual)

### Time Range Control

Select analysis period:
- **1 hour** - Recent activity
- **6 hours** - Short-term trends
- **12 hours** - Half-day analysis
- **24 hours** - Daily overview (default)
- **7 days** - Weekly trends

### Grafana Analytics Panels

#### 1. Input/Output Processing Table

**Purpose**: Real-time request monitoring

**Displays**:
- Original prompt text
- Sanitized output (if modified)
- Detection status (ALLOWED/SANITIZED/BLOCKED)
- Maliciousness score (0-100)
- Timestamp

**Use Case**: Monitor live system activity and verify sanitization

#### 2. TOP-10 Detection Categories

**Purpose**: Identify dominant threat types

**Displays**:
- Top 10 most detected attack categories
- Count per category
- Bar chart visualization

**Common Categories**:
- `prompt_injection` - Direct instruction manipulation
- `jailbreak` - System constraint bypass attempts
- `sensitive_info_leak` - Data extraction attempts
- `content_override` - Output control attempts

**Use Case**: Understand attack patterns and adjust detection rules

#### 3. Volume + Status Distribution

**Purpose**: Track system decision patterns

**Displays**:
- Total request volume over time
- Distribution of decisions:
  - ALLOWED (green)
  - SANITIZED_LIGHT (yellow)
  - SANITIZED_HEAVY (orange)
  - BLOCKED (red)

**Use Case**: Evaluate system effectiveness and decision balance

#### 4. Block Rate Percentage

**Purpose**: Early warning indicator

**Displays**:
- Percentage of blocked requests
- Trend line over selected time range

**Thresholds**:
- < 5% - Normal operation
- 5-15% - Increased threat activity
- > 15% - Attack in progress (investigate immediately)

**Use Case**: Detect coordinated attacks or system misconfigurations

#### 5. Maliciousness Trend Analysis

**Purpose**: Risk trend monitoring

**Displays**:
- **Average Score** - Mean maliciousness across all requests
- **P95 Score** - 95th percentile (worst 5% of requests)
- Trend lines over time

**Score Ranges**:
- 0-29: Low risk (ALLOW)
- 30-64: Medium risk (SANITIZE_LIGHT)
- 65-84: High risk (SANITIZE_HEAVY)
- 85-100: Critical risk (BLOCK)

**Use Case**: Monitor threat severity evolution and tune thresholds

#### 6. Histogram Time Series

**Purpose**: Score distribution visualization

**Displays**:
- Histogram buckets (10-point intervals: 0-10, 10-20, etc.)
- Request count per bucket
- Time-based evolution

**Use Case**: Identify score clustering patterns and anomalies

### Dashboard Controls

**Refresh Now Button**
- Force immediate data reload
- Use after configuration changes

**Auto Refresh Dropdown**
- Off - Manual refresh only
- 10 seconds - High-frequency monitoring
- 30 seconds - Standard monitoring (recommended)
- 1 minute - Low-impact monitoring
- 5 minutes - Background monitoring

---

## Investigation Panel

**Location**: Investigation menu (left sidebar)

**Required Permission**: Authentication required

**Purpose**: Advanced prompt search and detailed decision analysis for forensic investigation of security events.

### Overview

The Investigation Panel is a powerful search interface for analyzing historical prompts with comprehensive filtering capabilities. Unlike the Prompt Analyzer (which shows recent prompts on the Monitoring dashboard), the Investigation Panel provides:

- **Advanced Filtering** - Search by date range, text query, status, threat score, and categories
- **Pagination** - Navigate through thousands of historical events efficiently
- **Detailed Analysis** - Complete decision breakdown showing why prompts were blocked/sanitized/allowed
- **Export Functionality** - Download search results in CSV or JSON format (up to 10,000 records)

### Search Interface

#### Search Filters

**Date Range**
- **Start Date** - Beginning of search period (YYYY-MM-DD format)
- **End Date** - End of search period (YYYY-MM-DD format)
- Both fields optional (leave empty to search all dates)
- Time zone: Uses your configured timezone from Settings

**Text Query**
- Search prompt content for specific keywords or phrases
- Case-insensitive substring matching
- Example: "ignore previous instructions" finds all prompts containing that phrase
- Leave empty to match all prompts

**Status Filter**
- **All** - Show all statuses (default)
- **ALLOWED** - Only permitted prompts (green)
- **SANITIZED** - Only modified prompts (yellow/orange)
- **BLOCKED** - Only rejected prompts (red)

**Threat Score Range**
- **Min Score** - Minimum maliciousness score (0-100)
- **Max Score** - Maximum maliciousness score (0-100)
- Leave empty for no score filtering
- Example: 85-100 shows only critical threats

**Detected Categories**
- Filter by specific threat categories (comma-separated)
- Example: `prompt_injection,jailbreak,sql_injection`
- Leave empty to show all categories
- Category names are case-sensitive

**Sorting Options**
- **Sort By**:
  - Timestamp (default) - Chronological order
  - Threat Score - Risk severity order
  - Status - Decision type order
- **Sort Order**:
  - DESC (newest/highest first) - default
  - ASC (oldest/lowest first)

**Pagination**
- **Page Size** - Results per page (default: 50)
  - Options: 10, 25, 50, 100
- **Current Page** - Navigate through results
- **Total Results** - Shows total matching prompts

#### Search Actions

**Search Button**
- Execute search with current filters
- Resets to page 1
- Displays results table

**Clear Filters Button**
- Reset all filters to defaults
- Clears text query and date range
- Returns to "All" status and full score range

**Export Dropdown**
- **Export CSV** - Download results as CSV file (max 10,000 records)
- **Export JSON** - Download results as JSON file (max 10,000 records)
- Export uses current filter settings
- Filename includes timestamp: `vigil-prompts-YYYYMMDD-HHMMSS.csv`

### Results Table

**Columns**:
- **Timestamp** - When the prompt was processed (formatted with your timezone)
- **Prompt Input** - Original input text (first 100 characters, truncated with "...")
- **Status** - Color-coded decision badge:
  - 🟢 **ALLOWED** - Prompt passed all checks
  - 🟡 **SANITIZED** - Content modified for safety
  - 🔴 **BLOCKED** - Request rejected entirely
- **Threat Score** - Numeric maliciousness score (0-100):
  - 0-29: Low risk (green)
  - 30-64: Medium risk (yellow)
  - 65-84: High risk (orange)
  - 85-100: Critical risk (red)
- **Categories** - Detected threat types (comma-separated pills)
- **Actions** - "View Details" button to open analysis modal

**Empty State**: Shows "No prompts found matching your search criteria" if no results

**Pagination Controls**:
- Page number display: "Page X of Y"
- Previous/Next buttons
- Jump to page input field
- Results count: "Showing X-Y of Z total results"

### Detailed Analysis Modal

**Opens when**: Click "View Details" button on any prompt row

**Modal Layout**: Full-screen overlay with dark background, centered content panel

**Header**:
- Modal title: "Prompt Analysis"
- Close button (X) in top-right corner
- Event ID and timestamp

#### Modal Sections

**1. Original Input**
- **Label**: "Original Input"
- **Content**: Full unmodified prompt text from user
- **Formatting**: Monospace font, scrollable if lengthy
- **Purpose**: See exactly what the user submitted

**2. Output Returned to User**
- **Label**: "Output Returned to User"
- **Content**: What was sent to the LLM (or error message if blocked)
- **Formatting**: Monospace font, scrollable
- **Key Differences**:
  - **ALLOWED**: Same as original (no modifications)
  - **SANITIZED**: Shows redacted/modified version with [REDACTED] markers
  - **BLOCKED**: Shows block message or empty

**3. Status & Scores**
- **Final Status**: Color-coded badge (ALLOWED/SANITIZED/BLOCKED)
- **Sanitizer Score**: Internal scoring engine result (0-100)
- **Prompt Guard Score**: External AI model confidence score (0.0-1.0)
  - Only present if Prompt Guard integration is enabled
  - Shows risk level: BENIGN / INJECTION / JAILBREAK
- **Confidence**: Prompt Guard model confidence percentage

**4. Decision Reason**
- **Label**: "Why This Decision Was Made"
- **Fields**:
  - **Action Taken**: Technical decision (ALLOW/SANITIZE_LIGHT/SANITIZE_HEAVY/BLOCK)
  - **Internal Note**: Human-readable explanation from decision engine
    - Example: "High-confidence prompt injection detected via multiple patterns"
  - **Decision Source**: Which component made final call (sanitizer/prompt_guard/unified_decision)
- **Purpose**: Understand the rationale behind blocking/sanitizing

**5. Score Breakdown by Category**
- **Label**: "Score Breakdown by Category"
- **Format**: Table with columns:
  - Category name (e.g., `SQL_XSS_ATTACKS`, `GODMODE_JAILBREAK`)
  - Points contributed to total score
- **Example**:
  ```
  SQL_XSS_ATTACKS         65
  ENCODING_SUSPICIOUS     36
  PRIVILEGE_ESCALATION   82.5
  ```
- **Purpose**: Identify which detection rules triggered

**6. Detected Patterns**
- **Label**: "Detected Patterns (Pattern Matches)"
- **Format**: List of detected patterns with details
- **Each Entry Shows**:
  - **Pattern Name**: Regex rule identifier
  - **Category**: Threat type
  - **Matched Sample**: Actual text that triggered the pattern
  - **Regex Pattern**: The detection rule (for debugging)
- **Example**:
  ```
  Pattern: xp_cmdshell_sql_injection
  Category: SQL_XSS_ATTACKS
  Matched: "'; EXEC xp_cmdshell('whoami')--"
  Regex: xp_cmdshell\s*\(
  ```
- **Purpose**: Forensic analysis of why prompt was flagged

**7. Processing Pipeline**
- **Label**: "Processing Pipeline"
- **Shows**: Step-by-step transformations:
  - **Input (Raw)**: Original text
  - **Normalized**: After homoglyph/leet speak decoding
  - **PII Redacted**: After sensitive data removal
  - **Sanitized**: After LIGHT/HEAVY redaction (if applied)
  - **Final Output**: What was sent to LLM or returned as block message
- **Purpose**: Trace how text was transformed through the system

**Modal Actions**:
- **Close Button** - Dismiss modal
- **ESC Key** - Also closes modal

### Use Cases

#### 1. Investigating Blocked Prompts

**Scenario**: User reports their legitimate prompt was blocked

**Steps**:
1. Open Investigation Panel
2. Set date range to when incident occurred
3. Search for user's prompt text in "Text Query"
4. Filter by status: BLOCKED
5. Click "View Details" on matching prompt
6. Review "Decision Reason" - see why it was blocked
7. Check "Detected Patterns" - identify overly sensitive rule
8. Navigate to Configuration → Detection & Sensitivity
9. Adjust threshold or pattern weight
10. Test with similar prompts

**Result**: False positive resolved, rule fine-tuned

#### 2. Analyzing Attack Patterns

**Scenario**: Multiple similar attacks detected in logs

**Steps**:
1. Set date range to attack window
2. Filter by status: BLOCKED
3. Filter by score: 85-100 (critical threats)
4. Review results table for common patterns
5. Click "View Details" on several examples
6. Identify common categories (e.g., `prompt_injection,jailbreak`)
7. Check "Detected Patterns" across multiple prompts
8. Document attack signatures
9. Update detection rules to strengthen defenses
10. Export results as CSV for reporting

**Result**: Attack pattern documented, defenses improved

#### 3. Sanitization Audit

**Scenario**: Verify PII redaction is working correctly

**Steps**:
1. Filter by status: SANITIZED
2. Filter by categories: `pii_detected`
3. Review results table
4. Click "View Details" on sanitized prompts
5. Compare "Original Input" vs. "Output Returned to User"
6. Verify sensitive data (email, phone, SSN) was redacted
7. Check for any missed PII
8. If issues found, update PII patterns in Configuration

**Result**: PII redaction validated, gaps identified and fixed

#### 4. Compliance Reporting

**Scenario**: Generate monthly security report

**Steps**:
1. Set date range to last month (YYYY-MM-01 to YYYY-MM-31)
2. Click "Export CSV"
3. Open in spreadsheet software
4. Analyze:
   - Total prompts processed
   - Block rate percentage
   - Top threat categories
   - Hourly/daily trends
5. Generate charts and summary statistics
6. Include in compliance report

**Result**: Data-driven security metrics for stakeholders

#### 5. Forensic Analysis of Security Incident

**Scenario**: Investigate suspected attack campaign

**Steps**:
1. Set date range to incident window
2. Search for suspicious keywords (e.g., "ignore instructions", "jailbreak")
3. Sort by Threat Score (DESC) to see worst offenders first
4. Click "View Details" on high-score prompts
5. Review "Processing Pipeline" to see encoding/obfuscation attempts
6. Check "Score Breakdown" to identify attack vectors
7. Export results as JSON for forensic archive
8. Document findings in incident report

**Result**: Complete forensic trail for security investigation

### Best Practices

**Efficient Searching**:
- Start with broad filters (date range + status)
- Narrow down with text query or categories
- Use pagination to explore large result sets
- Adjust page size based on screen size (50 recommended)

**Performance Tips**:
- Limit date range to relevant period (avoid searching all history)
- Use specific text queries instead of wildcards
- Export in batches if results exceed 10,000 records
- Close modal after analysis to free browser memory

**Data Analysis**:
- Export to CSV for spreadsheet analysis
- Export to JSON for programmatic processing
- Compare patterns across different time periods
- Cross-reference with Monitoring dashboard metrics

**Security Investigations**:
- Always check "Decision Reason" first to understand context
- Review "Detected Patterns" to validate detection accuracy
- Compare "Original Input" vs "Output" for sanitization verification
- Use "Processing Pipeline" to detect obfuscation attempts

**Documentation**:
- Screenshot modal for incident reports
- Export filtered results for audit logs
- Document pattern adjustments in changelog
- Keep forensic archives for compliance

### Integration with Other Features

**Monitoring Dashboard**:
- Investigation provides detailed drill-down for dashboard metrics
- Use dashboard to identify time periods of interest
- Use Investigation to analyze specific prompts from those periods

**Prompt Analyzer**:
- Prompt Analyzer shows recent prompts (last 100)
- Investigation provides historical search (all prompts)
- Use both together for complete analysis workflow

**Configuration Management**:
- Investigation identifies problematic patterns
- Configuration allows tuning those patterns
- Iterative refinement: Investigate → Configure → Test → Repeat

**User Administration**:
- Track user who made configuration changes (via audit log)
- Correlate changes with prompt analysis results
- Ensure accountability for security policy decisions

### Troubleshooting

**No Results Found**

**Symptoms**: Search returns empty results

**Solutions**:
1. Verify date range includes expected data
2. Check if filters are too restrictive (clear and retry)
3. Verify ClickHouse contains data in selected time range:
   ```bash
   docker exec vigil-clickhouse clickhouse-client -q "SELECT count() FROM n8n_logs.events_processed WHERE timestamp >= '2025-10-01'"
   ```
4. Check text query spelling (search is case-insensitive but exact substring)
5. Try broader filters and narrow down incrementally

**Modal Shows Incomplete Data**

**Symptoms**: Some sections in modal are empty or show "N/A"

**Solutions**:
1. Verify the event was fully processed (check processing pipeline)
2. Some fields may be null for older events (database schema changes)
3. Prompt Guard data only present if integration is enabled
4. Check backend logs for JSON parsing errors

**Export Fails or Downloads Empty File**

**Symptoms**: Export button doesn't download file or file is empty

**Solutions**:
1. Verify results exist (check total count)
2. Check browser download settings (may be blocked)
3. Try smaller export (reduce date range or add filters)
4. Verify backend has write permissions
5. Check browser console for errors (F12)

**Slow Search Performance**

**Symptoms**: Search takes >5 seconds to complete

**Solutions**:
1. Reduce date range to smaller window (e.g., 7 days instead of 30)
2. Add specific filters to narrow results
3. Verify ClickHouse is healthy:
   ```bash
   docker exec vigil-clickhouse clickhouse-client -q "SELECT 1"
   ```
4. Check ClickHouse resource usage (may need scaling)
5. Consider archiving old data if database is very large

**Pagination Not Working**

**Symptoms**: Cannot navigate to next page or page jumps incorrectly

**Solutions**:
1. Verify total results count is greater than page size
2. Check browser console for JavaScript errors
3. Refresh page and retry search
4. Try reducing page size to 25 or 10
5. Clear browser cache and reload

---

## Prompt Analyzer

**Location**: Monitoring Dashboard → "Prompt Analyzer" section (below statistics)

The Prompt Analyzer provides detailed forensic analysis of security decisions for individual prompts.

### Overview

- **Purpose**: Inspect malicious prompts and understand detection logic
- **Data Source**: ClickHouse events_processed table
- **Update Frequency**: Real-time with monitoring dashboard refresh

### Interface Components

#### Time Range Selector

Synchronized with main dashboard time range (1h, 6h, 12h, 24h, 7d)

#### Prompt List Table

**Columns**:
- **Timestamp** - When the prompt was processed (formatted with user timezone)
- **Original Prompt** - Raw input text (first 100 characters)
- **Status** - Decision badge:
  - 🟢 ALLOWED
  - 🟡 SANITIZED_LIGHT
  - 🟠 SANITIZED_HEAVY
  - 🔴 BLOCKED
- **Maliciousness Score** - Numeric score with color coding
- **Actions** - "Analyze" button to view full details

**Sorting**: Most recent first (descending timestamp)

**Pagination**: First 100 results

#### Detailed Prompt Analysis Modal

**Opens when**: Click "Analyze" button on any prompt

**Sections**:

**1. Basic Information**
- Event ID (unique identifier)
- Processing timestamp
- Status decision with color-coded badge
- Overall maliciousness score

**2. Original Prompt**
- Full unmodified input text
- Preserved formatting and special characters
- Scrollable if lengthy

**3. Sanitized Output**
- Modified text (if sanitization applied)
- Shows redactions and modifications
- Empty if ALLOWED or BLOCKED

**4. Detection Analysis**

**Pattern Matches**
- List of triggered detection rules
- Pattern name and category
- Individual contribution scores
- Example:
  ```
  Pattern: system_prompt_override
  Category: prompt_injection
  Score: 85
  ```

**Score Breakdown**
- Base score from pattern matching
- Bloom filter contribution
- Correlation adjustments
- Final computed score

**Metadata**
- Processing time (milliseconds)
- Detection engine version
- Applied sanitization policy (if any)

### Use Cases

#### 1. False Positive Investigation

**Scenario**: Legitimate prompt was blocked

**Steps**:
1. Find blocked prompt in list
2. Click "Analyze" to view details
3. Review pattern matches - identify overly sensitive rule
4. Navigate to Configuration → Detection & Sensitivity
5. Adjust threshold or disable specific pattern

#### 2. Threat Pattern Analysis

**Scenario**: Multiple similar attacks detected

**Steps**:
1. Filter by time range when attacks occurred
2. Analyze several malicious prompts
3. Identify common patterns or categories
4. Update detection rules to strengthen defenses

#### 3. Sanitization Verification

**Scenario**: Verify content sanitization is working correctly

**Steps**:
1. Find SANITIZED prompts in list
2. Compare original vs. sanitized output
3. Verify sensitive data was properly redacted
4. Adjust sanitization policies if needed

### Integration with Configuration

Pattern names in analyzer link directly to configuration:
- Click pattern name → Navigate to relevant config section
- Modify threshold or policy
- Return to analyzer to verify changes

---

## Configuration Management

**Location**: Configuration menu (left sidebar)

**Required Permission**: `can_view_configuration`

Dynamic security policy management through web interface with real-time validation.

### Configuration Sections

#### Overview

**Purpose**: Quick access to critical settings

**Groups**:
- Test mode toggle
- Logging verbosity
- Block messages
- System-wide enable/disable switches

#### Detection & Sensitivity

**Purpose**: Configure threat detection thresholds and bloom filter

**Settings**:
- **Score Thresholds**:
  - ALLOW: 0-29 (default)
  - SANITIZE_LIGHT: 30-64
  - SANITIZE_HEAVY: 65-84
  - BLOCK: 85-100
- **Bloom Filter**:
  - Enabled/disabled
  - Hash functions (3-10, default: 7)
  - Filter size (bits)
- **Detection Algorithm**: Pattern matching, ML-based, hybrid

#### Performance & Limits

**Purpose**: Resource management and optimization

**Settings**:
- **Processing Timeouts**:
  - Analysis timeout (ms)
  - Sanitization timeout (ms)
- **Input Limits**:
  - Max prompt length
  - Max tokens
- **Caching**:
  - Cache TTL (seconds)
  - Cache size (entries)

#### Advanced Processing

**Purpose**: Text normalization and sanitization policies

**Settings**:
- **Normalization**:
  - Unicode normalization (NFKC)
  - Homoglyph detection
  - Leet speak decoding
  - Whitespace normalization
- **Sanitization Policies**:
  - Light: Minimal redaction
  - Heavy: Aggressive redaction
  - PII redaction patterns
- **N-gram Analysis**:
  - N-gram size (2-5)
  - Enable/disable n-gram scoring

### LLM Integration (Prompt Guard)

**Purpose**: External AI-powered detection with Meta's Llama Prompt Guard 2

**How it works**:
- Prompt Guard API analyzes input text for prompt injection attacks
- Returns confidence score (0.0 - 1.0)
- Score is integrated into final routing decision
- Works alongside deterministic pattern matching

**Configuration**:
- Enable/disable Prompt Guard validation
- Configure API endpoint and timeout
- Adjust score weight in final decision

**Note**: Risk level policies are fixed in the workflow logic and not user-configurable

### How to Modify Configuration

1. **Navigate** to Configuration → Select section
2. **Modify** values in input fields or dropdowns
3. **Save Changes** button becomes enabled
4. **Click Save** - Changes applied atomically
5. **Verify** success message
6. **Test** changes in Prompt Analyzer

### Configuration Validation

**Real-time Validation**:
- Field-level validation (type, range, format)
- Cross-field validation (threshold consistency)
- Visual indicators (✓ SECURE / ⚠ ALERT)

**Save-time Validation**:
- JSON syntax validation
- Schema compliance checks
- Dependency validation (e.g., thresholds must not overlap)

**Error Handling**:
- Detailed error messages
- Rollback on failure
- No partial updates (atomic operations)

### Configuration Backup

**Automatic Backup**:
- Created before every save
- Stored in `backend/*.json__*` format
- Maximum 2 backups per file (oldest auto-deleted)

**Manual Backup** (via File Manager):
- Download current configuration
- Store externally
- Upload to restore

### Configuration Version History & Rollback

**Location**: Configuration section → "Version History" button (bottom of left panel)

**Purpose**: Git-like version control for all configuration changes with single-click rollback capability

**How it works**:
- Every configuration save automatically creates a version entry
- Version history stored with timestamp, author (from JWT), and affected files
- Maximum 50 versions retained (oldest automatically pruned)
- Each version links to backup files for restore

**Version History Modal**:

**Displays**:
- **Tag** - Unique version identifier (format: `YYYYMMDD_HHMMSS-username`)
- **Timestamp** - When the change was made (formatted with your timezone)
- **Author** - Username who made the change
- **Files** - List of configuration files modified in that version
- **Actions** - "Rollback" button for each version

**How to Rollback**:

1. **Open Version History**:
   - Navigate to Configuration section
   - Click "Version History" button at bottom of left panel

2. **Select Version**:
   - Browse version list (newest first)
   - Review timestamp, author, and files changed
   - Click "Rollback" button on desired version

3. **Confirm Rollback**:
   - Confirmation dialog appears
   - Warning message explains impact
   - Click "Yes" to proceed or "Cancel" to abort

4. **Auto-Restore**:
   - System creates pre-rollback safety backup
   - Restores all files from selected version's backups
   - Success message displays briefly
   - Page auto-reloads to reflect changes

**Safety Features**:
- **Pre-rollback backup** - Current state saved before restore (just in case)
- **Atomic operations** - All files restored together or none at all
- **Audit trail** - Complete history of who changed what and when
- **Permission control** - Requires `can_view_configuration` permission
- **Automatic cleanup** - Old versions pruned to prevent disk space issues

**Use Cases**:

**Rollback after misconfiguration**:
1. Made change that caused issues
2. Open Version History
3. Find version before the problematic change
4. Click "Rollback"
5. System restored to working state

**Audit compliance**:
1. Review all configuration changes by date range
2. See who made each change
3. Track files modified in each version
4. Maintain accountability for security policies

**Experimentation**:
1. Try new detection thresholds
2. If false positive rate increases
3. Rollback to previous working configuration
4. No need to manually remember old values

**Best Practices**:
- Review version history periodically to understand configuration evolution
- Use meaningful usernames (avoid generic "admin" accounts)
- Test changes before committing to production
- Keep version history clean by avoiding unnecessary saves
- Document major changes in external changelog

---

### Data Retention Policy

**Location**: Configuration → System → Data Retention

**Required Permission**: `can_view_configuration`

**Purpose**: Manage automatic data lifecycle policies to prevent unbounded disk usage growth

**Overview**:

Data Retention Policy provides centralized management of ClickHouse TTL (Time To Live) settings for automatic cleanup of old event logs. The interface displays real-time disk usage, allows TTL configuration, and provides force cleanup controls.

**Key Features**:

1. **System Disk Usage Dashboard**
   - Total/Used/Free space metrics
   - Visual progress bar with color-coded thresholds:
     - Green: < Warning threshold (default 80%)
     - Yellow: Warning threshold to Critical threshold (80-90%)
     - Red: > Critical threshold (90%)
   - Real-time usage percentage

2. **Table Statistics**
   - Per-table metrics for `events_raw` and `events_processed`
   - Row count, disk size, compressed size
   - Compression ratio (shows data efficiency)
   - Partition count and date ranges
   - Oldest and newest records

3. **TTL Configuration**
   - **events_raw**: Debug data with default 90-day retention
   - **events_processed**: Full analysis data with default 365-day retention
   - Configurable range: 1-3650 days
   - Warning threshold: 1-100% (default 80%)
   - Critical threshold: 1-100% (default 90%)
   - Audit trail shows last modifier and timestamp

4. **Force Cleanup Controls**
   - Execute `OPTIMIZE TABLE FINAL` to immediately delete expired data
   - Available per-table or for all tables
   - Useful after TTL policy changes
   - Confirmation dialog prevents accidental execution

**How to Configure Retention Policy**:

1. **Navigate to Retention Settings**:
   - Go to Configuration section
   - Scroll to "System" section in left panel
   - Click "Data Retention"

2. **Review Current Disk Usage**:
   - Check system disk usage percentage
   - Review per-table statistics
   - Identify tables consuming most space

3. **Adjust TTL Settings**:
   - Modify "Events Raw TTL (days)" for debug data
   - Modify "Events Processed TTL (days)" for analysis data
   - Adjust warning/critical thresholds if needed

4. **Save Changes**:
   - Click "Save Changes" button
   - System automatically applies TTL to ClickHouse tables
   - Confirmation message displays success
   - Audit trail updated with your username

5. **Force Cleanup (Optional)**:
   - Click "Force Cleanup" for specific table or "All Tables"
   - Confirm action in dialog
   - Wait for cleanup to complete
   - Refresh to see updated disk usage

**Default Retention Periods**:

| Table | Default TTL | Purpose | Est. Size @ 5K prompts/day |
|-------|-------------|---------|---------------------------|
| events_raw | 90 days | Debug data, raw webhook inputs | 0.9-1.8 GB |
| events_processed | 365 days | Full analysis data | 9-18 GB |

**Best Practices**:

- **Monitor disk usage regularly** - Check dashboard at least weekly
- **Set appropriate retention periods** - Balance compliance needs with disk space
- **Plan for growth** - Calculate expected data volume based on prompt volume
- **Test changes in non-production** - Verify TTL changes before production deployment
- **Backup before major changes** - Create database backup before changing retention policies
- **Use force cleanup after TTL changes** - Immediately reclaim disk space after reducing retention periods

**Troubleshooting**:

**Issue**: Disk usage not decreasing after TTL change
- **Solution**: Click "Force Cleanup" to trigger immediate deletion. TTL normally runs hourly during background merges.

**Issue**: Changes not saving
- **Solution**: Verify you have `can_view_configuration` permission. Check browser console for errors.

**Issue**: Partition count very high
- **Solution**: Consider increasing TTL to allow more data aggregation, or use force cleanup to drop old partitions.

📖 **Detailed documentation**: See [CLICKHOUSE_RETENTION.md](CLICKHOUSE_RETENTION.md) for technical details, architecture, and advanced operations.

---

## File Manager

**Location**: Configuration → File Manager

**Required Permission**: `can_view_configuration`

Direct configuration file editing with comprehensive audit logging.

### Overview

The File Manager allows administrators to:
- Download current configuration files
- Upload modified configuration files
- View complete audit log of all file operations

### Managed Configuration Files

#### 1. unified_config.json
- **Size**: ~4.5 KB
- **Contains**: Main configuration with detection settings, bloom filter, sanitization policies, normalization settings, Prompt Guard integration
- **Use Case**: Primary configuration file for system-wide settings

#### 2. thresholds.config.json
- **Size**: ~445 bytes
- **Contains**: Score thresholds for ALLOW, SANITIZE_LIGHT, SANITIZE_HEAVY, and BLOCK decisions
- **Format**:
  ```json
  {
    "allow": { "min": 0, "max": 29 },
    "sanitize_light": { "min": 30, "max": 64 },
    "sanitize_heavy": { "min": 65, "max": 84 },
    "block": { "min": 85, "max": 100 }
  }
  ```

#### 3. rules.config.json
- **Size**: ~27 KB
- **Contains**: Detection rules and pattern matching definitions for all threat categories
- **Use Case**: Add custom detection patterns or modify existing rules

#### 4. normalize.conf
- **Size**: ~4.2 KB
- **Format**: INI-style configuration
- **Contains**: Character normalization rules including homoglyph mappings and leet speak conversions
- **Use Case**: Extend normalization to handle new obfuscation techniques

#### 5. pii.conf
- **Size**: ~2.4 KB
- **Format**: INI-style configuration
- **Contains**: PII redaction patterns (email, phone, credit card, SSN, addresses)
- **Use Case**: Add organization-specific PII patterns

#### 6. allowlist.schema.json
- **Size**: ~1.1 KB
- **Contains**: JSON Schema for allowlist validation and structure definition
- **Use Case**: Define allowlist structure and validation rules

### Using the File Manager

#### Downloading Files

1. **Locate the file** in the file list
2. **Click "Download" button** (blue button on the right)
3. **File downloads** to your browser's default location
4. **Edit locally** using your preferred text editor
5. **Validate syntax**:
   - JSON files: Use JSON validator
   - CONF files: Check INI syntax

#### Uploading Files

1. **Click "Upload New" button** (green button next to Download)
2. **File picker opens** - select your modified file
3. **Filename validation** - File must match expected name exactly
   - ✅ Correct: `unified_config.json` → `unified_config.json`
   - ❌ Incorrect: `unified_config.json` → `my_config.json`
4. **Upload progress indicator** appears
5. **Success message** confirms upload
6. **Audit log** automatically updated with entry

**Security Features**:
- **Filename validation**: Prevents uploading wrong file to wrong slot
- **Dual validation**: Frontend + backend filename checks
- **User tracking**: Every upload tagged with username
- **Audit logging**: Immutable log of all operations

#### Viewing Audit Log

**Location**: Bottom of File Manager page

**Purpose**: Complete history of all file operations

**Log Entry Format**:
```
[ISO-8601-Timestamp] User: username | Action: FILE_UPLOAD | File: filename | Size: bytes
```

**Example**:
```
[2025-10-08T09:15:23.456Z] Audit log initialized
[2025-10-08T09:30:45.123Z] User: admin | Action: FILE_UPLOAD | File: unified_config.json | Size: 4523 bytes
[2025-10-08T09:45:12.789Z] User: security_admin | Action: FILE_UPLOAD | File: thresholds.config.json | Size: 445 bytes
```

**Features**:
- Scrollable window (300-500px height)
- Monospace font for readability
- Full-width layout
- Manual refresh button

**Audit Log Properties**:
- **Append-only**: Cannot be modified or deleted
- **Complete history**: All operations since initialization
- **User attribution**: Every operation linked to username
- **File integrity**: Immutable audit trail

### Best Practices

#### Before Uploading

1. **Backup current file**:
   - Download current version
   - Store externally with timestamp
   - Keep multiple versions

2. **Validate changes**:
   - JSON syntax validation for `.json` files
   - Test locally if possible
   - Review diff against original

3. **Review impact**:
   - Understand what will change
   - Consider dependencies
   - Plan rollback strategy

#### After Uploading

1. **Verify upload**:
   - Check success message
   - Review audit log entry
   - Download file again to confirm changes

2. **Test configuration**:
   - Monitor system behavior in Monitoring dashboard
   - Check for errors in backend logs
   - Verify detection rules working correctly

3. **Rollback if needed**:
   - Keep previous version ready
   - Upload old version if issues occur
   - Check audit log for history

### Troubleshooting

#### Upload Fails

**Error**: "Failed to upload file"

**Solutions**:
1. Verify file format (`.json` or `.conf`)
2. Validate JSON syntax using validator
3. Check file permissions on server
4. Review backend logs:
   ```bash
   docker logs vigil-web-ui-backend --tail 50 | grep -i error
   ```

#### Filename Mismatch Error

**Error**: "Filename mismatch: expected 'X' but got 'Y'"

**Solution**: Select the correct file that matches the expected name exactly

#### Audit Log Not Updating

**Error**: Audit log doesn't show recent upload

**Solutions**:
1. Click "Refresh" button
2. Check `TARGET_DIR` environment variable
3. Verify write permissions on `audit.log` file

---

## User Administration

**Location**: Administration menu (left sidebar)

**Required Permission**: `can_manage_users`

**Purpose**: Create, edit, and manage user accounts with role-based access control.

### User List

**Displays**:
- Username
- Email address
- Role (admin, user)
- Active status (✓ Active / ✗ Inactive)
- Permissions badges
- Last login timestamp
- Actions (Edit, Delete, Toggle Active)

### Creating Users

1. **Click "Create New User" button**
2. **Fill in form**:
   - Username (required, unique)
   - Email (required, valid email format)
   - Password (required, minimum 8 characters)
   - Confirm Password (must match)
   - Role selection (admin/user)
3. **Set permissions**:
   - ☑ Can view monitoring
   - ☑ Can view configuration
   - ☑ Can manage users
4. **Optional settings**:
   - Force password change on next login
   - Account active status
   - Timezone preference
5. **Click "Create User"**

### Editing Users

1. **Click "Edit" button** on user row
2. **Modify fields** (password optional if not changing)
3. **Update permissions** as needed
4. **Save changes**

### User Actions

**Toggle Active/Inactive**
- Disable user access without deleting account
- Can be re-enabled later
- Inactive users cannot log in

**Force Password Change**
- Requires user to change password on next login
- Use for security compliance or suspected compromise

**Delete User**
- Permanently removes user account
- Cannot be undone
- **Last Admin Protection**: Cannot delete last user with `can_manage_users` permission

### Permission Matrix

| Permission | Monitoring | Configuration | File Manager | User Admin | Settings |
|-----------|-----------|---------------|-------------|-----------|----------|
| `can_view_monitoring` | ✓ | ✗ | ✗ | ✗ | ✓ |
| `can_view_configuration` | ✓ | ✓ | ✓ | ✗ | ✓ |
| `can_manage_users` | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Settings & Preferences

**Location**: Settings menu (left sidebar)

**Available to**: All authenticated users

### User Information

**Displays**:
- Username
- Email address
- Role
- Permissions (read-only)

### Timezone Preference

**Purpose**: Display timestamps in your local timezone

**Options**: All IANA timezone identifiers (e.g., `America/New_York`, `Europe/London`, `UTC`)

**Impact**:
- Prompt Analyzer timestamps
- Audit log timestamps
- Grafana dashboard times

**How to change**:
1. Select timezone from dropdown
2. Click "Save Settings"
3. Refresh page to apply

### Password Change

**Requirements**:
- Current password (for verification)
- New password (minimum 8 characters)
- Confirm new password (must match)

**Security Features**:
- Bcrypt hashing (12 rounds)
- Current password verification
- Password strength validation

**Steps**:
1. Click "Change Password" button
2. Enter current password
3. Enter new password twice
4. Click "Update Password"
5. Success message confirms change

### Logout

**Location**: Top-right user dropdown

**Effect**:
- Invalidates JWT token
- Clears localStorage
- Redirects to login page

---

## Best Practices

### Security Operations

1. **Regular Monitoring**
   - Check dashboard at least daily
   - Set auto-refresh to 30 seconds during active monitoring
   - Investigate block rate spikes immediately

2. **Threshold Tuning**
   - Start conservative (lower thresholds)
   - Monitor false positive rate
   - Gradually adjust based on data
   - Use Prompt Analyzer to validate changes

3. **Configuration Management**
   - Always backup before changes
   - Test changes in non-production first
   - Document modifications in changelog
   - Use File Manager audit log for accountability

4. **User Management**
   - Apply principle of least privilege
   - Regular access reviews (quarterly)
   - Disable inactive accounts
   - Force password changes every 90 days

### Performance Optimization

1. **Dashboard Refresh**
   - Use 30s refresh for active monitoring
   - Use 5m refresh for background monitoring
   - Disable auto-refresh when not actively viewing

2. **Grafana Panels**
   - Limit time range to relevant period
   - Avoid loading 7-day data unnecessarily
   - Use "Refresh Now" sparingly

3. **Configuration Changes**
   - Batch related changes together
   - Avoid frequent small modifications
   - Monitor system impact after changes

### Incident Response

**High Block Rate Detected (>15%)**

1. **Identify**: Check TOP-10 Detection Categories
2. **Analyze**: Use Prompt Analyzer for sample prompts
3. **Determine**: Attack pattern or misconfiguration?
4. **Respond**:
   - Attack: Tighten thresholds temporarily
   - Misconfiguration: Adjust detection rules
5. **Monitor**: Watch block rate for 1 hour
6. **Document**: Log incident and response

**False Positives**

1. **Verify**: Confirm prompt is legitimate
2. **Analyze**: Identify triggering pattern
3. **Adjust**: Modify threshold or disable pattern
4. **Test**: Verify fix with similar prompts
5. **Monitor**: Check for unintended side effects

**Prompt Guard Down**

1. **Check**: Verify container status
   ```bash
   docker ps | grep prompt-guard
   ```
2. **Logs**: Review error messages
   ```bash
   docker logs vigil-prompt-guard-api --tail 50
   ```
3. **Restart**: If needed
   ```bash
   docker restart vigil-prompt-guard-api
   ```
4. **Verify**: Check health endpoint
   ```bash
   curl http://localhost:8000/health
   ```

---

## Troubleshooting

### Common Issues

#### Cannot Login

**Symptoms**: Invalid credentials error

**Solutions**:
1. Verify username and password
2. Check if account is active (admin must verify)
3. Try default admin credentials: `admin / admin123`
4. Check backend logs for authentication errors
5. Verify JWT token configuration

#### Grafana Panels Not Loading

**Symptoms**: Empty panels or loading errors

**Solutions**:
1. Verify Grafana is running:
   ```bash
   docker ps | grep grafana
   curl -I http://localhost:3001/api/health
   ```
2. Check iframe embedding is enabled in Grafana settings
3. Verify dashboard exists and is accessible
4. Review browser console for CORS errors
5. Restart Grafana container if needed

#### Configuration Changes Not Applying

**Symptoms**: Changes saved but not reflected in system

**Solutions**:
1. Verify success message appeared
2. Check file permissions on configuration files
3. Restart backend to reload configuration
4. Verify no conflicting File Manager uploads
5. Check audit log for operation confirmation

#### Prompt Analyzer Shows No Data

**Symptoms**: Empty prompt list

**Solutions**:
1. Verify ClickHouse is running and accessible
2. Check if any prompts were processed in selected time range
3. Review ClickHouse connection settings
4. Verify database contains data:
   ```bash
   docker exec vigil-clickhouse clickhouse-client -q "SELECT count() FROM n8n_logs.events_processed"
   ```
5. Check backend logs for database errors

#### File Upload Fails

**Symptoms**: Upload error message

**Solutions**:
1. Verify filename matches exactly
2. Validate JSON syntax for `.json` files
3. Check file size is reasonable (<10MB)
4. Verify you have `can_view_configuration` permission
5. Review backend logs for detailed error

#### Prompt Guard Shows "Down"

**Symptoms**: Red "✗ Down" status in dashboard

**Solutions**:
1. Verify model is downloaded and mounted:
   ```bash
   ls -la ../vigil-llm-models/Llama-Prompt-Guard-2-86M/
   ```
2. Check Prompt Guard API container:
   ```bash
   docker logs vigil-prompt-guard-api --tail 50
   ```
3. Test health endpoint:
   ```bash
   curl http://localhost:8000/health
   ```
4. Restart Prompt Guard API:
   ```bash
   docker restart vigil-prompt-guard-api
   ```
5. Verify model files are correct (see `prompt-guard-api/README.md`)

### Getting Help

**Documentation**:
- [Installation Guide](INSTALLATION.md)
- [Configuration Reference](CONFIGURATION.md)
- [Authentication & Users](AUTHENTICATION.md)
- [API Documentation](API.md)
- [Grafana Setup](GRAFANA_SETUP.md)

**Logs**:
- Backend: `docker logs vigil-web-ui-backend`
- Frontend: Browser Developer Console (F12)
- ClickHouse: `docker logs vigil-clickhouse`
- Grafana: `docker logs vigil-grafana`

**Support**:
- GitHub Issues: https://github.com/tbartel74/Vigil-Guard/issues
- Security Issues: security@your-organization.com

---

## Appendix

### Keyboard Shortcuts

- `Ctrl+R` / `Cmd+R` - Refresh current page
- `F5` - Hard refresh (clear cache)
- `F12` - Open browser developer console

### URL Structure

- `/ui` - Main application (redirects to /ui/login if not authenticated)
- `/ui/login` - Login page
- `/ui/` - Monitoring dashboard (default after login)
- `/ui/config` - Configuration sections
- `/ui/config/overview` - Configuration overview
- `/ui/config/detection` - Detection & sensitivity settings
- `/ui/config/performance` - Performance & limits
- `/ui/config/advanced` - Advanced processing
- `/ui/config/file-manager` - File Manager
- `/ui/administration` - User management
- `/ui/settings` - User settings

### Default Ports

- `80` - Caddy reverse proxy (main entry point)
- `3001` - Grafana dashboard
- `5173` - Frontend (development only)
- `8000` - Prompt Guard API
- `8123` - ClickHouse HTTP
- `8787` - Backend API (development only)

### Environment Variables

Key environment variables (see `docker-compose.yml`):

- `TARGET_DIR` - Configuration files location
- `CLICKHOUSE_HOST` - ClickHouse hostname
- `CLICKHOUSE_DATABASE` - Database name (default: `n8n_logs`)
- `PROMPT_GUARD_URL` - Prompt Guard API URL

---

**Last Updated**: October 2025
**Version**: 1.3.0
**Built with Llama** - Powered by Meta's Llama Prompt Guard 2
