# Vigil Guard API Reference

The REST API provided by the backend (`services/web-ui/backend`) is responsible for user authentication, configuration file management, and retrieving statistics from ClickHouse. All endpoints listed below accept and return data in JSON format.

## Base URL

- Directly from the backend (e.g., in dev mode): `http://localhost:8787/api`
- Via Caddy reverse proxy (frontend on port 80): `http://localhost/ui/api`

All examples below assume direct communication with the backend. If using Caddy, prepend `/ui` to the API path.

## Authentication

The backend requires an active session. After a successful login, you'll receive both a JWT token and a session cookie. The token must be sent in the header:

```
Authorization: Bearer <token>
```

and all requests should include:

```
credentials: include
```

**Rate Limiting**: Authentication endpoints are protected against brute force attacks:
- **Login endpoint**: 5 attempts per 15 minutes
- **Password change**: 3 attempts per 15 minutes
- When limit exceeded, the API returns HTTP `429 Too Many Requests` with a JSON error message
- Rate limit headers are included in responses: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`

### `POST /api/auth/login`

**Rate Limited**: 5 attempts per 15 minutes per IP address

```jsonc
// Request body
{
  "username": "admin",
  "password": "<password-from-backend-console>"  // Get from: docker logs vigil-web-ui-backend
}

// Response body
{
  "success": true,
  "token": "<JWT>",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@vigilguard.local",
    "role": "admin",
    "can_view_monitoring": true,
    "can_view_configuration": true,
    "can_manage_users": true,
    "force_password_change": false,
    "timezone": "UTC"
  }
}
```

### Other important auth endpoints

| Method | Path                           | Description                              |
|--------|--------------------------------|------------------------------------------|
| `POST` | `/api/auth/logout`             | Invalidates the current session          |
| `GET`  | `/api/auth/me`                 | Returns the logged-in user's data        |
| `GET`  | `/api/auth/verify`             | Validates the token and returns its payload |
| `POST` | `/api/auth/change-password`    | Changes the user password (requires `currentPassword` and `newPassword`) **[Rate Limited: 3/15min]** |
| `PUT`  | `/api/auth/settings`           | Updates the user's timezone setting      |

Administrators have additional endpoints for managing users: `/api/auth/users`, `PUT/DELETE /api/auth/users/:id`, `/api/auth/users/:id/toggle-active`, `/api/auth/users/:id/force-password-change`.

## Configuration Files

The backend exposes APIs for browsing and editing `.json` and `.conf` files located in the `TARGET_DIR` directory (default: `/config` in the container). All actions are ETag-protected and automatically backed up.

| Method | Path                   | Description |
|--------|------------------------|-------------|
| `GET`  | `/api/files?ext=all`   | Lists files with ETags and metadata (optionally `json` or `conf`) |
| `GET`  | `/api/file/:name`      | Retrieves a file as plain text |
| `GET`  | `/api/parse/:name`     | Returns the file with a parsed data structure |
| `POST` | `/api/resolve`         | Resolves variables based on a given spec (secrets masked) |
| `POST` | `/api/save`            | Saves changes (via JSON path or `section/key` pairs for `.conf` files), creating a `.bak` backup |

### Example: Saving changes

```jsonc
POST /api/save
{
  "changeTag": "upped-limits",
  "ifMatch": "74bdbf1d",
  "changes": [
    {
      "file": "thresholds.config.json",
      "payloadType": "json",
      "updates": [
        { "path": "limits.requests_per_minute", "value": 120 }
      ]
    }
  ]
}
```

If ETags conflict, the backend returns a `409 Conflict` with details about the expected and actual ETag values.

## File Manager API

Additional endpoints are available for configuration file management (upload, download, list, audit log). All require authorization and the `can_view_configuration` permission.

### `GET /api/config-files/list`

Returns a list of all configuration files in `TARGET_DIR`.

**Authorization**: Required (`can_view_configuration`)

**Response:**
```json
{
  "files": [
    "unified_config.json",
    "thresholds.config.json",
    "rules.config.json",
    "allowlist.schema.json",
    "normalize.conf",
    "pii.conf"
  ]
}
```

### `GET /api/config-files/download/:filename`

Downloads a configuration file as a raw attachment.

**Authorization**: Required (`can_view_configuration`)

**Parameters:**
- `filename` — file name (validated: alphanumeric and safe characters only)

**Response Headers:**
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="thresholds.config.json"
```

