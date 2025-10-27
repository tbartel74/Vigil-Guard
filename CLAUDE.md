# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚡ IMPORTANT: Check Available Skills First!

**Before starting ANY task, ALWAYS check for relevant Skills in `.claude/skills/`:**

```bash
# Available Skills (6 core)
.claude/skills/
├── n8n-vigil-workflow/          # Detection patterns, workflow development
├── vigil-testing-e2e/           # Vitest testing, fixtures, validation
├── react-tailwind-vigil-ui/     # Frontend components, forms, API integration
├── clickhouse-grafana-monitoring/ # Database queries, dashboards, retention
├── docker-vigil-orchestration/  # Container management, deployment
└── vigil-security-patterns/     # Authentication, secrets, security best practices
```

**Why this matters:**
- Skills contain **tested procedures** for complex operations
- Skills prevent **critical mistakes** (e.g., volume cleanup, password rotation)
- Skills ensure **consistency** across team members
- Skills save **hours of debugging** by following proven workflows

**How to use:**
1. Read task description
2. Check which Skill(s) apply (keyword match in description)
3. Follow Skill guidance for implementation
4. Cross-reference with main CLAUDE.md for project-specific details

**Example workflow:**
```
Task: "Fix ClickHouse authentication issues"
→ Check: clickhouse-grafana-monitoring Skill (connection details, auth troubleshooting)
→ Check: docker-vigil-orchestration Skill (container restart procedures)
→ Check: vigil-security-patterns Skill (password rotation, secret management)
→ Execute with guidance from all 3 Skills
```

## Project Directories

**Main Repository**: `/Users/tomaszbartel/Documents/Projects/Vigil-Guard`
**Archive Directory**: `/Users/tomaszbartel/Documents/Projects/vigil-misc`

When the user says "przenies do archiwum" (move to archive), move completed/obsolete files to the archive directory while maintaining project organization.

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

## IMPORTANT: Documentation Synchronization Policy

⚠️ **CRITICAL: ALWAYS UPDATE DOCUMENTATION AFTER CODE CHANGES**

After **ANY** code change (bug fix, new feature, variable rename, configuration update, API modification), you **MUST**:

1. **Search for documentation impact**:
   ```bash
   # Check if change affects any documentation
   grep -r "changed_feature_name" docs/
   grep -r "old_variable_name" docs/ services/web-ui/frontend/public/docs/
   ```

2. **Update all affected documentation files**:
   - `docs/` - Main documentation (INSTALLATION.md, CONFIGURATION.md, API.md, SECURITY.md, etc.)
   - `services/web-ui/frontend/public/docs/` - GUI help system (must mirror `docs/`)
   - `README.md` - Project overview and quick start
   - `CLAUDE.md` - This file (architecture, commands, policies)
   - `TODO.md` - Task status if completing tracked items

3. **Common change types requiring documentation updates**:
   - **New feature**: Add to relevant guide (USER_GUIDE.md, API.md)
   - **Configuration variable**: Update CONFIGURATION.md with spec, defaults, ranges
   - **API endpoint**: Update API.md with request/response examples
   - **Environment variable**: Update INSTALLATION.md and config/.env.example
   - **Security change**: Update SECURITY.md with new policies/procedures
   - **Default value change**: Update all references in docs/ and README.md
   - **Deprecated feature**: Mark as deprecated, add migration guide
   - **Docker image update**: Update version numbers in all references

4. **Verification checklist**:
   - [ ] All code references in docs match actual implementation
   - [ ] All examples are tested and working
   - [ ] All default values match code
   - [ ] GUI help system (`services/web-ui/frontend/public/docs/`) updated
   - [ ] No stale screenshots or outdated version numbers
   - [ ] Related cross-references updated (e.g., "See CONFIGURATION.md" links)

5. **Documentation consistency audit**:
   - Before committing, run mental checklist: "Does this change affect any documentation?"
   - If unsure, search docs for related terms
   - Better to over-document than under-document

**Why this matters:**
Documentation drift creates confusion, support burden, and security risks. Keeping documentation synchronized with code is **NOT OPTIONAL** - it's a critical part of the development workflow.

**Example workflow:**
```bash
# 1. Make code change
vim services/web-ui/backend/src/server.ts  # Add new /api/stats/summary endpoint

# 2. Search for documentation impact
grep -r "/api/stats" docs/

# 3. Update found documentation
vim docs/API.md  # Add new endpoint documentation

# 4. Update GUI help system
cp docs/API.md services/web-ui/frontend/public/docs/API.md

# 5. Commit both code and docs together
git add services/web-ui/backend/src/server.ts docs/API.md services/web-ui/frontend/public/docs/API.md
git commit -m "feat(api): Add /api/stats/summary endpoint with aggregated metrics"
```

