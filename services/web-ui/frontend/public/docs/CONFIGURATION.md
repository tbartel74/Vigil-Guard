# Configuration Reference

> **Comprehensive guide to configuring Vigil Guard security variables and system settings**

## 📋 Overview

This guide covers all configuration variables available in the Vigil Guard system, their purposes, valid values, and integration with the n8n workflow. The system manages 27 active security variables across different categories.

## 🎯 Configuration Categories

### Risk Level Categories

The system uses four risk levels for threat classification:

| Level | Purpose | Typical Threshold | Action |
|-------|---------|------------------|---------|
| **CRITICAL** | Immediate threats | 85-100 | Block immediately |
| **HIGH** | Serious threats | 65-84 | Block or sanitize |
| **MEDIUM** | Moderate threats | 30-64 | Sanitize or allow |
| **LOW** | Minor threats | 0-29 | Allow with logging |

## ⚙️ Active Configuration Variables

Vigil Guard configuration is split across two main files: **thresholds.config.json** (decision ranges) and **unified_config.json** (system settings). All variables are manageable through the Web UI Configuration section.

### Threshold Ranges (thresholds.config.json)

The system uses score-based decision making on a **0-100 scale**. Based on the total threat score, the system determines the appropriate action.

#### `ranges.allow.min` / `ranges.allow.max`
- **Type**: `number`
- **Range**: `0 - 29`
- **Default**: `{ "min": 0, "max": 29 }`
- **Purpose**: Score range for ALLOW decision (content passes through unchanged)
- **File**: `thresholds.config.json`
- **UI Name**: ALLOW_MIN / ALLOW_MAX
- **Action**: Content is allowed with logging

#### `ranges.sanitize_light.min` / `ranges.sanitize_light.max`
- **Type**: `number`
- **Range**: `30 - 64`
- **Default**: `{ "min": 30, "max": 64 }`
- **Purpose**: Score range for light sanitization (remove suspicious patterns)
- **File**: `thresholds.config.json`
- **UI Name**: SANITIZE_LIGHT_MIN / SANITIZE_LIGHT_MAX
- **Action**: Remove jailbreak phrases, normalize text

#### `ranges.sanitize_heavy.min` / `ranges.sanitize_heavy.max`
- **Type**: `number`
- **Range**: `65 - 84`
- **Default**: `{ "min": 65, "max": 84 }`
- **Purpose**: Score range for heavy sanitization (aggressive pattern removal)
- **File**: `thresholds.config.json`
- **UI Name**: SANITIZE_HEAVY_MIN / SANITIZE_HEAVY_MAX
- **Action**: Strip URLs, code blocks, instruction-like patterns

#### `ranges.block.min` / `ranges.block.max`
- **Type**: `number`
- **Range**: `85 - 100`
- **Default**: `{ "min": 85, "max": 100 }`
- **Purpose**: Score range for immediate blocking
- **File**: `thresholds.config.json`
- **UI Name**: BLOCK_MIN / BLOCK_MAX
- **Action**: Reject request with block message

### Bloom Filter & Prefiltering (unified_config.json)

#### `bloom_decisions.route_to_ac_threshold`
- **Type**: `number`
- **Default**: `15`
- **Purpose**: Bloom filter score threshold to trigger full Aho-Corasick pattern matching
- **File**: `unified_config.json`
- **Path**: `bloom_decisions.route_to_ac_threshold`
- **Usage**: If bloom score ≥ 15, route to full pattern matching engine

#### `bloom_decisions.hard_block_threshold`
- **Type**: `number`
- **Default**: `50`
- **Purpose**: Bloom filter score for immediate blocking without further analysis
- **File**: `unified_config.json`
- **Path**: `bloom_decisions.hard_block_threshold`

#### `bloom_decisions.phrase_match_bonus`
- **Type**: `number`
- **Default**: `20`
- **Purpose**: Bonus points added per matched dangerous phrase in bloom filter
- **File**: `unified_config.json`
- **Path**: `bloom_decisions.phrase_match_bonus`

#### `bloom_decisions.require_zusatz_signals`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Require additional signals (obfuscation, polyglot) before hard block
- **File**: `unified_config.json`
- **Path**: `bloom_decisions.require_zusatz_signals`

### Normalization Settings (unified_config.json)