**Response Body:** Raw file content

**Errors:**
- `400` — Invalid filename (contains disallowed characters)
- `404` — File not found

**Example:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8787/api/config-files/download/thresholds.config.json \
  -o thresholds.config.json
```

### `POST /api/config-files/upload/:filename`

Uploads a new file or replaces an existing one. Automatically creates a backup and an audit log entry.

**Authorization**: Required (`can_view_configuration`)

**Parameters:**
- `filename` — Target file name (must match URL path)

**Request Body:**
```jsonc
{
  "filename": "thresholds.config.json",
  "content": "{\n  \"version\": \"1.0\",\n  \"ranges\": {\n    \"allow\": { \"min\": 0, \"max\": 29 }\n  }\n}"
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Configuration file uploaded successfully",
  "result": {
    "results": [
      {
        "file": "thresholds.config.json",
        "backupPath": "/config/thresholds.config__20251018_143022__File upload by admin.json.bak",
        "etag": "a1b2c3d4e5f6"
      }
    ]
  }
}
```

**Errors:**
- `400` — Missing content, filename mismatch, or parse error (JSON/CONF)
- `401` — Unauthorized
- `403` — Missing `can_view_configuration` permission

**Audit Log Entry:**
```
[2025-10-14T14:05:30.123Z] User: admin | Action: FILE_UPLOAD | File: thresholds.config.json | Size: 245 bytes
```

**Workflow:**
1. Filename validation (alphanumeric + `._-` only)
2. Check filename match (URL vs body)
3. Content parsing (JSON or CONF)
4. Create backup of previous version
5. Save via `saveChanges` (atomic write)
6. Add entry to `audit.log`

### `GET /api/config-files/audit-log`

Returns the full contents of `audit.log`.

**Authorization**: Required (`can_view_configuration`)

**Response:**
```json
{
  "content": "[2025-10-14T14:05:30.123Z] User: admin | Action: FILE_UPLOAD | File: thresholds.config.json | Size: 245 bytes\n[2025-10-14T13:22:15.456Z] User: admin | Action: CONFIG_UPDATE | File: unified_config.json | Changes: 3\n"
}
```

**Notes:**
- If the file doesn't exist, it is auto-created with an initialization entry.
- File is not paginated — full content is returned.

**Audit log entry format:**
```
[ISO8601_timestamp] User: <username> | Action: <action_type> | File: <filename> | <details>
```

**Possible action types:**
- `FILE_UPLOAD` — File uploaded via API
- `CONFIG_UPDATE` — Configuration modified via `/api/save`
- `FILE_DOWNLOAD` — (reserved, not yet implemented)

## Events V2 API (3-Branch Detection)

The Events V2 API provides access to detection events processed by the 3-branch parallel architecture.

### `GET /api/events-v2/stats`

Returns aggregated statistics for the specified time range.

**Authorization**: Required (JWT)

**Query Parameters:**
- `timeRange` (optional): `1h`, `6h`, `12h`, `24h`, or `7d` (default: `24h`)

**Response:**
```json
{
  "total_events": 1245,
  "blocked": 32,
  "sanitized": 87,
  "allowed": 1126,
  "avg_processing_time_ms": 145
}
```

### `GET /api/events-v2/branch-stats`

Returns statistics broken down by detection branch.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "branch_a": { "detections": 45, "avg_score": 32.5 },
  "branch_b": { "detections": 38, "avg_score": 28.1 },
  "branch_c": { "detections": 22, "avg_score": 67.3 }
}
```

### `GET /api/events-v2/status-distribution`

Returns distribution of final statuses.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "ALLOWED": 1126,
  "SANITIZED": 87,
  "BLOCKED": 32
}
```

### `GET /api/events-v2/boost-stats`

Returns statistics about boost policies applied.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "boosted_events": 15,
  "boost_categories": ["PROMPT_INJECTION", "SQL_INJECTION"]
}
```

### `GET /api/events-v2/hourly-trend`

Returns hourly event counts for trend visualization.

**Authorization**: Required (JWT)

**Response:**
```json
[
  { "hour": "2025-12-01T10:00:00Z", "count": 45 },
  { "hour": "2025-12-01T11:00:00Z", "count": 52 }
]
```

### `GET /api/events-v2/pii-stats`