## Project Overview

Vigil Guard is a comprehensive security platform for protecting Large Language Model applications from prompt injection attacks and malicious content. The system consists of five main components:

1. **n8n Workflow Pipeline** - Sequential sanitizer processing requests in real-time
2. **Web UI** - React/Express web interface with authentication, user management, configuration, and monitoring
3. **Monitoring Stack** - ClickHouse + Grafana for analytics and dashboards
4. **Prompt Guard API** - FastAPI service using Meta's Llama Prompt Guard 2 for advanced prompt injection detection
5. **Browser Extension** - Chrome plugin for real-time client-side protection (ChatGPT, Claude.ai)

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

### ⚠️ REVERSE PROXY ARCHITECTURE (CRITICAL - READ FIRST!)

**IMPORTANT: All services are accessed through Caddy reverse proxy on port 80!**

Caddy is the main entry point for the entire Vigil Guard system:

```
Client (Browser)
    ↓
Caddy (:80) - Main reverse proxy
    ├─→ /ui/*       → web-ui-frontend:80 (nginx) [uri strip_prefix /ui]
    ├─→ /ui/api/*   → web-ui-backend:8787 [uri strip_prefix /ui]
    ├─→ /n8n/*      → n8n:5678
    ├─→ /grafana/*  → grafana:3000
    └─→ /clickhouse/* → clickhouse:8123
```

**Critical Configuration Details:**

1. **Caddy strips URL prefixes** before proxying:
   - Request: `http://localhost/ui/dashboard`
   - Caddy strips `/ui` → proxies as `GET /dashboard`
   - Nginx receives: `GET /dashboard` (NOT `/ui/dashboard`)

2. **Web UI Deployment Stack**:
   ```
   Client → Caddy (:80)
          ↓ [uri strip_prefix /ui]
          → Nginx (:80 internal)
          → React SPA (Vite build with base: "/ui/")
   ```

3. **Common Pitfalls When Modifying Web UI**:
   - ❌ DO NOT configure nginx to expect `/ui/` prefix
   - ❌ DO NOT add nginx location blocks for `/ui/`
   - ❌ DO NOT use alias or rewrite rules in nginx for `/ui/`
   - ✅ Keep nginx simple: `location / { try_files $uri $uri/ /index.html; }`
   - ✅ Remember: Vite `base: "/ui/"` is for asset paths in HTML, NOT nginx routing

**Access Points (Production):**
- Web UI: http://localhost/ui/
- n8n: http://localhost/n8n/
- Grafana: http://localhost/grafana/
- ClickHouse: http://localhost/clickhouse/

**Direct Access (Development Only):**
- Web UI Frontend: http://localhost:5173/
- Web UI Backend: http://localhost:8787/api/
- n8n: http://localhost:5678/
- Grafana: http://localhost:3001/
- ClickHouse: http://localhost:8123/

For detailed Web UI deployment architecture, see `services/web-ui/CLAUDE.md`.

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

**Features**:
- JWT token-based auth with RBAC (3 permissions: monitoring, configuration, user management)
- SQLite database with bcrypt password hashing (12 rounds)
- Default credentials: admin/[auto-generated 32-char password] (displayed once in backend console)
- User CRUD operations, active/inactive status, forced password resets
- Timezone preferences, last admin protection

**Key API Endpoints**: `/api/auth/{login,logout,verify,change-password,settings,users}`

### Configuration Management System

The Web UI manages configuration through a unified variable mapping system:

**Configuration Files**: 6 files in `services/workflow/config/` (unified_config.json, thresholds.config.json, rules.config.json, allowlist.schema.json, normalize.conf, pii.conf)

**Backend**: Express API with JWT auth, SQLite, ClickHouse integration, file operations with ETag validation and path traversal protection

**Key API Endpoints**:
- Config: `/api/{files,parse,resolve,save}`
- Stats: `/api/stats/24h` (ClickHouse real-time metrics)
- Auth: `/api/auth/*` (see Authentication section)

**Frontend**: React SPA with protected routes (login, monitoring, config, administration, settings), AuthContext for state management, Grafana embeds

### Logging & Monitoring

**ClickHouse**: Database `n8n_logs` with 2 tables (events_raw, events_processed), partitioned by month, credentials auto-generated during `install.sh`