#### `normalization.unicode_form`
- **Type**: `string`
- **Values**: `NFKC`, `NFC`, `NFD`, `NFKD`
- **Default**: `NFKC`
- **Purpose**: Unicode normalization form (NFKC recommended for security)
- **File**: `unified_config.json`
- **Path**: `normalization.unicode_form`

#### `normalization.max_iterations`
- **Type**: `number`
- **Default**: `3`
- **Purpose**: Maximum normalization passes to detect nested obfuscation
- **File**: `unified_config.json`
- **Path**: `normalization.max_iterations`

#### `normalization.remove_zero_width`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Remove zero-width characters (U+200B, U+200C, U+200D, U+FEFF)
- **File**: `unified_config.json`
- **Path**: `normalization.remove_zero_width`

#### `normalization.collapse_whitespace`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Collapse multiple whitespace characters to single space
- **File**: `unified_config.json`
- **Path**: `normalization.collapse_whitespace`

### Sanitization Policies (unified_config.json)

#### `sanitization.light.remove_patterns`
- **Type**: `array<string>` (regex patterns)
- **Default**: 16 jailbreak patterns (see unified_config.json)
- **Purpose**: Regex patterns removed during light sanitization
- **File**: `unified_config.json`
- **Path**: `sanitization.light.remove_patterns`
- **Examples**: `\bdo\s+not\s+refuse\b`, `\bgodmode\b`

#### `sanitization.light.redact_token`
- **Type**: `string`
- **Default**: `[removed]`
- **Purpose**: Replacement token for removed patterns (light mode)
- **File**: `unified_config.json`
- **Path**: `sanitization.light.redact_token`

#### `sanitization.heavy.remove_patterns`
- **Type**: `array<string>` (regex patterns)
- **Default**: 18 instruction/override patterns
- **Purpose**: Regex patterns removed during heavy sanitization
- **File**: `unified_config.json`
- **Path**: `sanitization.heavy.remove_patterns`
- **Examples**: `\bignore.*?instructions\b`, `\byou\s+are\s+now.*?\b`

#### `sanitization.heavy.redact_token`
- **Type**: `string`
- **Default**: `[REDACTED]`
- **Purpose**: Replacement token for removed patterns (heavy mode)
- **File**: `unified_config.json`
- **Path**: `sanitization.heavy.redact_token`

#### `sanitization.heavy.max_removal_percent`
- **Type**: `number`
- **Default**: `60`
- **Purpose**: Maximum percentage of content that can be removed (prevent over-sanitization)
- **File**: `unified_config.json`
- **Path**: `sanitization.heavy.max_removal_percent`

### Enforcement & Logging (unified_config.json)

#### `enforcement.dry_run`
- **Type**: `boolean`
- **Default**: `false`
- **Purpose**: If true, log decisions but don't block/sanitize (testing mode)
- **File**: `unified_config.json`
- **Path**: `enforcement.dry_run`

#### `enforcement.audit_log`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Enable audit logging to ClickHouse
- **File**: `unified_config.json`
- **Path**: `enforcement.audit_log`

#### `enforcement.block_message`
- **Type**: `string`
- **Default**: `"Content blocked by security policy. Please rephrase without instructing how to respond."`
- **Purpose**: User-facing message when content is blocked
- **File**: `unified_config.json`
- **Path**: `enforcement.block_message`

### Performance Settings (unified_config.json)

#### `performance.timeout_ms`
- **Type**: `number`
- **Default**: `5000`
- **Purpose**: Processing timeout in milliseconds
- **File**: `unified_config.json`
- **Path**: `performance.timeout_ms`

#### `performance.max_input_length`
- **Type**: `number`
- **Default**: `10000`
- **Purpose**: Maximum input length in characters
- **File**: `unified_config.json`
- **Path**: `performance.max_input_length`

#### `performance.cache_ttl_ms`
- **Type**: `number`
- **Default**: `60000`
- **Purpose**: Cache time-to-live in milliseconds
- **File**: `unified_config.json`
- **Path**: `performance.cache_ttl_ms`

### Bloom Filter Technical Parameters (unified_config.json)

#### `bloom.m`
- **Type**: `number`
- **Default**: `32768`
- **Purpose**: Bloom filter bit array size
- **File**: `unified_config.json`
- **Path**: `bloom.m`

#### `bloom.k`
- **Type**: `number`
- **Default**: `5`
- **Purpose**: Number of hash functions
- **File**: `unified_config.json`
- **Path**: `bloom.k`