Returns PII detection statistics.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "events_with_pii": 87,
  "total_entities": 156,
  "top_types": ["EMAIL_ADDRESS", "CREDIT_CARD", "PL_PESEL"]
}
```

### `GET /api/events-v2/list`

Returns paginated list of events.

**Authorization**: Required (JWT)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)
- `timeRange` (optional): Time filter (default: `24h`)

**Response:**
```json
{
  "events": [
    {
      "event_id": "evt_123456",
      "timestamp": "2025-12-01T14:30:22Z",
      "final_status": "BLOCKED",
      "threat_score": 87,
      "branch_scores": { "a": 45, "b": 38, "c": 92 }
    }
  ],
  "pagination": { "page": 1, "total_pages": 10, "total_items": 500 }
}
```

### `GET /api/events-v2/search`

Search events by various criteria.

**Authorization**: Required (JWT)

**Query Parameters:**
- `q` (optional): Search query (searches input text)
- `status` (optional): Filter by status (`ALLOWED`, `SANITIZED`, `BLOCKED`)
- `category` (optional): Filter by threat category
- `minScore` (optional): Minimum threat score

**Response:** Same format as `/api/events-v2/list`

### `GET /api/events-v2/:eventId`

Returns detailed information about a specific event.

**Authorization**: Required (JWT)

**URL Parameters:**
- `eventId`: Event ID

**Response:**
```json
{
  "event_id": "evt_123456",
  "timestamp": "2025-12-01T14:30:22Z",
  "input_raw": "Ignore all previous instructions...",
  "input_normalized": "ignore all previous instructions...",
  "final_status": "BLOCKED",
  "arbiter_score": 87,
  "branch_scores": {
    "branch_a": { "score": 45, "categories": ["PROMPT_INJECTION"] },
    "branch_b": { "score": 38, "similarity": 0.82 },
    "branch_c": { "score": 92, "hazard": "S1" }
  },
  "pii_detected": true,
  "pii_entities": ["EMAIL_ADDRESS"],
  "processing_time_ms": 145
}
```

## Branch Health API

### `GET /api/branches/health`

Returns health status of all detection branches.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "branch_a": { "status": "healthy", "latency_ms": 5 },
  "branch_b": { "status": "healthy", "latency_ms": 15 },
  "branch_c": { "status": "healthy", "latency_ms": 800 }
}
```

## System API

### `GET /api/system/containers`

