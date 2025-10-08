# Vigil Guard - User Guide

**Complete guide to using the Vigil Guard Web UI for security monitoring, threat analysis, and configuration management.**

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Monitoring Dashboard](#monitoring-dashboard)
4. [Prompt Analyzer](#prompt-analyzer)
5. [Configuration Management](#configuration-management)
6. [File Manager](#file-manager)
7. [User Administration](#user-administration)
8. [Settings & Preferences](#settings--preferences)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Vigil Guard Web UI provides a comprehensive interface for:

- **Real-time Monitoring** - Live security metrics and threat detection analytics
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
- GitHub Issues: https://github.com/your-org/vigil-guard/issues
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
**Version**: 1.0.0
**Built with Llama** - Powered by Meta's Llama Prompt Guard 2