**Real-time Statistics**: Dashboard auto-refreshes every 30s, queries last 24h metrics (requests, threats blocked, sanitized)

**Grafana**: 6 panels (I/O table, TOP-10 categories, status distribution, block rate %, maliciousness trend, histogram)

### False Positive Monitoring System (Phase 3.4)

User feedback loop for tracking over-blocking:
- **Database**: `false_positive_reports` table with 2 views (summary, trends)
- **API**: `POST /api/feedback/false-positive`, `GET /api/feedback/stats`
- **UI**: Report button in PromptAnalyzer (BLOCKED/SANITIZED events only), dashboard stats panel
- **Grafana**: 7 panels with reason distribution and temporal trends

### Configuration Versioning & Rollback System (Phase 3.3)

Git-like version control for configuration changes:
- **Automatic versioning**: Every save creates backup (max 50 versions, auto-pruning, tag format: `YYYYMMDD_HHMMSS-username`)
- **API**: `GET /api/config-versions`, `GET /api/config-version/:tag`, `POST /api/config-rollback/:tag`
- **UI**: VersionHistoryModal in Configuration section with rollback confirmation dialog
- **Safety**: Pre-rollback backups, ETag validation, atomic writes, author tracking, permission checks

### Data Retention Policy (Phase 3)

Automatic data cleanup to prevent unbounded disk usage growth:
- **TTL (Time To Live)**: ClickHouse automatic deletion at table level
  - `events_raw`: 90 days (debug data, raw inputs)
  - `events_processed`: 365 days (full analysis data)
- **Retention Config Table**: Single-row `n8n_logs.retention_config` table stores policy settings
- **Backend API**: `/api/retention/*` endpoints for configuration management
  - `GET /api/retention/config` - Get current retention config
  - `PUT /api/retention/config` - Update TTL days (1-3650 range)
  - `GET /api/retention/disk-usage` - System and table-level disk metrics
  - `POST /api/retention/cleanup` - Force immediate cleanup (OPTIMIZE TABLE FINAL)
- **Frontend GUI**: Configuration → System → Data Retention (`/config/retention`)
  - System disk usage overview with color-coded thresholds (green/yellow/red)
  - Per-table statistics (rows, size, compression ratio, partitions)
  - Editable TTL days with validation
  - Warning/critical threshold configuration (default: 80%/90%)
  - Manual force cleanup button
- **Grafana Dashboard**: "ClickHouse Disk Usage & Retention" (UID: `clickhouse-disk-usage-001`)
  - System disk usage gauge
  - Table sizes over time (time series)
  - Active partitions count
  - Compression ratio monitoring
  - Table statistics summary
- **Estimated Size**: ~10-20 GB/year @ 5,000 prompts/day (see `clickhouse_retention_study.md`)
- **TTL Behavior**:
  - Checks every hour (`merge_with_ttl_timeout_seconds = 3600`)
  - Deletes during background merge operations
  - Drops whole partitions for efficiency (`ttl_only_drop_parts = 1`)
- **Audit Trail**: All changes logged in `retention_config.last_modified_by`
- **Documentation**: `docs/CLICKHOUSE_RETENTION.md`

## Security Considerations

**Authentication & Authorization**:
- JWT tokens on all protected routes with RBAC (3 permissions)
- **JWT_SECRET enforcement**: MUST be set in .env, minimum 32 characters, no fallback (OWASP ASVS V2.1)
- **Token acceptance**: ONLY from Authorization header or httpOnly cookie (never query/body params)
- **Rate limiting**: Brute force protection on authentication endpoints
  - Login: 5 attempts per 15 minutes
  - Password change: 3 attempts per 15 minutes
  - Returns HTTP 429 when limit exceeded
- Bcrypt password hashing with 12 rounds (OWASP recommendation, enforced in all user routes)
- Last admin protection, auto-logout on expiration

**Secret Management**:
- **Docker Compose**: All secrets enforce .env file (CLICKHOUSE_PASSWORD, GF_SECURITY_ADMIN_PASSWORD, JWT_SECRET, SESSION_SECRET)
- **No default passwords**: Application fails immediately if secrets missing
- **Auto-generation**: install.sh generates all secrets using openssl (min 32-48 chars)

**Input Validation**:
- Path traversal protection (alphanumeric + safe chars)
- SQL injection prevention (parameterized queries)
- ETag concurrency control