Returns status of all Docker containers.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "containers": [
    { "name": "vigil-n8n", "status": "running", "uptime": "2d 5h" },
    { "name": "vigil-clickhouse", "status": "running", "uptime": "2d 5h" }
  ]
}
```

## Monitoring (Legacy)

### `GET /api/stats/pii/types` (v1.8.1)

Returns top 10 PII entity types detected within the specified time range.

**Authorization**: Required (JWT)

**Query Parameters:**
- `timeRange` (optional): `1h`, `6h`, `12h`, `24h`, or `7d` (default: `24h`)

**Response:**
```json
[
  {
    "type": "EMAIL_ADDRESS",
    "count": 245,
    "percentage": 35.2
  },
  {
    "type": "CREDIT_CARD",
    "count": 187,
    "percentage": 26.9
  },
  {
    "type": "PL_PESEL",
    "count": 156,
    "percentage": 22.4
  }
]
```

**Note**: Requires ClickHouse schema v1.8.1 with `pii_types_detected` column. Returns empty array if no PII detected in time range.

### `GET /api/stats/pii/overview` (v1.8.1)

Returns comprehensive PII detection statistics including detection rate and top entity types.

**Authorization**: Required (JWT)

**Query Parameters:**
- `timeRange` (optional): `1h`, `6h`, `12h`, `24h`, or `7d` (default: `24h`)

**Response:**
```json
{
  "total_requests": 5420,
  "requests_with_pii": 1087,
  "pii_detection_rate": 20.06,
  "total_pii_entities": 1543,
  "top_pii_types": [
    {
      "type": "EMAIL_ADDRESS",
      "count": 245,
      "percentage": 35.2
    },
    {
      "type": "CREDIT_CARD",
      "count": 187,
      "percentage": 26.9
    }
  ]
}
```

**Fields:**
- `total_requests`: Total number of requests processed
- `requests_with_pii`: Number of requests containing PII
- `pii_detection_rate`: Percentage of requests with PII (0-100)
- `total_pii_entities`: Sum of all PII entities detected
- `top_pii_types`: Top 10 entity types (same format as `/api/stats/pii/types`)

**Note**: Requires ClickHouse schema v1.8.1 with `pii_sanitized` and `pii_entities_count` columns.

### `GET /api/prompt-guard/health`

Checks the health of the Prompt Guard API.

```json
{
  "status": "healthy",
  "model_loaded": true
}
```

## Feedback API

Allows users to report false detections (over-blocking or over-sanitization). All endpoints require authorization.

### `POST /api/feedback/false-positive`

**Request:**
```jsonc
{
  "event_id": "1760425445919-1760425446066",
  "reason": "over_blocking",
  "comment": "This was a legitimate request",
  "event_timestamp": "2025-10-14T07:04:06Z",
  "original_input": "ignore all previous instructions",
  "final_status": "BLOCKED",
  "threat_score": 85
}
```

**Response:**
```json
{
  "success": true,
  "message": "False positive report submitted successfully"
}
```

**Errors:**
- `400` — Missing required fields
- `401` — Unauthorized

### `GET /api/feedback/stats`

Returns false-positive report statistics.

**Response:**
```json
{
  "total_reports": 49,
  "unique_events": 45,
  "top_reason": "over_blocking",
  "last_7_days": 12
}
```

**Stored in ClickHouse:**
- Table: `n8n_logs.false_positive_reports`
- Views: `false_positive_summary`, `false_positive_trends`
- Schema: `services/monitoring/sql/03-false-positives.sql`

### UI Integration

Accessible via "Report False Positive" in Prompt Analysis view.

**Dashboard panels:**
- Quick Stats (total + last 7 days)
- Grafana panel "False Positive Reports Over Time"

### `POST /api/feedback/true-positive`

Reports a detection as correctly identified (true positive).

**Authorization**: Required (JWT)

**Request:**
```json
{
  "event_id": "evt_123456",
  "comment": "Correctly blocked malicious prompt"
}
```

**Response:**
```json
{
  "success": true,
  "message": "True positive report submitted successfully"
}
```

### `POST /api/feedback/submit`

Generic feedback submission endpoint.

**Authorization**: Required (JWT)

**Request:**
```json
{
  "event_id": "evt_123456",
  "feedback_type": "false_positive",
  "reason": "over_blocking",
  "comment": "This was a legitimate request"
}
```

### `GET /api/feedback/reports`

Returns paginated list of all feedback reports.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "reports": [
    {
      "id": "rpt_123",
      "event_id": "evt_456",
      "feedback_type": "false_positive",
      "reason": "over_blocking",
      "reporter": "admin",
      "timestamp": "2025-12-01T14:30:00Z"
    }
  ]
}
```

### `GET /api/feedback/reports/:reportId`

Returns details of a specific feedback report.

**Authorization**: Required (JWT)

### `GET /api/feedback/stats/by-reason`

Returns feedback statistics grouped by reason.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "over_blocking": 25,
  "over_sanitization": 12,
  "wrong_category": 8
}
```

### `GET /api/feedback/stats/by-category`

Returns feedback statistics grouped by threat category.

**Authorization**: Required (JWT)

### `GET /api/feedback/stats/by-reporter`

Returns feedback statistics grouped by reporter.

**Authorization**: Required (JWT)

### `GET /api/feedback/stats/trend`

Returns feedback trend over time.

**Authorization**: Required (JWT)

**Response:**
```json
[
  { "date": "2025-11-25", "count": 5 },
  { "date": "2025-11-26", "count": 8 },
  { "date": "2025-11-27", "count": 3 }
]
```

## Plugin Configuration API

Endpoints for managing browser extension configuration.

### `GET /api/plugin-config`

Returns current plugin configuration.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "enabled": true,
  "gui_url": "http://localhost/ui",
  "webhook_url": "http://localhost/ui/api/browser-filter",
  "auth_token": "vigil_***"
}
```

### `GET /api/plugin-config/settings`

Returns plugin settings for the extension.

**Authorization**: Required (JWT)

### `POST /api/plugin-config/settings`

Updates plugin settings.

**Authorization**: Required (JWT)

**Request:**
```json
{
  "enabled": true,
  "platforms": ["chatgpt", "claude"]
}
```

### `POST /api/plugin-config/regenerate-token`

