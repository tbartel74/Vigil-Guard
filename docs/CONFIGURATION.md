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

### Critical Risk Level Settings

#### `CRITICAL_THRESHOLD`
- **Type**: `number`
- **Range**: `0 - 100`
- **Default**: `85`
- **Purpose**: Threshold for immediate blocking of critical threats
- **n8n Usage**: Used in decision nodes to determine blocking actions

```json
{
  "name": "CRITICAL_THRESHOLD",
  "value": 85,
  "description": "Critical risk threshold - immediate block"
}
```

#### `CRITICAL_ACTION`
- **Type**: `string`
- **Values**: `BLOCK`, `SANITIZE`, `ALLOW`
- **Default**: `BLOCK`
- **Purpose**: Action to take when critical threshold is exceeded
- **n8n Usage**: Determines workflow path for critical threats

#### `CRITICAL_LOG_LEVEL`
- **Type**: `string`
- **Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **Default**: `ERROR`
- **Purpose**: Logging level for critical threat events

### High Risk Level Settings

#### `HIGH_THRESHOLD`
- **Type**: `number`
- **Range**: `0 - 100`
- **Default**: `70`
- **Purpose**: Threshold for high-risk threat detection

#### `HIGH_ACTION`
- **Type**: `string`
- **Values**: `BLOCK`, `SANITIZE`, `ALLOW`
- **Default**: `SANITIZE`
- **Purpose**: Action for high-risk threats

#### `HIGH_LOG_LEVEL`
- **Type**: `string`
- **Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **Default**: `WARN`
- **Purpose**: Logging level for high-risk events

### Medium Risk Level Settings

#### `MEDIUM_THRESHOLD`
- **Type**: `number`
- **Range**: `0 - 100`
- **Default**: `40`
- **Purpose**: Threshold for medium-risk threat detection

#### `MEDIUM_ACTION`
- **Type**: `string`
- **Values**: `BLOCK`, `SANITIZE`, `ALLOW`
- **Default**: `SANITIZE`
- **Purpose**: Action for medium-risk threats

#### `MEDIUM_LOG_LEVEL`
- **Type**: `string`
- **Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **Default**: `INFO`
- **Purpose**: Logging level for medium-risk events

### Low Risk Level Settings

#### `LOW_THRESHOLD`
- **Type**: `number`
- **Range**: `0 - 100`
- **Default**: `10`
- **Purpose**: Baseline threshold for threat detection

#### `LOW_ACTION`
- **Type**: `string`
- **Values**: `BLOCK`, `SANITIZE`, `ALLOW`
- **Default**: `ALLOW`
- **Purpose**: Action for low-risk threats

#### `LOW_LOG_LEVEL`
- **Type**: `string`
- **Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **Default**: `DEBUG`
- **Purpose**: Logging level for low-risk events

## 🔧 System Configuration Variables

### Core System Settings

#### `ENABLE_SANITIZATION`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Master switch for content sanitization
- **n8n Usage**: Controls sanitization workflow branches

#### `LOG_LEVEL`
- **Type**: `string`
- **Values**: `DEBUG`, `INFO`, `WARN`, `ERROR`
- **Default**: `INFO`
- **Purpose**: Global logging verbosity level

#### `MAX_RETRIES`
- **Type**: `number`
- **Range**: `1 - 10`
- **Default**: `3`
- **Purpose**: Maximum retry attempts for failed operations

#### `API_TIMEOUT_MS`
- **Type**: `number`
- **Range**: `1000 - 30000`
- **Default**: `5000`
- **Purpose**: API request timeout in milliseconds

### Security Settings

#### `ENABLE_RATE_LIMITING`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Enable request rate limiting

#### `RATE_LIMIT_REQUESTS`
- **Type**: `number`
- **Range**: `1 - 1000`
- **Default**: `100`
- **Purpose**: Maximum requests per time window

#### `RATE_LIMIT_WINDOW_MS`
- **Type**: `number`
- **Range**: `1000 - 3600000`
- **Default**: `60000`
- **Purpose**: Rate limiting time window in milliseconds