**Data Protection**:
- Secret masking in UI (`a***z`)
- CORS policy (`http://localhost` any port)
- Secure session management (localStorage)

**Config Directory**: Default `/Users/tomaszbartel/Documents/n8n-data/config_sanitizer` (override via `TARGET_DIR`)

## Detection Categories

30+ categories in `rules.config.json` with base_weight (0-100) and multiplier. Score mapping: 0-29 ALLOW, 30-64 SANITIZE_LIGHT, 65-84 SANITIZE_HEAVY, 85-100 BLOCK.

**Critical Categories**: SQL_XSS_ATTACKS (50×1.3=65), PRIVILEGE_ESCALATION (55×1.5=82.5), COMMAND_INJECTION (50×1.4=70), ENCODING_SUSPICIOUS (30×1.2=36), GODMODE_JAILBREAK (40×1.5=60)

**Recent**: SQL_XSS upgraded 30→50 base_weight, +24 patterns (XSS event handlers, SQL functions, DOM manipulation). See `docs/DETECTION_CATEGORIES.md`.

**Note**: Categories hardcoded in `rules.config.json`, only thresholds user-configurable.

## Variable Groups

Configuration variables organized into 5 groups (from `CONFIG_VARIABLES.md`):

1. **Quick Settings** - Test mode, logging, block messages
2. **Detection Tuning** - Scoring algorithms, thresholds, bloom filter
3. **Performance** - Timeouts, caching, input limits
4. **Advanced** - Normalization (NFKC), sanitization policies, n-grams
5. **LLM Integration** - Prompt Guard external validation

## Common Patterns

**Variable Mapping**: JSON dot-notation (`bloom_filter.enabled`), CONF section/key (`[detection]/scoring_algorithm`)

**Config Updates**: `/api/resolve` → parse files → edit UI → `/api/save` (with username) → atomic update + ETag → auto audit trail

**n8n Nodes** (13 Code nodes): PII_Redactor → Normalize_Node (encoding detection) → Bloom_Prefilter → Pattern_Matching_Engine (regex + encoding bonus) → Unified Decision → Correlation_Engine → Sanitization_Enforcement → Finale Decision

**Encoding Bonus** (2025-10-18): Normalize_Node detects layers → Pattern_Matching adds +45 base64, +30 URL, +35 hex per layer → logs as `scoreBreakdown.ENCODING_DETECTED`

## Docker Network

All services communicate via `vigil-network` external network. Ensure network exists:
```bash
docker network create vigil-network
```

## Troubleshooting

**Ports**: n8n:5678, Web UI:5173/8787, Grafana:3001, ClickHouse:8123/9000

**ClickHouse Issues**: Check credentials in `.env` file, verify container running, confirm SQL scripts mounted, convert string→number in frontend

**Config Locations**: Workflow: `services/workflow/config/*.{json,conf}`, Specs: `services/web-ui/frontend/src/spec/variables.json`, Docs: `./docs/`

**Grafana**: Requires `GF_SECURITY_ALLOW_EMBEDDING=true`

## Recent Improvements

**Version 1.4.0 (2025-10-20)** - CURRENT:
- **CRITICAL FIX: Sanitization System Rewrite**
  - Fixed broken sanitization - system now removes detected malicious patterns
  - Sanitization uses same patterns from Pattern_Matching_Engine (not hardcoded subset)
  - SANITIZE_LIGHT: Removes LOW/MEDIUM severity patterns (10 categories)
  - SANITIZE_HEAVY: Removes ALL detected patterns (33 categories)
  - Sanitized output now actually clean (before: identical to input despite SANITIZED status)
- **Investigation Panel** - Advanced prompt search interface
  - Full-text search in original prompts (before sanitization)
  - Multi-criteria filtering: date range, status, threat score, categories
  - Sortable results table with pagination
  - CSV/JSON export functionality
  - Detailed event inspection with decision breakdown
  - Real-time search with 365+ event support
- **Search Engine Fix**: ClickHouse queries use `original_input` column (not JSON extraction)
- **Security Enhancement**: Removed hardcoded ClickHouse passwords from codebase
  - Password auto-generated during `install.sh` (32-char random)
  - Stored securely in `.env` file
  - Documentation updated to reference `.env` instead of showing passwords
- **Workflow Version**: Upgraded to v1.4.json (v1.3 archived)
- **Backend Stability**: Added Python deps to Dockerfile for better-sqlite3 compilation