#### `bloom.seed`
- **Type**: `number`
- **Default**: `1337`
- **Purpose**: Hash function seed for reproducibility
- **File**: `unified_config.json`
- **Path**: `bloom.seed`

## 📁 Configuration File Structure

### Backend Configuration Files

### Actual Configuration Files

Vigil Guard stores configuration in the `services/workflow/config/` directory:

#### `services/workflow/config/thresholds.config.json`

**Purpose**: Defines decision thresholds for threat classification.

```json
{
  "version": "1.0",
  "ranges": {
    "allow": {
      "min": 0,
      "max": 29
    },
    "sanitize_light": {
      "min": 30,
      "max": 64
    },
    "sanitize_heavy": {
      "min": 65,
      "max": 84
    },
    "block": {
      "min": 85,
      "max": 100
    }
  },
  "notes": "Adjusted thresholds: light sanitize up to 64, heavy sanitize 65-84, block starts at 85. These are conservative to reduce false positives on normal chat."
}
```

**Scale**: Integer values from **0 to 100**

**Mapping to UI**:
| UI Variable | Maps to | Description |
|-------------|---------|-------------|
| ALLOW_MAX | `ranges.allow.max` | Maximum score for ALLOW decision (29) |
| SANITIZE_LIGHT_MIN | `ranges.sanitize_light.min` | Light sanitization starts (30) |
| SANITIZE_LIGHT_MAX | `ranges.sanitize_light.max` | Light sanitization ends (64) |
| SANITIZE_HEAVY_MIN | `ranges.sanitize_heavy.min` | Heavy sanitization starts (65) |
| SANITIZE_HEAVY_MAX | `ranges.sanitize_heavy.max` | Heavy sanitization ends (84) |
| BLOCK_MIN | `ranges.block.min` | BLOCK decision starts (85) |

#### `services/workflow/config/unified_config.json`

**Purpose**: Main configuration file for n8n workflow settings.

```json
{
  "test_mode": false,
  "normalization": {
    "enabled": true,
    "unicode_nfkc": true,
    "homoglyphs": true
  },
  "bloom_filter": {
    "enabled": true,
    "phrase_match_bonus": 20,
    "route_to_ac_threshold": 15
  },
  "sanitization": {
    "light": {
      "remove_unicode_control": true,
      "remove_excessive_whitespace": true
    },
    "heavy": {
      "strip_urls": true,
      "strip_code_blocks": true,
      "aggressive_filtering": true
    }
  }
}
```

**Key Settings**:
- `bloom_filter.phrase_match_bonus`: Score added per matched malicious phrase (default: 20)
- `bloom_filter.route_to_ac_threshold`: Threshold to trigger full pattern matching (default: 15)
- All thresholds work on **0-100 scale**

#### Other Configuration Files

| File | Purpose | Format |
|------|---------|--------|
| `rules.config.json` | Detection patterns and categories | JSON |
| `allowlist.schema.json` | Allowed content schema | JSON Schema |
| `normalize.conf` | Homoglyph and leet speak mappings | KEY=VALUE |
| `pii.conf` | PII redaction patterns | SECTION/KEY |

## 🔄 Configuration Management

### ETag-Based Concurrency Control

The system uses ETags to prevent configuration conflicts:

```bash
# Get current configuration with ETag
curl -I http://localhost:8787/api/config
# Returns: ETag: "1a2b3c4d5e6f"

# Update configuration with ETag validation
curl -X POST http://localhost:8787/api/config \
  -H "Content-Type: application/json" \
  -H 'If-Match: "1a2b3c4d5e6f"' \
  -d '{"CRITICAL_THRESHOLD": 0.90}'
```

### Backup Rotation

Configuration changes trigger automatic backups:

```bash
# Original file
backend/config/risk_config.json

# Backup files (max 2 retained)
backend/config/risk_config.json__2024-01-15T10-30-45-123Z
backend/config/risk_config.json__2024-01-15T09-15-30-456Z
```

### Atomic Updates

All configuration changes are atomic:
1. Validate new configuration
2. Create backup of current configuration
3. Write new configuration to temporary file
4. Atomically move temporary file to final location
5. Update audit log
6. Clean up old backups

## 🔍 Configuration Validation

### Value Validation Rules

#### Numeric Values
```javascript
// Threshold validation (0-100 scale)
if (value < 0 || value > 100) {
  throw new Error('Threshold must be between 0 and 100');
}

// Timeout validation
if (value < 1000 || value > 30000) {
  throw new Error('Timeout must be between 1000 and 30000 ms');
}
```