#### `ENABLE_IP_WHITELIST`
- **Type**: `boolean`
- **Default**: `false`
- **Purpose**: Enable IP address whitelisting

#### `TRUSTED_IPS`
- **Type**: `array`
- **Default**: `[]`
- **Purpose**: List of trusted IP addresses

### Performance Settings

#### `CACHE_ENABLED`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Enable response caching

#### `CACHE_SIZE_MB`
- **Type**: `number`
- **Range**: `1 - 1024`
- **Default**: `128`
- **Purpose**: Cache size limit in megabytes

#### `WORKER_THREADS`
- **Type**: `number`
- **Range**: `1 - 16`
- **Default**: `4`
- **Purpose**: Number of worker threads for processing

### Monitoring Settings

#### `METRICS_ENABLED`
- **Type**: `boolean`
- **Default**: `true`
- **Purpose**: Enable metrics collection

#### `METRICS_INTERVAL_MS`
- **Type**: `number`
- **Range**: `1000 - 300000`
- **Default**: `30000`
- **Purpose**: Metrics collection interval

#### `ALERT_THRESHOLD_VIOLATIONS`
- **Type**: `number`
- **Range**: `1 - 100`
- **Default**: `10`
- **Purpose**: Alert after N threshold violations

#### `ALERT_WEBHOOK_URL`
- **Type**: `string`
- **Default**: `""`
- **Purpose**: Webhook URL for alert notifications

### Database Settings

#### `DB_CONNECTION_POOL_SIZE`
- **Type**: `number`
- **Range**: `1 - 50`
- **Default**: `10`
- **Purpose**: Database connection pool size

#### `DB_QUERY_TIMEOUT_MS`
- **Type**: `number`
- **Range**: `1000 - 60000`
- **Default**: `10000`
- **Purpose**: Database query timeout

#### `DB_RETRY_ATTEMPTS`
- **Type**: `number`
- **Range**: `1 - 5`
- **Default**: `3`
- **Purpose**: Database retry attempts on failure

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
// Threshold ordering validation
if (config.HIGH_THRESHOLD >= config.CRITICAL_THRESHOLD) {
  throw new Error('HIGH_THRESHOLD must be less than CRITICAL_THRESHOLD');
}

if (config.MEDIUM_THRESHOLD >= config.HIGH_THRESHOLD) {
  throw new Error('MEDIUM_THRESHOLD must be less than HIGH_THRESHOLD');
}

if (config.LOW_THRESHOLD >= config.MEDIUM_THRESHOLD) {
  throw new Error('LOW_THRESHOLD must be less than MEDIUM_THRESHOLD');
}
```

## 🔧 API Configuration Endpoints

### GET /api/config

Returns all configuration variables with metadata:

```json
{
  "variables": {
    "CRITICAL_THRESHOLD": {
      "value": 85,
      "type": "number",
      "description": "Critical risk threshold",
      "lastModified": "2024-01-15T10:30:45.123Z",
      "modifiedBy": "admin"
    }
  },
  "etag": "1a2b3c4d5e6f",
  "lastUpdate": "2024-01-15T10:30:45.123Z"
}
```

### POST /api/config

Updates configuration variables:

**Request:**
```json
{
  "CRITICAL_THRESHOLD": 90,
  "LOG_LEVEL": "DEBUG"
}
```

**Response:**
```json
{
  "success": true,
  "updated": ["CRITICAL_THRESHOLD", "LOG_LEVEL"],
  "newEtag": "2b3c4d5e6f7g",
  "timestamp": "2024-01-15T10:31:00.000Z"
}
```

### GET /api/audit

Returns audit log entries:

```json
{
  "entries": [
    {
      "timestamp": "2024-01-15T10:30:45.123Z",
      "action": "UPDATE",
      "variable": "CRITICAL_THRESHOLD",
      "oldValue": 80,
      "newValue": 85,
      "user": "admin",
      "reason": "security_update"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 50
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