**Earlier Versions (1.0.0 - 1.3.0)**:
- **v1.3.0**: Responsive mobile-first UI (768px breakpoint), WCAG modal accessibility, Design System with semantic tokens and reusable components (Button, Card)
- **v1.2.0**: Bloom filter configuration decoupling, all thresholds moved from code to unified_config.json
- **v1.1.0**: ClickHouse integration with live stats API, auto-refresh dashboard, audit trail with username tracking
- **v1.0.0**: Complete RBAC authentication system, JWT tokens, user management panel, SQLite database
- **2024**: Microservices architecture migration, monorepo with npm workspaces, unified docker-compose.yml

## Quick Start for New Users

1. `./install.sh` → **Save password from install output** (displayed with other credentials) → Access Web UI at http://localhost/ui → Login: `admin/<password-from-install>` → Complete forced password change
2. **⚠️ Configure n8n**: http://localhost:5678 → Import `services/workflow/workflows/Vigil-Guard-v1.4.json` → Set ClickHouse credentials (host:vigil-clickhouse, port:8123, db:n8n_logs, user:admin, pass:[from .env]) → Activate workflow
3. Create users in Administration, configure permissions, monitor dashboard, adjust security policies

**Docs**: `docs/{INSTALLATION,AUTHENTICATION,CONFIGURATION,API}.md`, `prompt-guard-api/README.md`

## Prompt Guard API (New Component)

FastAPI service using Meta's Llama Prompt Guard 2 (86M params) for advanced prompt injection detection. Operates independently from n8n workflow.

**Features**: REST API with Swagger docs, CPU-optimized (100-300ms), ARM64/x86_64 compatible, Docker containerized

**Model Download** (required - Llama 4 Community License):
```bash
./scripts/download-llama-model.sh  # Automated
# Model location: /Users/tomaszbartel/Documents/Projects/vigil-llm-models/Llama-Prompt-Guard-2-86M
```

**API Endpoints**: `GET /health`, `POST /detect`, `GET /docs`

**License**: Llama 4 Community License (Copyright © Meta Platforms, Inc.). UI displays "Built with Llama", model files not in repo.

## Browser Extension (Client-Side Component)

Chrome extension (v0.3.0 Beta) providing real-time protection for ChatGPT/Claude.ai. Not in git (confidential).

**Architecture**: Overlay Proxy (primary) + Request Interceptor (backup)
- Intercepts Enter key + Send button click with MutationObserver
- 3-layer filtering: 90% Layer 1 → 5% Layer 2 → 3% Layer 3 → only 1-2% webhook calls
- Fail-open design, visual status indicator (green/yellow/red)

**Installation**: `chrome://extensions/` → Load unpacked → `plugin/Chrome` → Configure webhook URL

**Configuration**: Default endpoint `http://localhost/ui/api/browser-filter`, modes: monitor/sanitize/block, cache enabled (5min)

**Performance**: 50-200ms latency (local), ~10-20 MB memory, <1% CPU idle

**Browser Support**: Chrome ✅, Edge ✅, Firefox 🚧, Safari ❌

**Integration**: `Browser → n8n Webhook → Vigil Guard v1.4.0+ Workflow → Response (<500ms local)`

**Docs**: `plugin/{README.md,Chrome/docs/HYBRID_ARCHITECTURE.md,QUICK_START.md,DEVELOPMENT_PLAN.md}`

## Claude Code Skills Ecosystem

This project includes a comprehensive Skills system to accelerate development with context-aware guidance.

### Available Skills (6 Core)

Skills are located in `.claude/skills/` and provide specialized expertise:

1. **n8n-vigil-workflow** - Workflow development, detection patterns, sanitization
   - Use when: Adding detection patterns, configuring thresholds, working with rules.config.json
   - Triggers: "detection pattern", "workflow", "n8n", "sanitization"

2. **vigil-testing-e2e** - Vitest testing framework with 58+ tests
   - Use when: Writing tests, debugging failures, managing fixtures, validating patterns
   - Triggers: "test", "vitest", "fixture", "bypass scenario", "false positive"

3. **react-tailwind-vigil-ui** - React + Vite + Tailwind CSS frontend
   - Use when: Building components, API integration, authentication, forms, routing
   - Triggers: "React", "component", "form", "UI", "authentication", "ETag"

4. **clickhouse-grafana-monitoring** - Analytics and dashboards
   - Use when: Querying logs, creating dashboards, analyzing metrics, investigating events
   - Triggers: "ClickHouse", "Grafana", "query", "logs", "analytics", "dashboard"