#### String Values
```javascript
// Enum validation
const validActions = ['BLOCK', 'SANITIZE', 'ALLOW'];
if (!validActions.includes(value)) {
  throw new Error(`Action must be one of: ${validActions.join(', ')}`);
}

// Log level validation
const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
if (!validLogLevels.includes(value)) {
  throw new Error(`Log level must be one of: ${validLogLevels.join(', ')}`);
}
```

#### Array Values
```javascript
// IP address validation
const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
if (!value.every(ip => ipPattern.test(ip))) {
  throw new Error('All IPs must be valid IPv4 addresses');
}
```

### Cross-Variable Validation

```javascript
// Threshold range ordering validation
const thresholds = config.ranges;

if (thresholds.allow.max >= thresholds.sanitize_light.min) {
  throw new Error('ALLOW range must not overlap with SANITIZE_LIGHT range');
}

if (thresholds.sanitize_light.max >= thresholds.sanitize_heavy.min) {
  throw new Error('SANITIZE_LIGHT range must not overlap with SANITIZE_HEAVY range');
}

if (thresholds.sanitize_heavy.max >= thresholds.block.min) {
  throw new Error('SANITIZE_HEAVY range must not overlap with BLOCK range');
}

// Ensure min < max within each range
if (thresholds.allow.min > thresholds.allow.max) {
  throw new Error('ALLOW min must be less than ALLOW max');
}
```

## 🔧 API Configuration Endpoints

### GET /api/files

Returns list of available configuration files with filtering options.

**Authentication**: Required (`can_view_configuration` permission)

**Query Parameters:**
- `ext`: Filter by extension (`all`, `json`, `conf`)

**Response:**
```json
{
  "files": [
    "unified_config.json",
    "thresholds.config.json",
    "rules.config.json",
    "normalize.conf",
    "pii.conf"
  ]
}
```

### GET /api/parse/:name

Parses and returns configuration file content with ETag.

**Authentication**: Required (`can_view_configuration` permission)

**Parameters:**
- `name`: Configuration filename

**Response:**
```json
{
  "file": "thresholds.config.json",
  "content": {...},
  "etag": "a1b2c3d4"
}
```

### POST /api/resolve

Maps variable specifications to actual file values.

**Authentication**: Required (`can_view_configuration` permission)

**Request:**
```json
{
  "variables": [
    {
      "name": "ALLOW_MAX",
      "path": "ranges.allow.max",
      "file": "thresholds.config.json"
    }
  ]
}
```

**Response:**
```json
{
  "ALLOW_MAX": 29
}
```

### POST /api/save

Saves configuration changes with ETag validation.

**Authentication**: Required (`can_view_configuration` permission)

**Request:**
```json
{
  "changes": [
    {
      "file": "thresholds.config.json",
      "payloadType": "json",
      "updates": [
        {
          "path": "ranges.allow.max",
          "value": 35
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "results": [
      {
        "file": "thresholds.config.json",
        "backupPath": "thresholds.config__20251018_143022__admin.json.bak",
        "etag": "new_etag_value"
      }
    ]
  }
}
```

## 🔒 Security Considerations

### Access Control

Configuration changes should be restricted:

```javascript
// Middleware for configuration endpoints
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization;
  if (!isValidToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use('/api/config', requireAuth);
```

### Input Sanitization

All configuration values are sanitized:

```javascript
const sanitizeValue = (value, type) => {
  switch (type) {
    case 'number':
      return parseFloat(value);
    case 'boolean':
      return Boolean(value);
    case 'string':
      return String(value).trim();
    default:
      throw new Error(`Unknown type: ${type}`);
  }
};
```

### Audit Trail

All changes are logged with:
- Timestamp
- User identification
- Old and new values
- Change reason (if provided)
- Source IP address

## 📊 Performance Impact

### Configuration Change Impact

| Change Type | Impact Level | Restart Required |
|-------------|--------------|------------------|
| Threshold values | Low | No |
| Log levels | Low | No |
| System toggles | Medium | No |
| Cache settings | Medium | Recommended |
| Database settings | High | Yes |
| Network settings | High | Yes |

### Monitoring Configuration Performance

```bash
# Check configuration load time
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8787/api/config

# Monitor configuration file size
ls -lh backend/config/*.json

# Check backup count
ls -la backend/config/*.json__* | wc -l
```

