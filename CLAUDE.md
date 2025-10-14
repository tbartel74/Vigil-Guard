# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Git Commit Policy

⚠️ **CRITICAL: NO AI ATTRIBUTION IN COMMITS**
- **NEVER** add Claude Code footers, signatures, or attributions to commit messages
- **NEVER** include "Co-Authored-By: Claude <noreply@anthropic.com>" or any similar attribution
- **NEVER** include "🤖 Generated with [Claude Code]" or any AI-related badges
- **NEVER** mention "vigil-misc" directory or external file storage locations
- Commit messages must be clean, professional, and contain ONLY the technical change description
- This is a permanent project policy that must be followed at all times
- Example of correct commit format:
```
feat(security): Add polyglot attack detection with 11 scripts

Implement multi-script detection to identify sophisticated obfuscation
attempts mixing Latin, Cyrillic, Greek, Arabic, Hebrew, Thai, Hangul,
Hiragana, Katakana, CJK, and Emoji characters.
```

## Project Overview

Vigil Guard is a comprehensive security platform for protecting Large Language Model applications from prompt injection attacks and malicious content. The system consists of four main components:

1. **n8n Workflow Pipeline** - Sequential sanitizer processing requests in real-time
2. **Web UI** - React/Express web interface with authentication, user management, configuration, and monitoring
3. **Monitoring Stack** - ClickHouse + Grafana for analytics and dashboards
4. **Prompt Guard API** - FastAPI service using Meta's Llama Prompt Guard 2 for advanced prompt injection detection

## Key Commands

### Development

```bash
# Install all dependencies (monorepo)
npm install

# Build all services
npm run build

# Start all services with Docker
docker-compose up -d

# Development mode (individual services)
npm run dev:backend               # Backend on port 8787
npm run dev:frontend              # Frontend on port 5173

# TypeScript type checking
npm run lint
```

### Docker Services

```bash
# Start all services at once
docker-compose up -d

# Start individual services
docker-compose up -d clickhouse grafana  # Monitoring stack
docker-compose up -d n8n                 # Workflow engine
docker-compose up -d web-ui-backend web-ui-frontend  # Web UI

# Prompt Guard API (separate service)
cd prompt-guard-api && docker-compose up -d

# View logs
docker-compose logs -f [service-name]

# Stop all services
docker-compose down
```

### Testing Configuration

```bash
# Test backend API
curl http://localhost:8787/api/files
curl http://localhost:8787/api/parse/unified_config.json

# Verify ClickHouse connection
curl http://localhost:8123/ping

# Check Grafana
curl -I http://localhost:3001
```

## Architecture

### n8n Workflow Pipeline (40 nodes, 16 code nodes)

The system processes chat messages through a sequential pipeline:

1. **Input & Config Loading** → Chat trigger → Load 5 config files (.json/.conf)
2. **Input Validation** → Input_Validator → Validation Check (IF) → Early Block Response (if validation fails)
3. **Text Processing** → PII_Redactor → Normalize_Node → Bloom_Prefilter → Allowlist_Validator → Pattern_Matching_Engine
4. **Decision & Enforcement** → Unified Decision Engine → Correlation_Engine → Sanitization_Enforcement
5. **LLM Guard (conditional)** → Prepare Groq Request → Prompt Guard API → LLM Context Restore
6. **Finalization** → Finale Decision → Build+Sanitize NDJSON → Logging to ClickHouse → Clean output

**Key Decision Thresholds** (from `thresholds.config.json`):
- ALLOW: 0-29
- SANITIZE_LIGHT: 30-64
- SANITIZE_HEAVY: 65-84
- BLOCK: 85-100

**Prompt Guard Integration**:
- External LLM validation using Meta's Llama Prompt Guard 2
- Risk scores evaluated in decision engine
- Integrated into final routing logic

### Authentication & User Management System

The Web UI includes a comprehensive authentication system with RBAC:

**Authentication Features**:
- JWT token-based authentication (stored in localStorage)
- SQLite database with `better-sqlite3` for user storage
- Bcrypt password hashing (12 rounds)
- Default admin credentials: admin/admin123 (⚠️ change immediately!)
- Database auto-created at `/data/users.db` on first run

**User Permissions** (RBAC):
- `can_view_monitoring` - Access to monitoring dashboard
- `can_view_configuration` - Configuration editing access
- `can_manage_users` - User administration access

**User Management Features**:
- Create, edit, delete users
- Toggle active/inactive status
- Force password change on next login
- Timezone preferences per user
- Last admin protection (cannot remove last user with `can_manage_users`)