5. **docker-vigil-orchestration** - Container management
   - Use when: Deploying services, managing Docker network, troubleshooting containers
   - Triggers: "Docker", "docker-compose", "deploy", "container", "vigil-network"

6. **vigil-security-patterns** - Security best practices
   - Use when: Implementing auth, handling secrets, input validation, preventing injection
   - Triggers: "security", "authentication", "password", "CORS", "injection", "RBAC"

### Custom Commands (4 Workflows)

Slash commands for common tasks (`.claude/commands/`):

- `/add-detection-pattern [name]` - TDD workflow for new patterns
- `/run-full-test-suite` - Execute all tests with health checks
- `/commit-with-validation` - Pre-commit checks and git commit
- `/deploy-service [name]` - Deploy with health verification

### How Skills Work

**3-Layer Progressive Context Loading:**
- **Layer 1**: Metadata (YAML frontmatter) - Always loaded, enables discovery
- **Layer 2**: SKILL.md body - Loaded when Skill triggers
- **Layer 3**: Supporting files (docs/, examples/, scripts/) - Accessed on-demand

**Composability:** Multiple Skills can activate together for complex tasks.

Example: "Add SQL injection pattern and test it"
- Activates: `n8n-vigil-workflow` + `vigil-testing-e2e`
- Provides: Pattern configuration + Test creation workflow

### Using Skills

**Automatic Discovery:**
Skills activate automatically based on query keywords:
```
"How do I add a detection pattern?"
→ Activates: n8n-vigil-workflow

"Run tests for bypass scenarios"
→ Activates: vigil-testing-e2e

"Create a configuration form"
→ Activates: react-tailwind-vigil-ui
```

**Check Loaded Skills:**
```
/status
```

**List Commands:**
```
/
```

### Benefits

- **Faster Development**: 20-30% productivity improvement
- **Consistent Quality**: Best practices embedded in workflows
- **Reduced Errors**: TDD and validation built into commands
- **Better Onboarding**: New developers productive in hours, not days
- **No Context Limits**: Progressive loading prevents token overflow

### Skills File Structure

```
.claude/
├── skills/
│   ├── n8n-vigil-workflow/
│   │   ├── SKILL.md                  # Core guidance
│   │   ├── docs/
│   │   │   └── detection-categories.md
│   │   ├── examples/
│   │   │   └── add-pattern-example.json
│   │   └── scripts/
│   │       └── validate-pattern.sh
│   ├── vigil-testing-e2e/
│   ├── react-tailwind-vigil-ui/
│   ├── clickhouse-grafana-monitoring/
│   ├── docker-vigil-orchestration/
│   └── vigil-security-patterns/
└── commands/
    ├── add-detection-pattern.md
    ├── run-full-test-suite.md
    ├── commit-with-validation.md
    └── deploy-service.md
```

### Skill Integration Examples

**Example 1: Adding Detection Pattern**
```
User: "Add emoji obfuscation detection"
Skills Activated: n8n-vigil-workflow + vigil-testing-e2e
Workflow:
1. Create test fixture (vigil-testing-e2e)
2. Add test case (vigil-testing-e2e)
3. Run test - should fail (vigil-testing-e2e)
4. Add pattern via GUI (n8n-vigil-workflow)
5. Verify test passes (vigil-testing-e2e)
6. Use /commit-with-validation
```

**Example 2: Troubleshooting Service**
```
User: "ClickHouse container won't start"
Skills Activated: docker-vigil-orchestration + clickhouse-grafana-monitoring
Guidance:
1. Check Docker logs (docker-vigil-orchestration)
2. Verify network (docker-vigil-orchestration)
3. Test connection (clickhouse-grafana-monitoring)
4. Verify credentials (clickhouse-grafana-monitoring)
```

**Example 3: Building Configuration UI**
```
User: "Create form for threshold configuration"
Skills Activated: react-tailwind-vigil-ui + n8n-vigil-workflow
Guidance:
1. Understand thresholds (n8n-vigil-workflow)
2. Create form component (react-tailwind-vigil-ui)
3. API integration with ETag (react-tailwind-vigil-ui)
4. Test configuration changes (n8n-vigil-workflow)
```

### Maintaining Skills

**Update Skills When:**
- Adding new features or patterns
- Discovering better practices
- Finding common errors/solutions
- New workflows emerge

**Version Control:**
Skills are git-committed and team-shareable:
```bash
git add .claude/
git commit -m "docs(skills): Update detection pattern workflow"
```

**Testing Skills:**
Verify discovery by asking questions that should trigger specific Skills.
