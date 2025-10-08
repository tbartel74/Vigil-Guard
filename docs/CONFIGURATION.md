# Configuration Reference

> **Comprehensive guide to configuring Vigil Guard security variables and system settings**

## 📋 Overview

This guide covers all configuration variables available in the Vigil Guard system, their purposes, valid values, and integration with the n8n workflow. The system manages 27 active security variables across different categories.

## 🎯 Configuration Categories

### Risk Level Categories

The system uses four risk levels for threat classification:

| Level | Purpose | Typical Threshold | Action |
|-------|---------|------------------|---------|
| **CRITICAL** | Immediate threats | 0.85-1.0 | Block immediately |
| **HIGH** | Serious threats | 0.70-0.84 | Block or sanitize |
| **MEDIUM** | Moderate threats | 0.40-0.69 | Sanitize or allow |
| **LOW** | Minor threats | 0.10-0.39 | Allow with logging |

## ⚙️ Active Configuration Variables

### Critical Risk Level Settings

#### `CRITICAL_THRESHOLD`
- **Type**: `number`
- **Range**: `0.0 - 1.0`
- **Default**: `0.85`
- **Purpose**: Threshold for immediate blocking of critical threats
- **n8n Usage**: Used in decision nodes to determine blocking actions

```json
{
  "name": "CRITICAL_THRESHOLD",
  "value": 0.85,
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
- **Range**: `0.0 - 1.0`
- **Default**: `0.70`
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
- **Range**: `0.0 - 1.0`
- **Default**: `0.40`
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
- **Range**: `0.0 - 1.0`
- **Default**: `0.10`
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

#### `backend/config/variables.json`
```json
{
  "CRITICAL_THRESHOLD": {
    "value": 0.85,
    "type": "number",
    "description": "Critical risk threshold for immediate blocking",
    "min": 0.0,
    "max": 1.0,
    "category": "risk_levels"
  },
  "ENABLE_SANITIZATION": {
    "value": true,
    "type": "boolean",
    "description": "Master switch for content sanitization",
    "category": "system"
  }
}
```

#### `backend/audit.log`
```
2024-01-15T10:30:45.123Z | UPDATE | CRITICAL_THRESHOLD | 0.80 -> 0.85 | user:admin | reason:security_update
2024-01-15T10:31:12.456Z | UPDATE | LOG_LEVEL | INFO -> DEBUG | user:admin | reason:debugging
```

### Frontend Configuration Files

#### `frontend/src/spec/variables.json`
```json
[
  {
    "name": "CRITICAL_THRESHOLD",
    "label": "Critical Threshold",
    "type": "number",
    "default": 0.85,
    "description": "Threshold for critical threat detection",
    "validation": {
      "min": 0.0,
      "max": 1.0,
      "step": 0.01
    },
    "category": "CRITICAL",
    "map": [
      {
        "file": "risk_config.json",
        "path": "critical.threshold"
      }
    ]
  }
]
```

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
// Threshold validation
if (value < 0.0 || value > 1.0) {
  throw new Error('Threshold must be between 0.0 and 1.0');
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
      "value": 0.85,
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
  "CRITICAL_THRESHOLD": 0.90,
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
      "oldValue": 0.80,
      "newValue": 0.85,
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

---

**Next Steps**: After configuring the system variables, test the complete integration by processing sample inputs and monitoring the dashboard metrics.