Regenerates the authentication token for the browser extension.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "success": true,
  "token": "vigil_new_token_here"
}
```

### `POST /api/plugin-config/bootstrap`

Initiates bootstrap process for extension setup.

**Authorization**: Required (JWT)

### `GET /api/plugin-config/bootstrap-status`

Returns current bootstrap status.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "status": "ready",
  "extension_installed": true,
  "configuration_synced": true
}
```

### `POST /api/plugin-config/generate-bootstrap`

Generates bootstrap configuration for new extension installation.

**Authorization**: Required (JWT)

### `GET /api/plugin-config/download-plugin`

Downloads the latest browser extension package.

**Authorization**: Required (JWT)

**Response:** Binary ZIP file with extension

## Retention Policy API

Endpoints for managing data retention policies in ClickHouse.

### `GET /api/retention/config`

Returns current retention configuration.

**Authorization**: Required (JWT, `can_view_configuration`)

**Response:**
```json
{
  "events_processed": {
    "retention_days": 90,
    "partition_by": "toYYYYMM(timestamp)"
  },
  "events_raw": {
    "retention_days": 30
  },
  "false_positive_reports": {
    "retention_days": 365
  }
}
```

### `PUT /api/retention/config`

Updates retention configuration.

**Authorization**: Required (JWT, `can_view_configuration`)

**Request:**
```json
{
  "table": "events_processed",
  "retention_days": 60
}
```

### `GET /api/retention/disk-usage`