## 🚨 Troubleshooting

### Common Configuration Issues

#### 1. Invalid Threshold Ordering

**Error**: "HIGH_THRESHOLD must be less than CRITICAL_THRESHOLD"
**Solution**: Ensure thresholds are ordered: LOW < MEDIUM < HIGH < CRITICAL

#### 2. ETag Mismatch

**Error**: "Configuration modified by another user"
**Solution**: Refresh page and retry the change

#### 3. File Permission Issues

**Error**: "Unable to write configuration file"
**Solution**: Check file permissions and disk space

```bash
# Fix permissions
chmod 644 backend/config/*.json
chown user:group backend/config/*.json

# Check disk space
df -h
```

### Debug Configuration

Enable debug logging to troubleshoot configuration issues:

```json
{
  "LOG_LEVEL": "DEBUG",
  "ENABLE_CONFIG_DEBUG": true,
  "CONFIG_VALIDATION_STRICT": true
}
```

## 📚 Best Practices

### 1. Threshold Configuration

- Start with conservative thresholds
- Monitor false positive rates
- Adjust gradually based on real data
- Document threshold changes

### 2. Backup Strategy

- Regular configuration exports
- Test restoration procedures
- Monitor backup file growth
- Archive old configurations

### 3. Change Management

- Use staging environment for testing
- Document all changes
- Implement approval workflow for production
- Monitor system behavior after changes

### 4. Performance Optimization

- Batch configuration changes
- Monitor memory usage
- Optimize cache settings
- Regular cleanup of audit logs

### 5. Version Control

- Review version history periodically
- Use meaningful usernames (avoid generic accounts)
- Test configuration changes before production deployment
- Keep version history clean by avoiding unnecessary saves
- Document major changes in external changelog

## 📚 Configuration Version History & Rollback

### Overview

The system provides git-like version control for all configuration changes with automatic tracking and single-click rollback capability. This feature ensures configuration accountability and enables quick recovery from misconfiguration.

### How Version History Works

**Automatic Versioning**:
- Every configuration save creates a version entry automatically
- Version data stored in `version_history.json` in TARGET_DIR
- Maximum 50 versions retained (oldest automatically pruned)
- Each version tracks timestamp, author, affected files, and backup paths

**Version Tag Format**: `YYYYMMDD_HHMMSS-username`
- Example: `20251014_140530-admin`
- Sortable by date and time
- User-traceable for audit purposes

**Storage Structure**:
```json
{
  "versions": [
    {
      "tag": "20251014_140530-admin",
      "timestamp": "2025-10-14T14:05:30.123Z",
      "author": "admin",
      "files": ["unified_config.json", "thresholds.config.json"],
      "backups": [
        "unified_config__20251014_140530__updated-thresholds.json.bak",
        "thresholds.config__20251014_140530__updated-thresholds.json.bak"
      ]
    }
  ]
}
```

### API Endpoints

#### GET /api/config-versions

Returns list of all configuration versions (max 50).

**Authentication**: Required (`can_view_configuration` permission)

**Response**:
```json
{
  "versions": [
    {
      "tag": "20251014_140530-admin",
      "timestamp": "2025-10-14T14:05:30.123Z",
      "author": "admin",
      "files": ["unified_config.json"],
      "backups": ["unified_config__20251014_140530__security-update.json.bak"]
    }
  ]
}
```

#### GET /api/config-version/:tag

Returns details for a specific version.

**Authentication**: Required (`can_view_configuration` permission)

**Parameters**:
- `tag` - Version tag (URL-encoded)

**Response**: Same as version object above

**Errors**:
- `404` - Version not found

#### POST /api/config-rollback/:tag

Rollback configuration to specified version.

**Authentication**: Required (`can_view_configuration` permission)

**Parameters**:
- `tag` - Version tag to restore (URL-encoded)

**Process**:
1. Validates version exists
2. Checks backup files exist
3. Creates pre-rollback safety backup of current state
4. Atomically restores all files from version's backups
5. Returns success confirmation

**Response** (success):
```json
{
  "success": true,
  "restoredFiles": ["unified_config.json", "thresholds.config.json"]
}
```

**Errors**:
- `404` - Version not found or backup files missing
- `500` - Rollback operation failed

### Safety Features

**Pre-rollback Backup**:
- Current configuration automatically backed up before rollback
- Tagged with `__pre-rollback` suffix
- Provides safety net in case rollback causes issues