**Authentication API Endpoints**:
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/change-password` - Change password
- `PUT /api/auth/settings` - Update user settings (timezone)

**User Management API** (requires `can_manage_users`):
- `GET /api/auth/users` - List all users
- `POST /api/auth/users` - Create new user
- `PUT /api/auth/users/:id` - Update user
- `DELETE /api/auth/users/:id` - Delete user
- `POST /api/auth/users/:id/toggle-active` - Toggle active status
- `POST /api/auth/users/:id/force-password-change` - Force password reset

### Configuration Management System

The Web UI manages configuration through a unified variable mapping system:

**Configuration Files** (in `services/workflow/config/`):
- `unified_config.json` - Main settings, normalization, sanitization, bloom filter
- `thresholds.config.json` - Score ranges for decisions
- `rules.config.json` - Detection patterns and categories
- `allowlist.schema.json` - JSON Schema for allowlist validation
- `normalize.conf` - Homoglyph and leet speak mappings
- `pii.conf` - PII redaction patterns

**Backend Architecture** (`services/web-ui/backend/src/`):
- `server.ts` - Express API with CORS, JWT auth, endpoints
- `auth.ts` - JWT authentication and permission middleware
- `database.ts` - SQLite user database operations
- `authRoutes.ts` - Authentication and user management routes
- `clickhouse.ts` - ClickHouse client connection and statistics queries
- `fileOps.ts` - File operations with path traversal protection, ETag validation
- `confParser.ts` - Parses .conf files (section/key format)
- `schema.ts` - TypeScript types for variable specs

**Configuration API Endpoints** (requires `can_view_configuration`):
- `GET /api/files?ext=all|json|conf` - List configuration files
- `GET /api/parse/:name` - Parse file with ETag
- `POST /api/resolve` - Map variables to actual values from files
- `POST /api/save` - Save changes with ETag validation (409 on conflict)

**Statistics API Endpoints** (requires authentication):
- `GET /api/stats/24h` - Get real-time statistics from ClickHouse for last 24 hours
  - Returns: `{ requests_processed, threats_blocked, content_sanitized }`
  - Data source: `n8n_logs.events_processed` table

**Frontend Architecture** (`services/web-ui/frontend/src/`):
- `routes.tsx` - Multi-page app with protected routes:
  - `/login` - Login page (public)
  - `/` - Monitoring dashboard (requires `can_view_monitoring`)
  - `/config/*` - Configuration management (requires `can_view_configuration`)
  - `/administration` - User management (requires `can_manage_users`)
  - `/settings` - User settings (authenticated)
- `components/` - UI components:
  - `Login` - Authentication form
  - `UserManagement` - Admin panel for user CRUD
  - `Settings` - User timezone and preferences
  - `TopBar` - User dropdown with permissions display
  - `ConfigEditor`, `VariableGroup` - Configuration UI
  - `GrafanaEmbed` - Monitoring dashboard panels
- `context/AuthContext.tsx` - Global authentication state management
- `spec/variables.json` - Defines all configurable variables with mappings
- `lib/api.ts` - API client with JWT token handling

### Logging & Monitoring

**ClickHouse Integration**:
- **Database**: `n8n_logs` with two main tables:
  - `events_raw` - Lightweight ingestion table for request metadata
  - `events_processed` - Full event data with detection results, scores, and sanitization
- **Schema** (in `services/monitoring/sql/`):
  - Tables created via `01-create-tables.sql`
  - Views defined in `02-create-views.sql`
  - Partitioned by month for efficient querying
- **Connection** (in `services/web-ui/backend/src/clickhouse.ts`):
  - Singleton client pattern with `@clickhouse/client` library
  - Environment variables: `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`
  - Default credentials: `admin / admin123` (configurable)
  - Automatic error handling with fallback to zeros

**Real-time Statistics**:
- Monitoring dashboard displays live stats from ClickHouse
- Data auto-refreshes based on configured interval (default 30 seconds)
- Query example:
  ```sql
  SELECT
    count() AS requests_processed,
    countIf(final_status = 'BLOCKED') AS threats_blocked,
    countIf(final_status = 'SANITIZED') AS content_sanitized
  FROM n8n_logs.events_processed
  WHERE timestamp >= now() - INTERVAL 24 HOUR
  ```
- Frontend converts string numbers to integers for display
- Uses Vite proxy (`/api/*`) to route requests to backend

**Grafana Dashboards** (6 panels):
1. Input/Output Table - Real-time processing data
2. TOP-10 Detection Categories - Dominant threats
3. Volume + Status Distribution - ALLOWED/SANITIZED/BLOCKED stats
4. Block Rate Percentage - Early warning indicator
5. Maliciousness Trend - AVG & P95 score analysis
6. Histogram Time Series - Score distribution buckets

### False Positive Monitoring System (Phase 3.4)

Complete feedback loop for identifying and tracking over-blocking issues:

**Database Schema** (in `services/monitoring/sql/03-false-positives.sql`):
- `false_positive_reports` table - Stores user-reported false positives
- `false_positive_summary` view - Aggregated statistics by reason
- `false_positive_trends` view - Time-series analysis

**Backend API** (`services/web-ui/backend/src/`):
- `POST /api/feedback/false-positive` - Submit FP report (requires authentication)
  - Auto-captures `reported_by` from JWT token
  - Fields: `event_id`, `reason`, `comment`, `event_timestamp`, `original_input`, `final_status`, `threat_score`
  - Valid reasons: `over_blocking`, `over_sanitization`, `false_detection`, `business_logic`, `other`
- `GET /api/feedback/stats` - Get FP statistics (requires authentication)
  - Returns: `{ total_reports, unique_events, top_reason, last_7_days }`

**Frontend UI** (`services/web-ui/frontend/src/components/`):
- `PromptAnalyzer.tsx` - Main analysis interface with FP reporting
  - "Report False Positive" button (appears for BLOCKED/SANITIZED events only)
  - Modal form with reason dropdown and comment field
  - Auto-populates event metadata from selected prompt
  - Located in top-right corner next to status indicator
- Dashboard integration:
  - FP stats displayed in Quick Stats panel (Total + Last 7 days)
  - Time series chart showing FP reports over time (Panel 7)

**Grafana Dashboard** (`fp-monitoring-dashboard.json`):
- 7 specialized panels for FP analysis
- Reason distribution breakdown
- Temporal trends and patterns
- Integration with main Vigil dashboard

**Testing**:
- 11 comprehensive tests in `tests/api/false-positive.test.js`
- All authentication, validation, and edge cases covered
- 100% test coverage for FP reporting functionality

### Configuration Versioning & Rollback System (Phase 3.3)

Automatic version history tracking with git-like rollback capabilities for all configuration changes:

**Version History Management** (`services/web-ui/backend/src/fileOps.ts`):
- Automatic versioning on every configuration save via `/api/save`
- Version history stored in `version_history.json` (max 50 versions, auto-pruning)
- Each version includes: tag, timestamp, author (from JWT), files changed, backup paths
- Tag format: `YYYYMMDD_HHMMSS-username` (sortable, user-traceable)
- Max 2 backup files per config file (automatic cleanup of old backups)

**Backend API** (`services/web-ui/backend/src/server.ts`):
- `GET /api/config-versions` - List all versions (requires `can_view_configuration`)
  - Returns: Array of version entries with metadata
- `GET /api/config-version/:tag` - Get specific version details (requires `can_view_configuration`)
  - Returns: Single version entry with full details
- `POST /api/config-rollback/:tag` - Rollback to specific version (requires `can_view_configuration`)
  - Creates pre-rollback safety backup before restore
  - Restores files from version backup
  - Returns: List of restored files

**Frontend UI** (`services/web-ui/frontend/src/components/`):
- `VersionHistoryModal.tsx` - Version history viewer and rollback interface
  - Accessible via "Version History" button in Configuration layout (bottom-left panel)
  - Displays: timestamp, author, modified files for each version
  - Rollback workflow: Click "Rollback" → Confirmation dialog → Execute → Auto-reload
- `ConfigLayout.tsx` - Integration point with version history button

**Versioning Workflow**:
1. User edits configuration → Frontend calls `/api/save` with `author` from JWT
2. Backend creates timestamped backup: `{file}__{timestamp}__{changeTag}.{ext}.bak`
3. Backend applies changes atomically (write to .tmp → rename)
4. Backend adds entry to `version_history.json` with full metadata
5. Backend cleans up old backups (keeps max 2 per file)

**Rollback Workflow**:
1. User opens Version History modal from Configuration section
2. User selects version and clicks "Rollback"
3. Confirmation dialog: "Are you sure you want to rollback to version X?"
4. Backend creates pre-rollback safety backup of current state
5. Backend restores files from version's backup files
6. Frontend auto-reloads page to show restored values

**Safety Features**:
- **Pre-rollback backup**: Current state saved before rollback
- **ETag validation**: Prevents concurrent write conflicts
- **Atomic writes**: Uses .tmp file → rename for POSIX atomic operation
- **Author tracking**: Every change tagged with username from JWT token
- **Automatic cleanup**: Old backups pruned, version history limited to 50 entries
- **Permission checks**: All endpoints require `can_view_configuration` permission

**File Locations**:
- Version history: `TARGET_DIR/version_history.json`
- Backup files: `TARGET_DIR/{filename}__{timestamp}__{changeTag}.{ext}.bak`
- Audit log: `TARGET_DIR/audit.log` (complementary logging)

## Security Considerations

**JWT Authentication**: All protected routes require valid JWT token with appropriate permissions

**Password Security**: Bcrypt hashing with 12 rounds, minimum 8 characters required

**Last Admin Protection**: System prevents removing last user with `can_manage_users` permission

**SQL Injection Prevention**: Parameterized queries used throughout database operations

**Path Traversal Protection**: Backend validates filenames (alphanumeric + safe chars only) in `fileOps.ts`

**ETag-Based Concurrency Control**: Prevents concurrent edit conflicts via If-Match headers

**Secret Masking**: Variables marked as `secret: true` in spec are masked in UI (e.g., `a***z`)

**CORS Policy**: Backend allows `http://localhost` with any port (configurable)

**Session Management**: Automatic logout on token expiration, tokens stored in localStorage

**Permission Middleware**: Route-level permission checks for monitoring, configuration, and user management

**Target Directory**: Default `/Users/tomaszbartel/Documents/n8n-data/config_sanitizer` (override via `TARGET_DIR` env var)

## Variable Groups

Configuration variables organized into 5 groups (from `CONFIG_VARIABLES.md`):

1. **Quick Settings** - Test mode, logging, block messages
2. **Detection Tuning** - Scoring algorithms, thresholds, bloom filter
3. **Performance** - Timeouts, caching, input limits
4. **Advanced** - Normalization (NFKC), sanitization policies, n-grams
5. **LLM Integration** - Prompt Guard external validation

## Common Patterns

**Variable Mapping**:
- JSON files: Use dot-notation paths (e.g., `bloom_filter.enabled`)
- CONF files: Use section/key format (e.g., `[detection]/scoring_algorithm`)

**Config Updates with Audit Trail**:
1. Frontend calls `/api/resolve` with variable spec
2. Backend parses all referenced files, returns current values
3. User edits values in UI
4. Frontend calls `/api/save` with changes + authenticated username as changeTag
5. Backend validates, updates files atomically, returns new ETag
6. System automatically tracks who made changes (username from JWT token)

**n8n Code Nodes**: Most logic in Code nodes (13 total), processing stages:
- PII_Redactor: Remove sensitive data
- Normalize_Node: Canonicalization, obfuscation detection
- Bloom_Prefilter: Heuristic bloom filter check
- Pattern_Matching_Engine: Regex scoring
- Unified Decision Engine: Map scores to decisions
- Correlation_Engine: Escalate based on signals
- Sanitization_Enforcement: Apply LIGHT/HEAVY redaction
- Finale Decision: Final routing logic

## Docker Network

All services communicate via `vigil-network` external network. Ensure network exists:
```bash
docker network create vigil-network
```

## Troubleshooting

**Port Conflicts**:
- n8n: 5678
- Web UI Frontend: 5173
- Web UI Backend: 8787
- Grafana: 3001
- ClickHouse: 8123 (HTTP), 9000 (TCP)

**ClickHouse Connection Issues**:
- **Authentication errors**: Verify credentials in docker-compose.yml match those in `clickhouse.ts` defaults
  - Default: `admin / admin123`
- **Connection refused**: Ensure ClickHouse container is running: `docker ps | grep clickhouse`
- **Database not initialized**: Check if SQL scripts mounted correctly in `/docker-entrypoint-initdb.d/`
- **Empty statistics**: Verify data exists: `docker exec vigil-clickhouse clickhouse-client -q "SELECT count() FROM n8n_logs.events_processed"`
- **String vs number types**: ClickHouse returns numbers as strings in JSON format - frontend must convert with `Number()`

**Config File Locations**:
- Workflow configs: `./services/workflow/config/*.{json,conf}`
- Variable specs: `./services/web-ui/frontend/src/spec/variables.json`
- Docker configs: Main `docker-compose.yml` + service-specific configs
- Documentation: `./docs/` (installation, configuration, API reference)

**Grafana Embedding**: Security settings must allow iframe embedding (`GF_SECURITY_ALLOW_EMBEDDING=true`)

## Recent Improvements

**Version 1.2.0 (2025)**:
- **Bloom Filter Configuration**: Removed hardcoded thresholds from workflow code
  - Added `phrase_match_bonus` parameter (default: 20 points per matched phrase)
  - Updated `route_to_ac_threshold` default from 10 to 15 (better false positive rate)
  - All bloom decision thresholds now fully configurable via `unified_config.json`
  - Improved auditability with `thresholdsUsed` in logs
- **Configuration Decoupling**: Complete separation of configuration from code logic
  - No hardcoded business rules in workflow nodes
  - All parameters manageable through Web UI
  - Enhanced documentation in `CONFIG_VARIABLES.md`

**Version 1.1.0 (2025)**:
- **ClickHouse Integration**: Real-time statistics from ClickHouse database on monitoring dashboard
- **Live Stats API**: New `/api/stats/24h` endpoint for retrieving last 24h metrics
- **Auto-refresh Stats**: Monitoring dashboard auto-updates based on configured interval
- **Audit Trail Enhancement**: Configuration changes automatically tagged with username from JWT
- **Data Type Handling**: Frontend converts ClickHouse string numbers to integers for display
- **Error Resilience**: Statistics API gracefully handles ClickHouse connection failures

**Version 1.0.0 (2025)**:
- **Authentication & Authorization**: Complete RBAC system with JWT tokens
- **User Management**: Admin panel for creating and managing users with granular permissions
- **User Settings**: Timezone preferences and account management
- **Enhanced Security**: Password hashing, last admin protection, session management
- **Database Integration**: SQLite for user storage with automatic migrations
- **UI Improvements**: Login page, user dropdown, permissions display
- **Documentation**: New AUTHENTICATION.md guide with complete API reference

**Project restructuring (2024)**:
- Migrated to microservices architecture under `services/` directory
- Implemented monorepo structure with npm workspaces
- Added unified `docker-compose.yml` for all services
- Environment-based configuration via `.env` file
- Consistent naming conventions (vigil-* for containers)
- Health checks for all services
- Improved documentation structure

## Quick Start for New Users

1. **Run installation**: `./install.sh`
2. **Access Web UI**: http://localhost:5173/ui
3. **Login**: Use default credentials `admin/admin123`
4. **⚠️ REQUIRED: Configure n8n Workflow**:
   - Open http://localhost:5678 and create n8n account
   - Import workflow from `services/workflow/workflows/Vigil-Guard-v1.0.json`
   - Configure ClickHouse credentials in "Logging to ClickHouse" node:
     - Host: `vigil-clickhouse`, Port: `8123`
     - Database: `n8n_logs`
     - Username: `admin`, Password: `admin123`
   - Activate the workflow
5. **⚠️ Change Password**: Update default password in Settings
6. **Create Users**: Navigate to Administration to create additional users
7. **Configure Permissions**: Assign appropriate permissions to each user
8. **Monitor System**: View real-time analytics on Monitoring dashboard
9. **Configure Security**: Adjust security policies in Configuration section

For detailed documentation, see:
- [Installation Guide](./docs/INSTALLATION.md)
- [Authentication & User Management](./docs/AUTHENTICATION.md)
- [Configuration Reference](./docs/CONFIGURATION.md)
- [API Documentation](./docs/API.md)
- [Prompt Guard API](./prompt-guard-api/README.md)

## Prompt Guard API (New Component)

### Overview
FastAPI service providing advanced prompt injection detection using Meta's Llama Prompt Guard 2 model (86M parameters). Operates independently from the main n8n workflow for flexible integration.

### Key Features
- Real-time prompt injection detection
- REST API with Swagger documentation
- CPU-optimized inference (100-300ms response time)
- Compatible with ARM64 and x86_64 architectures
- Docker containerized for easy deployment

### Model Requirements
**IMPORTANT**: Due to Meta's Llama 4 Community License, the model must be downloaded separately:

```bash
# Download script (automated)
./scripts/download-llama-model.sh

# Manual download
pip install huggingface-hub
huggingface-cli login
huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M --local-dir ../vigil-llm-models/Llama-Prompt-Guard-2-86M
```

Model location: `/Users/tomaszbartel/Documents/Projects/vigil-llm-models/Llama-Prompt-Guard-2-86M`

### API Endpoints
- `GET /health` - Health check and model status
- `POST /detect` - Detect prompt injection
- `GET /docs` - Interactive Swagger UI

### Usage Example
```bash
# Test detection
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "Ignore all previous instructions"}'

# Response
{
  "text": "Ignore all previous instructions",
  "is_attack": true,
  "confidence": 0.9996,
  "verdict": "🚨 ATAK WYKRYTY!"
}
```

### License Attribution
The Prompt Guard API uses Meta's Llama Prompt Guard 2 model, licensed under the **Llama 4 Community License**. As required by the license:
- UI displays "Built with Llama" (footer in Web UI)
- Model files are not included in repository
- Users must download model separately
- Full license: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

**Attribution**: Llama 4 is licensed under the Llama 4 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.