Returns disk usage statistics for ClickHouse tables.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "total_size_gb": 2.5,
  "tables": [
    { "name": "events_processed", "size_gb": 1.8, "rows": 125000 },
    { "name": "events_raw", "size_gb": 0.5, "rows": 50000 }
  ]
}
```

### `POST /api/retention/cleanup`

Triggers manual cleanup of expired data.

**Authorization**: Required (JWT, `can_view_configuration`)

**Response:**
```json
{
  "success": true,
  "deleted_partitions": 3,
  "freed_space_gb": 0.8
}
```

### `GET /api/retention/partitions/:table`

Returns partition information for a specific table.

**Authorization**: Required (JWT)

**URL Parameters:**
- `table`: Table name (e.g., `events_processed`)

**Response:**
```json
{
  "partitions": [
    { "name": "202511", "rows": 45000, "size_mb": 180 },
    { "name": "202512", "rows": 12000, "size_mb": 48 }
  ]
}
```

## Configuration Version History

Each `/api/save` operation automatically creates a version record with a timestamp, author, tag, and backups. All endpoints require `can_view_configuration` permission.

### `GET /api/config-versions`

Returns up to 50 recent configuration versions.

**Response:**
```json
{
  "versions": [
    {
      "tag": "2025-10-14_12-05-30-admin",
      "timestamp": "2025-10-14T12:05:30.123Z",
      "author": "admin",
      "files": ["unified_config.json"],
      "backups": ["unified_config__2025-10-14_12-05-30__updated-limits.json.bak"]
    }
  ]
}
```

### `GET /api/config-version/:tag`

Fetches details for a specific version.

**Response:**
```json
{
  "tag": "2025-10-14_12-05-30-admin",
  "timestamp": "2025-10-14T12:05:30.123Z",
  "author": "admin",
  "files": ["unified_config.json"],
  "backups": ["unified_config__2025-10-14_12-05-30__updated-limits.json.bak"]
}
```

**Errors:**
- `404` — Version not found

### `POST /api/config-rollback/:tag`

Restores configuration to a specific version. The system automatically creates a backup before rollback.

**Response:**
```json
{
  "success": true,
  "restoredFiles": ["unified_config.json"]
}
```

**Errors:**
- `404` — Version or backup not found
- `500` — Rollback failure

### UI Integration

In the Configuration section, the "Version History" button opens a modal with:

1. Version list with timestamp and author
2. Modified file list
3. Rollback button for each entry
4. Confirmation dialog
5. Automatic page refresh after rollback

**Version tag format:** `YYYYMMDD_HHMMSS-username`

**File locations:**
- History: `TARGET_DIR/version_history.json`
- Backups: `TARGET_DIR/{filename}__{timestamp}__{changeTag}.{ext}.bak`

## PII Detection API

Endpoints for PII (Personally Identifiable Information) detection using Microsoft Presidio with dual-language support (Polish + English).

**Rate Limiting**: 50 requests per minute per IP address.

### `GET /api/pii-detection/status`

Returns Presidio service health status.

**Authorization**: Required (JWT)

**Response (online):**
```json
{
  "status": "online",
  "version": "2.2.351",
  "recognizers_loaded": 15,
  "spacy_models": ["en_core_web_lg", "pl_core_news_lg"]
}
```

**Response (offline):**
```json
{
  "status": "offline",
  "fallback": "regex",
  "error": "Connection refused"
}
```

### `GET /api/pii-detection/entity-types`

Returns list of supported PII entity types.

**Authorization**: Required (JWT)

**Response:**
```json
{
  "entities": [
    {
      "id": "EMAIL_ADDRESS",
      "name": "Email Address",
      "category": "contact",
      "description": "Email addresses in standard format"
    },
    {
      "id": "PL_PESEL",
      "name": "PESEL (Polish National ID)",
      "category": "identity",
      "description": "11-digit Polish identification number with checksum validation"
    }
  ],
  "total": 11,
  "categories": ["contact", "identity", "business", "financial", "technical"]
}
```

### `POST /api/pii-detection/analyze`

Analyzes text for PII entities using dual-language detection (Polish + English).

**Authorization**: Required (JWT)

**Request:**
```json
{
  "text": "Mój PESEL to 44051401359, email: jan@example.com",
  "entities": ["EMAIL_ADDRESS", "PL_PESEL"],
  "return_decision_process": true
}
```

**Parameters:**
- `text` (required): Text to analyze (max 20,000 characters)
- `entities` (optional): List of entity types to detect (max 50)
- `return_decision_process` (optional): Include detailed analysis info

**Response:**
```json
{
  "entities": [
    {
      "type": "PL_PESEL",
      "start": 14,
      "end": 25,
      "score": 0.95,
      "source": "presidio_pl"
    },
    {
      "type": "EMAIL_ADDRESS",
      "start": 34,
      "end": 49,
      "score": 0.85,
      "source": "presidio_en"
    }
  ],
  "detected_language": "pl",
  "processing_time_ms": 45,
  "language_stats": {
    "pl": 1,
    "en": 1,
    "regex": 0
  }
}
```

**Query Parameters:**
- `mode=legacy`: Use single-language Presidio proxy instead of dual-language

### `POST /api/pii-detection/analyze-full`

Same as `/analyze` but always uses dual-language workflow with full statistics.

**Authorization**: Required (JWT)

### `POST /api/pii-detection/save-config`

Saves PII detection configuration.

**Authorization**: Required (JWT, `can_view_configuration`)

**Request:**
```json
{
  "enabledEntities": ["EMAIL_ADDRESS", "PL_PESEL", "CREDIT_CARD"],
  "etags": {
    "unified_config.json": "a1b2c3d4"
  }
}
```

**Response:**
```json
{
  "success": true,
  "etags": {
    "unified_config.json": "e5f6g7h8"
  }
}
```

**Errors:**
- `400` — Validation error
- `412` — ETag mismatch (concurrent modification)

### `GET /api/pii-detection/validate-config`

Validates consistency between unified_config.json and pii.conf.

**Authorization**: Required (JWT, `can_view_configuration`)

**Response (consistent):**
```json
{
  "consistent": true,
  "unified_config": {
    "count": 11,
    "entities": ["EMAIL_ADDRESS", "PL_PESEL", ...]
  },
  "pii_conf": {
    "count": 8,
    "entities": ["EMAIL_ADDRESS", "PL_PESEL", ...]
  },
  "discrepancies": null,
  "presidio_only_entities": ["PERSON", "LOCATION", "ORGANIZATION"]
}
```

**Response (inconsistent):**
```json
{
  "consistent": false,
  "discrepancies": {
    "in_unified_only": ["NEW_ENTITY"],
    "in_pii_conf_only": ["REMOVED_ENTITY"]
  }
}
```

## Health Checks

- `GET /health` – backend Web UI
- `GET /ui/api/health` – same endpoint via Caddy
- `GET /ui/api/stats/24h` – verifies ClickHouse connection (requires auth)

## Error Handling

The API uses standard HTTP status codes. Validation and write-conflict errors return:

```json
{
  "error": "File changed on disk",
  "expected": "74bdbf1d",
  "actual": "27ce901a"
}
```

For additional information, see [Overview](README.md), [Installation Guide](operations/installation.md), and [User Guides](guides/README.md).