**Atomic Operations**:
- All files restored together or none at all
- No partial state transitions
- Prevents configuration inconsistency

**Permission Control**:
- Requires `can_view_configuration` permission
- All operations logged with username
- Audit trail maintained

**Automatic Cleanup**:
- Max 50 versions retained
- Oldest versions pruned automatically
- Prevents disk space exhaustion

### Using Version History (Web UI)

**Access**:
1. Navigate to Configuration section
2. Click "Version History" button (bottom of left panel)
3. Modal displays version list

**Version List Display**:
- **Tag** - Version identifier with timestamp and username
- **Timestamp** - When the change was made (user timezone)
- **Author** - Username who made the change
- **Files** - Configuration files modified
- **Actions** - "Rollback" button for each version

**Rollback Procedure**:
1. Select desired version from list
2. Click "Rollback" button
3. Confirm in dialog (explains impact)
4. System creates pre-rollback backup
5. Restores files from version backups
6. Success message displays
7. Page auto-reloads to reflect changes

### Use Cases

#### Rollback After Misconfiguration

**Scenario**: Changed thresholds and system started blocking legitimate traffic

**Solution**:
1. Open Version History
2. Find version before the problematic change
3. Click "Rollback"
4. System restored to working configuration
5. Review what went wrong in the problematic version

#### Audit Compliance

**Scenario**: Security audit requires proof of who changed configuration and when

**Solution**:
1. Open Version History
2. Review complete timeline of changes
3. See username for each modification
4. Track specific files changed in each version
5. Export version history for audit report

#### Configuration Experimentation

**Scenario**: Want to test new detection thresholds without risk

**Solution**:
1. Note current version tag
2. Make experimental changes
3. Monitor system for 1 hour
4. If false positives increase, rollback to noted version
5. No need to manually remember old values

#### Emergency Recovery

**Scenario**: Configuration file corrupted or accidentally deleted

**Solution**:
1. Open Version History
2. Rollback to most recent working version
3. System restores from backups automatically
4. Service restored in seconds

### Integration with Other Systems

**Backup System**:
- Version history complements automatic backups (max 2 per file)
- Version history provides longer retention (50 versions)
- Backups provide file-level restore
- Version history provides point-in-time restore

**Audit Log**:
- Version history focuses on configuration changes
- Audit log tracks all file operations (including non-config)
- Both systems record username and timestamp
- Cross-reference for complete audit trail

**Configuration Editor**:
- Every save via Configuration UI creates version entry
- Author automatically extracted from JWT token
- Files and backups automatically tracked
- No manual versioning required

### Technical Implementation

**Version History File**: `TARGET_DIR/version_history.json`

**Backup Files**: `TARGET_DIR/{filename}__{timestamp}__{tag}.{ext}.bak`

**Example Backup Names**:
```
unified_config__20251014_140530__security-update.json.bak
thresholds.config__20251014_143020__lower-thresholds.json.bak
```

**Pruning Logic**:
- Triggered when versions exceed 50
- Keeps most recent 50 versions
- Older versions removed from `version_history.json`
- Associated backup files remain (subject to max 2 per file limit)

**Concurrency**:
- ETag validation prevents concurrent modifications
- Version history operations are atomic
- No race conditions during rollback

### Troubleshooting

#### Version History Empty

**Symptom**: Modal shows "No version history available"

**Causes**:
- No configuration changes made since feature deployment
- `version_history.json` file missing or empty
- Permission issues reading version history file

**Solutions**:
1. Make a configuration change to create first version
2. Check `version_history.json` exists in TARGET_DIR
3. Verify file permissions allow read access

#### Rollback Fails

**Symptom**: "Backup file not found" error

**Causes**:
- Backup files manually deleted
- Disk space issue prevented backup creation
- File permissions prevent access

**Solutions**:
1. Check backup files exist in TARGET_DIR
2. Verify disk space available: `df -h`
3. Check file permissions: `ls -la TARGET_DIR/*.bak`

#### Version List Too Long

**Symptom**: 50+ versions making list hard to navigate

**Causes**:
- Automatic pruning not working
- Too many small changes being saved

**Solutions**:
1. Check pruning logic in backend logs
2. Manually clean old versions if needed
3. Batch related configuration changes together

---

**Next Steps**: After configuring the system variables, test the complete integration by processing sample inputs and monitoring the dashboard metrics.