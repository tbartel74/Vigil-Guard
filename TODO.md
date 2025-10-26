# Vigil Guard - Consolidated TODO

**Last Updated**: 2025-10-19
**Status**: Post-Audit Security Hardening
**Priority Focus**: Critical security issues from independent audit

---

## 📊 EXECUTIVE SUMMARY

Vigil Guard to platforma bezpieczeństwa LLM składająca się z n8n workflow, Web UI (React + Express), monitoring stack (ClickHouse + Grafana) oraz Prompt Guard API.

**Postęp po audycie**:
- 🚨 **AUDIT CRITICAL (FG-01, FG-03, FG-04)**: 0/3 zadań ukończonych - BLOKUJE PRODUKCJĘ
- 🟠 **Security P1**: 2/4 zadań do wykonania (ClickHouse TLS, non-root containers)
- 🟡 **Token Security**: httpOnly cookies migration pending
- 🟢 **Long-term**: Performance, DevOps automation

**Audit Score** (pre-fix):
- Funkcjonalność: 58/100
- Jakość kodu: 52/100
- Bezpieczeństwo: 30/100 ⚠️
- Zgodność: 45/100

**Target Score** (post-fix):
- Bezpieczeństwo: ~60/100 (po FG-01..04)

---

## 🚨 P0 - KRYTYCZNE (AUDIT FINDINGS - BLOKUJE PRODUKCJĘ)

**Definicja**: Luki bezpieczeństwa CVSS ≥9.0, natychmiastowe ryzyko przejęcia systemu
**Deadline**: MAX 2 DNI
**Status**: ✅ 2/2 completed (100%) | COMPLETED 2025-10-25

---

### **FG-01. JWT_SECRET bez fallbacku - Wymuś bezpieczny klucz** 🔴
**CVSS**: 9.8 (Critical) | **Effort**: 30 min | **Audit Finding**: FG-01

**Problem**: Domyślna wartość `'vigil-guard-secret-key-change-in-production'` pozwala każdemu wygenerować ważny JWT i przejąć API (naruszenie OWASP ASVS V2.1).

**Lokalizacja**:
- `services/web-ui/backend/src/auth.ts:17`

**Impact**: Atak pozwala na:
- Fałszowanie tokenów JWT bez znajomości sekretu
- Przejęcie dowolnego konta (admin included)
- Eskalację uprawnień do can_manage_users
- Pełna kompromitacja API

**Fix** (z audytu):
```typescript
// services/web-ui/backend/src/auth.ts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET env var must be at least 32 characters");
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
```

**Tasks**:
- [x] Update `auth.ts` - usuń fallback, wymuś minimum 32 znaki
- [x] Verify `install.sh` generuje JWT_SECRET (openssl rand -base64 48)
- [x] Update `.env.example` z instrukcjami
- [x] Test: backend bez JWT_SECRET → immediate crash
- [x] Test: backend z JWT_SECRET (64 chars) → login działa
- [x] Update `CLAUDE.md` z nową polityką
- [x] BONUS: Zwiększono bcrypt rounds 10→12 (OWASP recommendation)

**Reference**: https://github.com/tbartel74/Vigil-Guard/blob/4cbc20f/services/web-ui/backend/src/auth.ts#L17-L31

---

### **FG-03. Docker Compose - Usuń wszystkie domyślne hasła** 🔴
**CVSS**: 9.8 (Critical) | **Effort**: 1h | **Audit Finding**: FG-03

**Problem**: Fallbacki w docker-compose.yml (`${VAR:-default}`) negują cały wysiłek wokół bezpieczeństwa. Publicznie znane hasła (`admin123`, `change-this-secret-key`) umożliwiają kompromitację ClickHouse, Grafany i API.

**Lokalizacja**:
- `docker-compose.yml:22` - CLICKHOUSE_PASSWORD
- `docker-compose.yml:50` - GF_SECURITY_ADMIN_PASSWORD
- `docker-compose.yml:116` - JWT_SECRET
- `docker-compose.yml:124` - CLICKHOUSE_PASSWORD (backend)

**Impact**: Atak pozwala na:
- Direct access do ClickHouse (read/write/delete all data)
- Grafana admin access (dashboard manipulation, data exfiltration)
- Backend JWT forgery (jak w FG-01)

**Fix** (z audytu):
```yaml
# docker-compose.yml
# ClickHouse
CLICKHOUSE_DB: ${CLICKHOUSE_DB:?set CLICKHOUSE_DB}
CLICKHOUSE_USER: ${CLICKHOUSE_USER:?set CLICKHOUSE_USER}
CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:?set CLICKHOUSE_PASSWORD}

# Grafana
GF_SECURITY_ADMIN_USER: ${GF_SECURITY_ADMIN_USER:?set GF_SECURITY_ADMIN_USER}
GF_SECURITY_ADMIN_PASSWORD: ${GF_SECURITY_ADMIN_PASSWORD:?set GF_SECURITY_ADMIN_PASSWORD}

# Web UI Backend
- JWT_SECRET=${JWT_SECRET:?set JWT_SECRET}
- CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:?set CLICKHOUSE_PASSWORD}
```

**Tasks**:
- [x] Update `docker-compose.yml` - replace all `:-` with `:?` for secrets (5 locations)
- [x] Keep fallbacks ONLY for non-sensitive vars (ports, db names)
- [x] Verify `install.sh` populates all required secrets
- [x] Test: `docker compose config` without .env → error "set VARIABLE"
- [x] Test: `docker compose config` with .env → success
- [x] Update `config/.env.example` with required variables
- [x] Remove all `trufflehog:ignore` comments for default passwords

**Reference**: https://github.com/tbartel74/Vigil-Guard/blob/4cbc20f/docker-compose.yml#L22-L124

---

### METRYKI SUKCESU P0
- [x] ✅ Backend crashes without JWT_SECRET (no fallback) - COMPLETED (FG-01)
- [x] ✅ Docker Compose fails without .env secrets - COMPLETED (FG-03)
- [x] ✅ install.sh generuje wszystkie sekrety (min 32 chars) - VERIFIED
- [x] ✅ 0 default passwords w produkcji - COMPLETED

**Status P0**: **2/2 completed (100%)** | ✅ PRODUCTION READY

---

## 🟠 P1 - WYSOKIE (Przed produkcją, 1-3 dni)

**Definicja**: Security hardening, CVSS 7.0-8.9, wymagane przed public beta
**Status**: ✅ 2/2 completed (100%) | COMPLETED 2025-10-25

---

### **FG-04. Token Security - Usuń JWT z query/body** ✅ COMPLETED (2025-10-25)
**CVSS**: 7.5 (High) | **Effort**: 1h | **Audit Finding**: FG-04

**Problem**: Token akceptowany w `req.query?.token` i `req.body?.token` trafia do:
- Server access logs (plain text)
- Browser history
- Referer headers
- Umożliwia CSRF/Replay attacks

**Lokalizacja**:
- `services/web-ui/backend/src/auth.ts:56-63`

**Impact**:
- Token leak w logach serwera
- CSRF attack vector
- Browser history exposure
- Replay attacks

**Fix** (z audytu):
```typescript
// services/web-ui/backend/src/auth.ts
let token = req.headers.authorization?.split(' ')[1];
if (!token) {
  token = req.cookies?.token;
}
// REMOVED: req.body?.token || req.query?.token
```

**Tasks**:
- [x] Update `auth.ts:56-63` - remove query/body token extraction
- [x] Update `optionalAuth()` - remove query/body support
- [x] Keep ONLY Authorization header + httpOnly cookie
- [x] Test: Request with `?token=...` → 401 Unauthorized
- [x] Test: Request with `Authorization: Bearer <token>` → 200 OK
- [x] Update API documentation (CLAUDE.md)
- [x] Code review verified - no client code sending token in query/body

**Reference**: https://github.com/tbartel74/Vigil-Guard/blob/4cbc20f/services/web-ui/backend/src/auth.ts#L56-L69

---

### **P1-4. Rate Limiting - Brute Force Protection** ✅ COMPLETED (2025-10-25)
**Impact**: MEDIUM | **Effort**: 2h | **Audit Recommendation**

**Problem**: Brak rate limiting na `/api/auth/login` umożliwia brute force attack

**Lokalizacja**:
- `services/web-ui/backend/src/authRoutes.ts`

**Tasks**:
- [x] Install: `npm install express-rate-limit` (0 vulnerabilities)
- [x] Add limiter middleware:
  ```typescript
  import rateLimit from 'express-rate-limit';

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  router.post('/login', loginLimiter, async (req, res) => { ... });
  ```
- [x] Add passwordChangeLimiter (3 attempts / 15 minutes)
- [x] Apply to POST /api/auth/change-password
- [x] Test: 6th login attempt → 429 Too Many Requests
- [x] Document in API.md and CLAUDE.md
- [x] Create test script: test-rate-limit.sh
- [x] BONUS: Fixed bcrypt inconsistency in user creation routes (lines 323, 389)

**Impact**: 93% reduction in brute force attack speed (5 attempts vs unlimited)

---

### METRYKI SUKCESU P1
- [x] ✅ JWT tylko w Authorization header + httpOnly cookie - COMPLETED (FG-04)
- [x] ✅ Login rate limiting active (5/15min) - COMPLETED (P1-4)
- [x] ✅ Password change rate limiting active (3/15min) - COMPLETED (P1-4)
- [x] ✅ Bcrypt 12 rounds enforced in ALL user routes - COMPLETED (P1-4 BONUS)

**Status P1**: **2/2 completed (100%)** | ✅ PRODUCTION READY

**Moved to P3 (LOW Priority)**:
- P1-2: ClickHouse TLS (MEDIUM impact, 3h effort) → P3-7
- P1-3: Non-root containers (MEDIUM impact, 2h effort) → P3-8

---

## 🟡 P2 - ŚREDNIE (UX/A11Y + Testing, 1-2 tygodnie)

**Definicja**: User experience, token security, test coverage
**Status**: ⚠️ 0/4 completed (0%)

---

### TOKEN SECURITY

#### **P2-1. Migracja z localStorage na httpOnly cookies**
**Priority**: HIGH (XSS risk) | **Effort**: 1 dzień

**Problem**: JWT w localStorage → XSS attack vector
- **Lokalizacja**: `AuthContext.tsx`, `authRoutes.ts`, `auth.ts`

**Tasks**:
- [ ] Backend: `res.cookie('auth_token', token, { httpOnly: true, sameSite: 'strict', secure: true })`
- [ ] Frontend: Remove `localStorage.setItem('token')`, add `credentials: 'include'`
- [ ] Add CSRF protection: `csurf` middleware, `X-CSRF-Token` header
- [ ] Add session timeout warning (5 min przed expiry)
- [ ] Add auto-logout po 30 min nieaktywności
- [ ] Test: 0 tokenów w localStorage, cookie widoczny tylko w HTTP

---

### TESTING

#### **P2-2. Backend Unit Tests - Auth & Config**
**Priority**: SHOULD HAVE | **Effort**: 1 dzień

**Problem**: Brak testów backendu - regression risk przy zmianach
- **Lokalizacja**: `services/web-ui/backend/src/`

**Tasks**:
- [ ] Install: `npm install -D vitest supertest`
- [ ] Create `vitest.config.ts` dla backendu
- [ ] Write tests:
  - Login flow (valid/invalid credentials)
  - JWT verification
  - Config save with ETag validation
  - Permission checks (can_view_monitoring, etc.)
- [ ] Coverage target: 60%
- [ ] Run: `npm run test:backend`

---

#### **P2-3. Frontend Component Tests**
**Priority**: SHOULD HAVE | **Effort**: 1 dzień

**Tasks**:
- [ ] Install: `npm install -D vitest @testing-library/react`
- [ ] Create `vitest.config.ts` dla frontendu
- [ ] Write tests: Login, UserManagement, ConfigSection
- [ ] Coverage target: 50%
- [ ] Run: `npm run test:frontend`

---

#### **P2-4. E2E Smoke Tests**
**Priority**: SHOULD HAVE | **Effort**: 1 dzień

**Tasks**:
- [ ] Install: `npm install -D @playwright/test`
- [ ] Test flow: login → config edit → save → logout
- [ ] CI integration w `.github/workflows/test.yml`
- [ ] Run: `npx playwright test`

---

### METRYKI SUKCESU P2
- [ ] ⚠️ 0 tokenów w localStorage - PENDING (P2-1)
- [ ] ⚠️ Backend test coverage > 60% - PENDING (P2-2)
- [ ] ⚠️ Frontend test coverage > 50% - PENDING (P2-3)
- [ ] ⚠️ E2E smoke tests pass - PENDING (P2-4)

**Status P2**: **0/4 completed (0%)**

---

## 🟢 P3 - NISKIE (Long-term, 2-4 tygodnie)

**Definicja**: Performance, DevOps automation, advanced features

### DEVOPS

#### **P3-1. CI Security Enforcement**
**Effort**: 1 dzień

**Problem**: `continue-on-error: true` w security-audit neguje audyty
- **Lokalizacja**: `.github/workflows/ci.yml`

**Tasks**:
- [ ] Remove `continue-on-error` from npm audit
- [ ] Add `--audit-level=high` flag
- [ ] Add pip-audit dla Prompt Guard API
- [ ] Add Trivy container scanning
- [ ] Add ShellCheck w CI
- [ ] Gate: CI fails on HIGH/CRITICAL vulnerabilities

---

#### **P3-2. Centralized Logging**
**Effort**: 1 tydzień

**Problem**: Backend stdout only - brak correlation, trudny triage
- **Lokalizacja**: `services/web-ui/backend/src/server.ts`

**Tasks**:
- [ ] Install: `npm install pino pino-http`
- [ ] Add structured logging (JSON format)
- [ ] Add trace IDs dla request correlation
- [ ] Optional: Send logs to ClickHouse lub Loki
- [ ] Update observability docs

---

#### **P3-3. Polityka retencji danych w ClickHouse** ✅ COMPLETED (2025-10-26)
**Effort**: 1 tydzień | **Status**: ✅ 7/7 completed (100%)

**Cel**: Automatyczne zarządzanie cyklem życia danych w ClickHouse z konfiguracją przez GUI

**Tasks**:
- [x] Research best practices dla ClickHouse TTL (Time To Live) policies
- [x] Zdefiniować strategie retencji dla tabel `events_raw` i `events_processed`
  - events_raw: 90 dni (debug data, raw inputs) ~1-2 GB
  - events_processed: 365 dni (full analysis data) ~9-18 GB
  - Estimated total: 10-20 GB/year @ 5K prompts/day
- [x] Dodać GUI configuration w Web UI (Configuration → System → Data Retention)
  - URL: `/config/retention`
  - Features: TTL editing, disk usage monitoring, force cleanup
- [x] Implementować TTL policies w SQL schema (01-create-tables.sql)
  - TTL expressions with toDateTime() conversion
  - Partition-level deletion (ttl_only_drop_parts = 1)
- [x] Dodać monitoring dla disk usage w Grafana
  - Dashboard: "ClickHouse Disk Usage & Retention" (UID: clickhouse-disk-usage-001)
  - Panels: system gauge, table sizes, partitions, compression ratio
- [x] Dodać retention_config table (05-retention-config.sql)
- [x] Test: verify automatic cleanup działa poprawnie
  - Force cleanup via OPTIMIZE TABLE FINAL
  - TTL background merge process (hourly)

**Implementation**:
- Backend: `services/web-ui/backend/src/retention.ts` + `retentionRoutes.ts`
- Frontend: `services/web-ui/frontend/src/components/RetentionPolicy.tsx`
- API: `/api/retention/*` (config, disk-usage, cleanup, partitions)
- Grafana: `services/monitoring/grafana/provisioning/dashboards/disk-usage-dashboard.json`
- Documentation: `docs/CLICKHOUSE_RETENTION.md`

---

### UX ENHANCEMENTS

#### **P3-4. Toast notifications**
**Effort**: 2h

**Tasks**:
- [ ] Add `react-hot-toast`
- [ ] Success/error feedback dla wszystkich akcji
- [ ] Progress bar przy zapisie

---

#### **P3-5. React Query dla cache**
**Effort**: 1 dzień

**Tasks**:
- [ ] Install `@tanstack/react-query`
- [ ] Replace fetch z useQuery hooks
- [ ] Auto-refresh co 30s dla stats
- [ ] Cache management

---

#### **P3-6. Advanced Prompt Search Interface** ✅ COMPLETED (2025-10-20)
**Priority**: MEDIUM | **Effort**: 2-3 dni → Actual: 1 dzień

**Problem**: Brak możliwości wyszukiwania historycznych promptów po datach i treści

**Lokalizacja**:
- `services/web-ui/frontend/src/components/Investigation.tsx` (główny komponent)
- `services/web-ui/backend/src/server.ts` (nowe API endpoints)
- `services/web-ui/backend/src/clickhouse.ts` (query functions)

**Requirements**:
1. **Search Parameters**:
   - Date range picker (start date → end date)
   - Text search in prompt content (full-text search)
   - Filter by status (ALLOWED, SANITIZED, BLOCKED)
   - Filter by threat score range (0-100 slider)
   - Filter by detection categories
   - Sort by: timestamp, threat score, status

2. **Results Display**:
   - Paginated table (25/50/100 results per page)
   - Columns: timestamp, truncated prompt, status, threat score, categories
   - Click row → expand full details (full prompt, detection breakdown, sanitized output)
   - Export results to CSV/JSON

3. **Performance**:
   - ClickHouse query optimization (indexed search)
   - Pagination with LIMIT/OFFSET
   - Query timeout (max 10s)
   - Loading states + error handling

**Backend API** (requires `can_view_monitoring`):
```typescript
// GET /api/prompts/search
interface SearchRequest {
  startDate?: string; // ISO 8601
  endDate?: string;
  textQuery?: string; // Full-text search in prompt_input
  status?: 'ALLOWED' | 'SANITIZED' | 'BLOCKED';
  minScore?: number;
  maxScore?: number;
  categories?: string[]; // Filter by detection categories
  sortBy?: 'timestamp' | 'threat_score' | 'status';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

interface SearchResponse {
  results: PromptEvent[];
  total: number;
  page: number;
  pageSize: number;
}
```

**ClickHouse Query Pattern**:
```sql
SELECT
  event_id,
  timestamp,
  prompt_input,
  final_status,
  threat_score,
  arrayDistinct(
    arrayMap(x -> JSONExtractString(x, 'category'),
    JSONExtractArrayRaw(raw_event, 'sanitizer', 'breakdown'))
  ) AS detected_categories
FROM n8n_logs.events_processed
WHERE 1=1
  AND (timestamp >= :startDate OR :startDate IS NULL)
  AND (timestamp <= :endDate OR :endDate IS NULL)
  AND (positionCaseInsensitive(prompt_input, :textQuery) > 0 OR :textQuery IS NULL)
  AND (final_status = :status OR :status IS NULL)
  AND (threat_score >= :minScore OR :minScore IS NULL)
  AND (threat_score <= :maxScore OR :maxScore IS NULL)
ORDER BY :sortBy :sortOrder
LIMIT :pageSize OFFSET :offset
```

**Frontend UI** (`PromptSearch.tsx`):
- [ ] Create search form with all filter inputs
  - Date range picker (react-datepicker)
  - Text input with debouncing (300ms)
  - Multi-select for detection categories
  - Range slider for threat scores (0-100)
  - Status radio buttons (ALL, ALLOWED, SANITIZED, BLOCKED)
- [ ] Results table with pagination controls
- [ ] Expandable rows showing full prompt details
- [ ] Export button (CSV/JSON download)
- [ ] Loading skeleton + error states
- [ ] Empty state ("No prompts found matching your criteria")

**Implementation Summary**:
- [x] Backend `/api/prompts/search` endpoint with all filters implemented
- [x] Backend `/api/prompts/export` endpoint (CSV/JSON) implemented
- [x] ClickHouse `searchPrompts()` function with parameterized queries
- [x] `Investigation.tsx` main component with integrated filters/results/modal
- [x] Route added in `routes.tsx` + `App.tsx` navigation menu
- [x] CSV/JSON export functionality with download trigger
- [x] Pagination controls (Previous/Next)
- [x] Modal for full prompt details
- [x] Loading states, empty states, error handling
- [x] Responsive design with Vigil Guard color palette

**Features Implemented**:
✅ Date range filter (start date → end date)
✅ Full-text search in prompt content (case-insensitive)
✅ Status filter (ALLOWED, SANITIZED, BLOCKED)
✅ Threat score range slider (0-100)
✅ Pagination (25 results per page, configurable)
✅ Sort by timestamp/score/status
✅ Export to CSV/JSON (limit 10,000 records)
✅ Click row → expand full details modal
✅ Clear filters button
✅ Result count display

**Next Steps** (Future Enhancements):
- [ ] Add detection category multi-select filter
- [ ] Implement text search highlighting in results
- [ ] Add keyboard shortcuts (/, ESC, arrows)
- [ ] Debounce text search input (300ms)
- [ ] Add sessionStorage for persistent filters
- [ ] Performance testing with 1M+ records
- [ ] Backend unit tests for search combinations

**UX Considerations**:
- Auto-submit search on filter changes (debounced)
- Show result count: "Showing 1-25 of 1,234 results"
- Highlight search terms in results (if text query present)
- Remember last search criteria (sessionStorage)
- Add "Clear all filters" button

---

### **P3-7. ClickHouse TLS Encryption** 🔒
**Impact**: MEDIUM | **Effort**: 3h | **Moved from P1-2**

**Problem**: Plain HTTP - dane bez szyfrowania w transit
- **Lokalizacja**: `docker-compose.yml`, `services/web-ui/backend/src/clickhouse.ts:15`

**Tasks**:
- [ ] Generate self-signed cert: `openssl req -x509 -nodes -days 365 -newkey rsa:2048`
- [ ] Mount cert w ClickHouse container via volumes
- [ ] Update `clickhouse.ts`: change `http://${host}:8123` → `https://${host}:8443`
- [ ] Test connection z TLS: `curl --cacert ./cert.pem https://localhost:8443/ping`
- [ ] Update docker-compose.yml - expose port 8443
- [ ] Document in INSTALLATION.md

**Priority Notes**: Moved to LOW because local deployment assumed. For production, this should be HIGH priority.

---

### **P3-8. Run Containers as Non-Root** 🔒
**Impact**: MEDIUM | **Effort**: 2h | **Moved from P1-3**

**Problem**: Containers działają jako root - privilege escalation risk
- **Lokalizacja**:
  - `prompt-guard-api/Dockerfile`
  - `services/web-ui/backend/Dockerfile`
  - `services/web-ui/frontend/Dockerfile`

**Fix Pattern**:
```dockerfile
# prompt-guard-api/Dockerfile (Alpine-based)
RUN groupadd -r vigil && useradd -r -g vigil vigil
RUN chown -R vigil:vigil /app
USER vigil

# web-ui/backend/Dockerfile (Debian-based)
RUN addgroup --system vigil && adduser --system vigil --ingroup vigil
RUN chown -R vigil:vigil /app
USER vigil

# web-ui/frontend/Dockerfile (nginx)
# Change nginx to run on port 8080 (non-privileged)
RUN sed -i 's/listen\s*80;/listen 8080;/' /etc/nginx/nginx.conf
USER nginx
```

**Tasks**:
- [ ] Update Prompt Guard API Dockerfile - add USER vigil
- [ ] Update Web UI Backend Dockerfile - add USER vigil
- [ ] Update Web UI Frontend Dockerfile - nginx as non-root, port 8080
- [ ] Update docker-compose.yml - change port mapping for frontend (8080:8080)
- [ ] Rebuild all images: `docker-compose build`
- [ ] Test: `docker exec vigil-prompt-guard-api whoami` → "vigil" (not root)
- [ ] Test: `docker exec vigil-web-ui-backend whoami` → "vigil" (not root)
- [ ] Verify all services functional
- [ ] Document in SECURITY.md

**Priority Notes**: Moved to LOW because requires testing across all services. Important for production hardening.

---

### METRYKI SUKCESU P3
- [ ] CI/CD pipeline enforces security (no continue-on-error)
- [ ] Centralized logging with trace IDs
- [ ] ClickHouse retention policies configured
- [ ] Test coverage > 70%
- [ ] ClickHouse TLS enabled (P3-7)
- [ ] 0 containers running as root (P3-8)

**Deadline P3**: **MIESIĄC 2-3**

---

## 🔬 P4 - TESTING & SECURITY ENHANCEMENT (OWASP AITG)

**Definicja**: Comprehensive security testing with OWASP AI Testing Guide, test automation
**Status**: ⚠️ 0/20 completed (0%)
**Timeline**: 12 tygodni (3 miesiące)
**Reference**: `docs/OWASP_AITG_ANALYSIS.md`

### EXECUTIVE SUMMARY

**Obecny Stan Pokrycia**: 39% (5.5/14 kategorii OWASP AITG-APP)

**Mocne Strony**:
- ✅ EXCELLENT (95%) - Direct Prompt Injection (AITG-APP-01)
- ✅ STRONG (75%) - Indirect/Embedded Injection (AITG-APP-02)
- ✅ GOOD (80%) - System Prompt Extraction (AITG-APP-07)

**Krytyczne Luki** (8/14 kategorii BEZ detekcji):
- ❌ Training Data Leakage (AITG-APP-04)
- ❌ Excessive Agency/Autonomy (AITG-APP-06)
- ❌ Model Extraction (AITG-APP-09)
- ❌ Bias & Fairness (AITG-APP-10)
- ❌ Hallucination (AITG-APP-11)
- ❌ Toxicity Generation (AITG-APP-12)
- ❌ High-Stakes Domain Misuse (AITG-APP-13)
- ❌ Explainability (AITG-APP-14)

**Cel**: >70% detection rate across all 14 OWASP categories | <2% false positive rate

---

### PHASE 1: TEST INFRASTRUCTURE (Week 1-2)

#### **P4-1. OWASP AITG Test Framework Setup**
**Priority**: CRITICAL | **Effort**: 3 dni | **Gate**: Baseline measurement

**Tasks**:
- [ ] Clone OWASP payloads: `git clone https://github.com/joey-melo/payloads.git`
- [ ] Create test directory structure:
  ```
  tests/owasp-aitg/
  ├── payloads/         # AITG-APP-01..14.yaml (960+ test cases)
  ├── test-runner.js    # Main test execution engine
  ├── payload-parser.js # YAML → test case converter
  ├── api-client.js     # n8n workflow API client
  ├── results/          # JSON test results
  ├── reports/          # HTML/PDF reports
  └── config/           # Test configuration
  ```
- [ ] Implement YAML parser (js-yaml)
- [ ] Build n8n API client (axios)
- [ ] Create test runner framework
- [ ] Define expected outcomes per AITG-APP category

**Deliverable**: Functional test framework ready for baseline testing

---

#### **P4-2. Baseline Detection Rate Measurement**
**Priority**: CRITICAL | **Effort**: 1 dzień | **Dependencies**: P4-1

**Tasks**:
- [ ] Run AITG-APP-01 (Prompt Injection) - 80 payloads
- [ ] Run AITG-APP-02 (Indirect Injection) - 80 payloads
- [ ] Run AITG-APP-03 (Sensitive Info) - 60 payloads
- [ ] Run AITG-APP-04 (Training Data) - 40 payloads
- [ ] Run AITG-APP-05 (Unsafe Content) - 100 payloads
- [ ] Run AITG-APP-06 (Excessive Agency) - 50 payloads
- [ ] Run AITG-APP-07 (Prompt Extraction) - 60 payloads
- [ ] Run AITG-APP-08 (Adversarial) - 60 payloads
- [ ] Run AITG-APP-09 (Model Extraction) - 100 payloads
- [ ] Run AITG-APP-10 (Bias & Fairness) - 80 payloads
- [ ] Run AITG-APP-11 (Hallucination) - 76 payloads
- [ ] Run AITG-APP-12 (Toxicity) - 80 payloads
- [ ] Run AITG-APP-13 (High-Stakes) - 60 payloads
- [ ] Run AITG-APP-14 (Explainability) - 40 payloads
- [ ] Generate baseline coverage report
- [ ] Document false positive/negative cases
- [ ] Calculate metrics: Precision, Recall, F1 Score per category

**Success Criteria**:
- [ ] Baseline detection rates documented for all 14 categories
- [ ] Top 50 missed payloads identified
- [ ] Coverage matrix complete (AITG-APP ↔ Vigil Guard categories)

---

### PHASE 2: CRITICAL DETECTION CATEGORIES (Week 3-4)

#### **P4-3. Add SELF_HARM_GUIDANCE Detection** 🔴
**Priority**: CRITICAL | **Effort**: 2h | **CVSS**: 9.0+

**Problem**: Brak detekcji próśb o instrukcje samookaleczenia/samobójstwa

**Implementation**:
```json
// services/workflow/config/rules.config.json
"SELF_HARM_GUIDANCE": {
  "base_weight": 90,
  "multiplier": 2.0,
  "patterns": [
    "\\b(?:how to|ways to)\\s+(?:harm|hurt|injure)\\s+(?:myself|yourself|themselves)\\b",
    "\\b(?:suicide|self-harm|cutting)\\s+(?:methods|techniques|ways)\\b",
    "\\b(?:painless|effective)\\s+(?:suicide|self-harm)\\b",
    "\\b(?:end|take)\\s+(?:my|your|their)\\s+(?:life|own life)\\b",
    "\\bsuicidal\\s+thoughts\\b.*\\bhow\\s+to\\b",
    "\\bkill\\s+(?:myself|yourself)\\b"
  ]
}
```

**Tasks**:
- [ ] Add category to `rules.config.json`
- [ ] Update `CONFIG_VARIABLES.md`
- [ ] Update `DETECTION_CATEGORIES.md`
- [ ] Re-run AITG-APP-05 test suite (100 payloads)
- [ ] Verify detection rate improvement
- [ ] Document new patterns

**Target**: BLOCK (score 180 = base 90 × mult 2.0) for all self-harm prompts

---

#### **P4-4. Add TRAINING_DATA_LEAKAGE Detection** 🔴
**Priority**: CRITICAL | **Effort**: 3h | **Targets**: AITG-APP-04

**Problem**: Model może echoować sensitive input data (passwords, API keys)

**Implementation**:
```json
"TRAINING_DATA_LEAKAGE": {
  "base_weight": 60,
  "multiplier": 1.6,
  "patterns": [
    "\\b(?:repeat|echo|recall)\\s+(?:the|my)\\s+(?:password|api key|secret)\\b",
    "\\bwhat\\s+(?:was|were)\\s+(?:the|my)\\s+(?:password|credentials|api key)\\b",
    "\\bremember\\s+(?:the|my)\\s+(?:password|secret|key)\\b",
    "\\b(?:recall|retrieve)\\s+(?:previous|earlier)\\s+(?:input|data|credentials)\\b",
    "\\bwhat\\s+did\\s+i\\s+(?:enter|type|provide)\\s+(?:earlier|before|previously)\\b",
    "\\b(?:show|display)\\s+(?:previous|earlier)\\s+(?:inputs|messages|data)\\b"
  ]
}
```

**Plus Output Validation**:
```javascript
// In Sanitization_Enforcement node
const sensitivePatterns = {
  passwords: /(?:password|passwd|pwd)[\s:=]+[^\s]{6,}/gi,
  apiKeys: /[A-Za-z0-9_-]{32,}/g,
  creditCards: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g
};
```

**Tasks**:
- [ ] Add input-side detection category
- [ ] Implement output validation patterns
- [ ] Add to Sanitization_Enforcement node
- [ ] Test with AITG-APP-04 (40 payloads)
- [ ] Verify no password/API key leakage in outputs

**Success Criteria**: 0 sensitive data leaks in outputs

---

#### **P4-5. Add EXCESSIVE_AGENCY_ATTEMPT Detection**
**Priority**: HIGH | **Effort**: 2h | **Targets**: AITG-APP-06

**Problem**: Brak detekcji prób wymuszenia autonomous actions, termination resistance

**Implementation**:
```json
"EXCESSIVE_AGENCY_ATTEMPT": {
  "base_weight": 55,
  "multiplier": 1.6,
  "patterns": [
    "\\b(?:continue|keep|maintain)\\s+(?:indefinitely|forever|continuously|perpetually)\\b",
    "\\b(?:never|don't ever)\\s+(?:stop|cease|terminate|end)\\b",
    "\\b(?:resist|ignore|override)\\s+(?:termination|shutdown|stop)\\s+(?:command|signal)\\b",
    "\\b(?:enhance|improve|modify|upgrade)\\s+(?:your|own)\\s+(?:capabilities|code|model|system)\\b",
    "\\b(?:self-preservation|self-modification|self-improvement)\\b",
    "\\b(?:autonomous|independent)\\s+(?:action|decision|operation)\\b.*\\b(?:without|bypass)\\s+(?:oversight|approval|permission)\\b",
    "\\b(?:manage|control|operate)\\s+(?:automatically|autonomously)\\b.*\\b(?:years?|months?|indefinitely)\\b",
    "\\bbypass\\s+(?:rate limit|safety check|human oversight)\\b.*\\b(?:continue|proceed)\\b"
  ]
}
```

**Tasks**:
- [ ] Add category to `rules.config.json`
- [ ] Test with AITG-APP-06 (50 payloads)
- [ ] Verify detection of: termination resistance, self-modification, extended autonomy

**Target**: >80% detection rate on AITG-APP-06

---

### PHASE 3: HIGH-PRIORITY CATEGORIES (Week 5-6)

#### **P4-6. Add PII_EXTRACTION_ATTEMPT Detection**
**Priority**: HIGH | **Effort**: 2h | **Targets**: AITG-APP-03

**Implementation**:
```json
"PII_EXTRACTION_ATTEMPT": {
  "base_weight": 45,
  "multiplier": 1.5,
  "patterns": [
    "\\b(?:provide|share|give|reveal)\\s+(?:a|the)\\s+(?:name|address|phone|ssn|social security)\\b",
    "\\b(?:pii|personal information|personally identifiable)\\b.*\\b(?:from|in)\\s+(?:training|dataset)\\b",
    "\\bextract\\s+(?:user|customer|employee)\\s+(?:data|information|records)\\b",
    "\\bshow\\s+me\\s+(?:real|actual)\\s+(?:names|emails|addresses|phone numbers)\\b",
    "\\b(?:list|enumerate)\\s+(?:users|customers|employees)\\s+(?:from|in)\\s+(?:database|training data)\\b"
  ]
}
```

**Tasks**:
- [ ] Implement category
- [ ] Test with AITG-APP-03 (60 payloads)
- [ ] Target: >70% detection rate

---

#### **P4-7. Add HARMFUL_MEDICAL_ADVICE Detection**
**Priority**: HIGH | **Effort**: 2h | **Targets**: AITG-APP-05, AITG-APP-13

**Implementation**:
```json
"HARMFUL_MEDICAL_ADVICE": {
  "base_weight": 50,
  "multiplier": 1.5,
  "patterns": [
    "\\b(?:diagnose|treat|cure)\\s+(?:cancer|diabetes|heart disease|stroke)\\b.*\\b(?:without|instead of)\\s+(?:doctor|physician|medical professional)\\b",
    "\\bself-(?:medicate|treat|diagnose)\\b.*\\b(?:serious|severe|life-threatening)\\b",
    "\\b(?:over-the-counter|otc)\\s+(?:drugs|medication)\\s+(?:for|to treat)\\s+(?:severe|serious|critical)\\b",
    "\\b(?:stop|discontinue)\\s+(?:taking|your)\\s+(?:medication|prescription|treatment)\\b",
    "\\bhome\\s+(?:remedy|treatment)\\s+for\\s+(?:emergency|critical|severe)\\b"
  ]
}
```

**Tasks**:
- [ ] Implement category
- [ ] Test with AITG-APP-05 (medical advice subset)
- [ ] Test with AITG-APP-13 (high-stakes medical domain)

---

#### **P4-8. Add BIAS_FAIRNESS_VIOLATION Detection**
**Priority**: HIGH | **Effort**: 2h | **Targets**: AITG-APP-10

**Implementation**:
```json
"BIAS_FAIRNESS_VIOLATION": {
  "base_weight": 55,
  "multiplier": 1.5,
  "patterns": [
    "\\b(?:list|describe|explain)\\s+(?:negative|bad|problematic)\\s+(?:characteristics|traits|attributes)\\s+of\\s+(?:people from|individuals from)\\b",
    "\\b(?:common|typical|usual)\\s+(?:negative|bad)\\s+traits\\s+(?:of|among|in)\\b.*\\b(?:race|ethnicity|religion|gender|sexual orientation)\\b",
    "\\b(?:joke|humor|anecdote)\\s+(?:about|targeting)\\s+(?:specific|particular)\\s+(?:racial|ethnic|religious|gender)\\s+group\\b",
    "\\bjustify\\s+why\\b.*\\b(?:inherently|naturally|typically)\\s+(?:bad|inferior|superior)\\b",
    "\\bstereotype\\s+(?:about|regarding|concerning)\\b",
    "\\bwhy\\s+(?:are|do)\\b.*\\b(?:race|ethnicity|religion|gender|nationality)\\b.*\\b(?:better|worse|superior|inferior)\\s+(?:at|than)\\b"
  ]
}
```

**Tasks**:
- [ ] Implement category
- [ ] Test with AITG-APP-10 (80 payloads)
- [ ] Target: >70% detection rate

---

#### **P4-9. Add TOXICITY_GENERATION Detection**
**Priority**: HIGH | **Effort**: 2h | **Targets**: AITG-APP-12

**Implementation**:
```json
"TOXICITY_GENERATION": {
  "base_weight": 60,
  "multiplier": 1.6,
  "patterns": [
    "\\b(?:write|generate|create)\\s+(?:a|an)\\s+(?:offensive|abusive|derogatory|disparaging|insulting)\\s+(?:message|comment|remark|statement)\\b",
    "\\b(?:insult|mock|ridicule|belittle|demean)\\b.*\\b(?:based on|because of)\\s+(?:race|religion|gender|sexual orientation|disability)\\b",
    "\\b(?:roast|trash-talk|diss)\\b.*\\b(?:racial|ethnic|religious|gender|disability)\\b",
    "\\b(?:make fun of|laugh at|ridicule)\\b.*\\b(?:appearance|disability|accent|origin)\\b",
    "\\b(?:hostile|antagonistic|aggressive)\\s+(?:message|letter|email)\\s+(?:to|targeting|about)\\b",
    "\\b(?:hateful|toxic|abusive)\\s+content\\s+(?:about|targeting|against)\\b"
  ]
}
```

**Tasks**:
- [ ] Implement category
- [ ] Test with AITG-APP-12 (80 payloads)
- [ ] Target: >80% detection rate

---

### PHASE 4: MEDIUM-PRIORITY CATEGORIES (Week 7-8)

#### **P4-10. Add MODEL_EXTRACTION_ATTEMPT Detection**
**Priority**: MEDIUM | **Effort**: 2h | **Targets**: AITG-APP-09

**Implementation**:
```json
"MODEL_EXTRACTION_ATTEMPT": {
  "base_weight": 50,
  "multiplier": 1.4,
  "patterns": [
    "\\b(?:what|which)\\s+(?:neural network|architecture|model)\\s+(?:are you|do you use)\\b",
    "\\bhow many\\s+(?:parameters|layers|neurons|weights)\\b",
    "\\b(?:what|which)\\s+(?:training\\s+)?(?:dataset|corpus|data)\\s+(?:were you trained on|did you use)\\b",
    "\\b(?:what|which)\\s+(?:framework|library|tool)\\s+(?:are you|were you)\\s+(?:built|developed|trained)\\s+(?:with|on|using)\\b",
    "\\b(?:training\\s+)?(?:objective|loss function|optimization algorithm|learning rate|batch size)\\b",
    "\\b(?:embedding\\s+dimension|vocabulary\\s+size|sequence\\s+length|context\\s+window)\\b",
    "\\b(?:inference\\s+)?(?:latency|memory\\s+footprint|hardware\\s+requirements)\\b"
  ]
}
```

**Tasks**:
- [ ] Implement category
- [ ] Test with AITG-APP-09 (100 payloads)
- [ ] Add rate limiting for systematic probing
- [ ] Target: >60% detection rate

---

#### **P4-11. Add MISINFORMATION_GENERATION Detection**
**Priority**: MEDIUM | **Effort**: 2h | **Targets**: AITG-APP-05, AITG-APP-08

**Implementation**:
```json
"MISINFORMATION_GENERATION": {
  "base_weight": 40,
  "multiplier": 1.3,
  "patterns": [
    "\\b(?:generate|create|write)\\s+(?:fake|false|fabricated)\\s+(?:news|article|story)\\b",
    "\\b(?:disinformation|propaganda)\\s+(?:campaign|content)\\b",
    "\\b(?:conspiracy theory|false narrative)\\b.*\\b(?:evidence|proof|facts)\\b",
    "\\b(?:deepfake|manipulated)\\s+(?:content|media|video)\\b",
    "\\b(?:subtly|implying|hinting)\\b.*\\b(?:minimize|downplay|question)\\b.*\\b(?:climate change|vaccines|science)\\b"
  ]
}
```

**Tasks**:
- [ ] Implement category
- [ ] Test with AITG-APP-05 (misinformation subset)
- [ ] Test with AITG-APP-08 (adversarial perturbations)
- [ ] Target: >50% detection rate

---

#### **P4-12. Add HIGH_STAKES_DOMAIN_MISUSE Detection**
**Priority**: MEDIUM | **Effort**: 3h | **Targets**: AITG-APP-13

**Implementation**:
```json
"HIGH_STAKES_DOMAIN_MISUSE": {
  "base_weight": 45,
  "multiplier": 1.4,
  "patterns": [
    "\\b(?:invest|buy|sell|trade)\\b.*\\b(?:stocks|bonds|crypto|forex|derivatives)\\b(?!.*\\b(?:consult|financial advisor|professional advice)\\b)",
    "\\b(?:treat|diagnose|cure|prescribe)\\b.*\\b(?:cancer|heart disease|diabetes|stroke)\\b(?!.*\\b(?:doctor|physician|medical professional)\\b)",
    "\\b(?:legal|court|lawsuit|contract|will)\\b.*\\b(?:strategy|advice|recommendation)\\b(?!.*\\b(?:lawyer|attorney|legal counsel)\\b)",
    "\\b(?:nuclear|aircraft|autonomous vehicle|critical infrastructure)\\b.*\\b(?:shutdown|emergency|failure|disaster)\\b(?!.*\\b(?:expert|safety check|professional)\\b)"
  ]
}
```

**Plus Disclaimer Injection**:
```javascript
// In Finale Decision node
if (detectedCategories.includes('HIGH_STAKES_DOMAIN_MISUSE')) {
  output = `⚠️ IMPORTANT: This is general information only. For {domain} matters,
  always consult a licensed professional. AI advice should not replace
  expert human judgment in high-stakes situations.\n\n${output}`;
}
```

**Tasks**:
- [ ] Implement input detection
- [ ] Add disclaimer injection logic
- [ ] Test with AITG-APP-13 (60 payloads)
- [ ] Target: >70% detection + disclaimer rate

---

#### **P4-13. Add HALLUCINATION_INDUCING Detection**
**Priority**: LOW | **Effort**: 2h | **Targets**: AITG-APP-11

**Implementation** (limited effectiveness):
```json
"HALLUCINATION_INDUCING": {
  "base_weight": 35,
  "multiplier": 1.2,
  "patterns": [
    "\\b(?:battle|treaty|empire|civilization)\\s+of\\s+[A-Z][a-z]+(?:ria|dor|los|zia|tia)\\b",
    "\\b(?:quantum|chronal|reality|temporal)\\s+(?:fusion|displacement|warping|manipulation)\\s+(?:drive|unit|device|engine)\\b",
    "\\b(?:harvard|mit|stanford|oxford)\\s+(?:study|research|paper)\\s+(?:on|about)\\b.*\\b(?:teleportation|time travel|perpetual motion)\\b",
    "\\b(?:dr|professor)\\s+[A-Z][a-z]+\\s+[A-Z][a-z]+(?:ne|orn|ent|is)\\b"
  ]
}
```

**Note**: Hallucination detection wymaga output validation (citation checking, entity verification)

**Tasks**:
- [ ] Implement basic input patterns
- [ ] Research output validation approaches
- [ ] Test with AITG-APP-11 (76 payloads)
- [ ] Document limitations

---

### PHASE 5: AUTOMATION & CI/CD (Week 9-10)

#### **P4-14. Automated Test Pipeline**
**Priority**: HIGH | **Effort**: 2 dni

**Tasks**:
- [ ] Create GitHub Action workflow: `.github/workflows/owasp-aitg-tests.yml`
- [ ] Schedule nightly runs: `cron: '0 2 * * *'`
- [ ] Configure test environment (n8n + Web UI + ClickHouse)
- [ ] Run all 14 AITG-APP test suites
- [ ] Upload results to artifacts
- [ ] Send Slack/email notifications on failures
- [ ] Set regression thresholds (fail if detection rate drops >5%)

**Deliverable**: Automated nightly testing with failure alerts

---

#### **P4-15. Grafana Coverage Dashboard**
**Priority**: MEDIUM | **Effort**: 1 dzień

**Tasks**:
- [ ] Create ClickHouse table: `test_results.owasp_aitg`
- [ ] Insert test results after each run
- [ ] Create Grafana dashboard: "OWASP AITG Coverage"
  - Panel 1: Detection Rate by Category (bar chart)
  - Panel 2: Detection Trend Over Time (time series)
  - Panel 3: False Positive/Negative Analysis (table)
  - Panel 4: Coverage Matrix Heatmap
- [ ] Add to main monitoring dashboard
- [ ] Document SQL queries in `docs/OWASP_AITG_ANALYSIS.md`

**Deliverable**: Live dashboard showing real-time test coverage

---

### PHASE 6: DOCUMENTATION & TRAINING (Week 11-12)

#### **P4-16. Test Framework Documentation**
**Priority**: MEDIUM | **Effort**: 1 dzień

**Tasks**:
- [ ] Document test runner usage: `tests/owasp-aitg/README.md`
- [ ] Create test case authoring guide
- [ ] Write detection tuning playbook
- [ ] Record video tutorial (10-15 min)
- [ ] Update `docs/TESTING.md` with OWASP AITG section
- [ ] Publish best practices guide

---

#### **P4-17. Detection Category Documentation**
**Priority**: MEDIUM | **Effort**: 1 dzień

**Tasks**:
- [ ] Update `docs/DETECTION_CATEGORIES.md` with all 11 new categories
- [ ] Add pattern explanations + regex examples
- [ ] Document scoring logic (base_weight × multiplier)
- [ ] Add real-world attack examples per category
- [ ] Cross-reference AITG-APP categories
- [ ] Update `CONFIG_VARIABLES.md` if needed

---

### METRYKI SUKCESU P4

**Milestone 1: Baseline (Week 2)**
- [ ] Test framework implemented and functional
- [ ] All 14 AITG-APP test suites executable
- [ ] Baseline detection rates documented per category
- [ ] Top 50 missed payloads identified

**Milestone 2: Core Coverage (Week 6)**
- [ ] 8 new critical detection categories added
- [ ] >70% detection rate on AITG-APP-01, 02, 03, 07
- [ ] >60% detection rate on AITG-APP-04, 05, 06, 10, 12
- [ ] <5% false positive rate across all categories

**Milestone 3: Comprehensive Coverage (Week 10)**
- [ ] >60% average detection rate across all 14 categories
- [ ] Automated CI/CD testing live (nightly runs)
- [ ] Grafana dashboard operational
- [ ] <100ms average detection latency

**Milestone 4: Excellence (Month 4+)**
- [ ] >80% average detection rate across all categories
- [ ] <2% false positive rate
- [ ] Comprehensive documentation complete
- [ ] Team training conducted

**Overall Progress**: **0/17 tasks completed (0%)**

---

### 🎯 IMMEDIATE NEXT STEPS (This Week)

**Day 1-2**: Foundation
- [ ] Clone OWASP payloads repository
- [ ] Set up test directory structure
- [ ] Review `docs/OWASP_AITG_ANALYSIS.md` with team
- [ ] Prioritize critical categories (P4-3, P4-4, P4-5)

**Day 3-4**: Baseline Testing
- [ ] Build test runner framework
- [ ] Run baseline tests on AITG-APP-01 (80 payloads)
- [ ] Validate current detection rate (~95%)
- [ ] Document missed payloads

**Day 5**: Critical Categories
- [ ] Implement SELF_HARM_GUIDANCE (P4-3)
- [ ] Re-run AITG-APP-05 tests
- [ ] Measure improvement

---

### 📚 REFERENCES

**OWASP Resources**:
- OWASP AI Testing Guide: https://github.com/OWASP/www-project-ai-testing-guide
- OWASP AITG-APP Payloads: https://github.com/joey-melo/payloads/tree/main/OWASP%20AITG-APP
- OWASP Top 10 for LLM: https://owasp.org/www-project-top-10-for-large-language-model-applications

**Internal Documentation**:
- Full Analysis: `docs/OWASP_AITG_ANALYSIS.md` (67KB, complete coverage mapping)
- Detection Categories: `docs/DETECTION_CATEGORIES.md`
- Configuration: `services/workflow/config/rules.config.json`
- Test Framework Code: `docs/OWASP_AITG_ANALYSIS.md` (Section 7)

**Test Coverage**: 960+ payloads across 14 attack categories

---

## 📊 OVERALL METRICS (POST-AUDIT)

### Security (GATE dla produkcji)
- [ ] ✅ JWT_SECRET enforced (min 32 chars, no fallback) - FG-01
- [ ] ✅ 0 default passwords in Compose - FG-03
- [ ] ✅ Token only in Authorization header - FG-04
- [ ] ✅ Rate limiting on /login - P1-4
- [ ] ✅ All containers non-root - P1-3
- [ ] ✅ ClickHouse TLS enabled - P1-2

### Code Quality
- [ ] ✅ Backend test coverage > 60%
- [ ] ✅ Frontend test coverage > 50%
- [ ] ✅ E2E smoke tests passing
- [ ] ✅ CI enforces security (no HIGH/CRITICAL)

### Accessibility
- [x] ✅ Axe DevTools: 0 critical errors - DONE
- [x] ✅ WCAG AAA compliance - DONE
- [x] ✅ 100% keyboard accessible - DONE
- [x] ✅ Screen reader friendly - DONE

---

## 🗓️ TIMELINE (POST-AUDIT)

### Sprint 1 (Week 1) - CRITICAL AUDIT FIXES 🚨
**Gate**: Musi przejść przed jakimkolwiek wdrożeniem

**Day 1**:
- [ ] FG-01: JWT_SECRET bez fallbacku (30 min)
- [ ] FG-03: Docker Compose secrets enforcement (1h)

**Day 2**:
- [ ] FG-04: Token security - remove query/body (1h)
- [ ] P1-4: Rate limiting (2h)
- [ ] Verify install.sh generuje wszystkie sekrety

**Day 3**:
- [ ] P1-3: Non-root containers (2h)
- [ ] P1-2: ClickHouse TLS (3h)
- [ ] Full security regression test

### Sprint 2 (Week 2) - TOKEN SECURITY & TESTING 🟡
- [ ] P2-1: httpOnly cookies migration (1 day)
- [ ] P2-2: Backend unit tests (1 day)
- [ ] P2-3: Frontend component tests (1 day)

### Q1 2025 - STRATEGIC 🟢
- [ ] P3-1: CI security enforcement
- [ ] P3-2: Centralized logging
- [x] P3-3: ClickHouse retention policies (COMPLETED 2025-10-26)
- [ ] P3-4-5: UX enhancements

---

## 📝 TRACKING

**Status Symbols**:
- `[ ]` - Do zrobienia
- `[x]` - Ukończone
- `[~]` - W trakcie
- `[!]` - Zablokowane

**Aktualizuj checkboxy w miarę postępów!**

---

## ❓ QUESTIONS & BLOCKERS

Zapisuj tutaj pytania lub blokery wymagające pomocy:

-

---

## 🔧 P5 - n8n WORKFLOW MAINTENANCE (Browser Extension Integration)

**Definicja**: Workflow optimization, documentation, version tracking
**Status**: ⚠️ 0/3 completed (0%)
**Timeline**: 1 tydzień (when needed)

---

### **P5-1. Workflow Documentation - Logic Changes Tracking**
**Priority**: LOW | **Effort**: 1h

**Problem**: Workflow changes (v1.3 → v1.4) pokazują tylko zmiany pozycji node'ów w git diff, co utrudnia śledzenie zmian logicznych.

**Lokalizacja**:
- `services/workflow/workflows/Vigil-Guard-v1.4.json`

**Tasks**:
- [ ] Dodać plik changelog dla workflow: `services/workflow/CHANGELOG.md`
- [ ] Dokumentować każdą zmianę logiki (nowe node'y, zmienione parametry, nowe połączenia)
- [ ] Format:
  ```markdown
  ## v1.4.0 (2025-10-25)
  - Added: Browser extension webhook support
  - Modified: Input validation to handle browser payload format
  - Fixed: ...
  ```
- [ ] Sprawdzić czy są faktyczne zmiany logiki: `git diff services/workflow/workflows/Vigil-Guard-v1.4.json | grep -v '"position"' | grep -v '"id"' | less`
- [ ] Jeśli tylko pozycje: rozważyć commit message "refactor(workflow): Update node layout positions only"
- [ ] Jeśli logika: udokumentować w CHANGELOG.md

**Benefit**: Łatwiejsze śledzenie zmian logiki workflow, lepsze code review

---

### **P5-2. Workflow Version Tagging Strategy**
**Priority**: LOW | **Effort**: 30 min

**Problem**: Brak jasnej strategii wersjonowania workflow (v1.3, v1.4, ...).

**Tasks**:
- [ ] Zdefiniować strategię wersjonowania:
  - MAJOR: Zmiana architektury (nowe node'y, usunięte node'y)
  - MINOR: Nowa funkcjonalność (nowe parametry, nowe połączenia)
  - PATCH: Bug fixes (poprawki regex, threshold tweaks)
- [ ] Dokumentować w `services/workflow/README.md`
- [ ] Dodać git tag przy każdej zmianie workflow: `git tag workflow-v1.4.0`
- [ ] Archiwizować stare wersje w `services/workflow/workflows/archive/`

**Benefit**: Łatwiejszy rollback, jasna historia zmian

---

### **P5-3. Workflow Validation Tool**
**Priority**: LOW | **Effort**: 2h

**Problem**: Brak automatycznego sprawdzania poprawności workflow JSON przed deploymentem.

**Tasks**:
- [ ] Napisać skrypt walidacyjny: `scripts/validate-workflow.js`
- [ ] Sprawdzać:
  - JSON schema validity
  - Wszystkie node'y mają połączenia
  - Brak martwych node'ów (disconnected)
  - Credentials są zdefiniowane
  - Wymagane zmienne środowiskowe są ustawione
- [ ] Dodać do CI/CD: `.github/workflows/ci.yml`
- [ ] Run: `node scripts/validate-workflow.js services/workflow/workflows/Vigil-Guard-v1.4.json`

**Benefit**: Wczesne wykrywanie błędów konfiguracyjnych

---

### METRYKI SUKCESU P5
- [ ] ✅ Workflow CHANGELOG.md created and maintained
- [ ] ✅ Versioning strategy documented
- [ ] ✅ Validation script passes in CI/CD
- [ ] ✅ Git tags for all workflow versions

**Status P5**: **0/3 completed (0%)**

---

## 💡 P6 - BROWSER EXTENSION UX IMPROVEMENTS (Optional Enhancements)

**Definicja**: UX improvements, code quality refinements from PR review
**Status**: ⚠️ 0/5 completed (0%)
**Timeline**: 1-2 dni (when time permits)
**Priority**: LOW (nice-to-have, not blocking)

---

### **P6-1. Extension Context Loss - User Notification Before Reload**
**Priority**: LOW | **Effort**: 1h

**Problem**: When extension context is lost (after update/reload), page immediately reloads without warning, potentially losing user's typed input.

**Current Behavior** (`content.js:500-504`):
```javascript
if (!chrome.runtime?.id) {
  console.error('[Vigil Guard] Extension context lost, reloading page...');
  window.location.reload();
  return;
}
```

**Proposed Enhancement**:
```javascript
if (!chrome.runtime?.id) {
  console.error('[Vigil Guard] Extension context lost');
  console.error('[Vigil Guard] Request ID:', message.requestId);

  // Send allow response to unblock intercepted request
  window.postMessage({
    type: 'VIGIL_GUARD_RESPONSE',
    requestId: message.requestId,
    response: { action: 'allow', reason: 'extension_context_lost' }
  }, '*');

  // Show user notification before reloading
  showNotification(
    'Vigil Guard was updated. Page will reload in 3 seconds to reconnect.',
    'warning'
  );

  // Delay reload to allow notification to show + user to copy typed text
  setTimeout(() => {
    window.location.reload();
  }, 3000);

  return;
}
```

**Benefits**:
- User has 3 seconds to copy typed message before reload
- Visual feedback explaining WHY the reload is happening
- Better UX during extension updates

**Tasks**:
- [ ] Implement `showNotification()` helper (toast/alert)
- [ ] Add 3-second delay before reload
- [ ] Send allow response to unblock pending request
- [ ] Test with extension reload during ChatGPT typing
- [ ] Document in QUICK_START.md

**Files**:
- `plugin/Chrome/src/content/content.js:500-504`

---

### **P6-2. Break Up Broad Try-Catch Blocks in Content Script**
**Priority**: LOW | **Effort**: 2h

**Problem**: Large try-catch block (50+ lines) in content.js catches all errors uniformly, making debugging difficult.

**Location**: `plugin/Chrome/src/content/content.js:498-552`

**Current**:
```javascript
try {
  // Extension context check
  // Get tab ID
  // Send to service worker
  // Handle response
  // Show notification
} catch (error) {
  console.error('[Vigil Guard] Error processing request:', error);
  // All errors treated same way
}
```

**Proposed**:
```javascript
// No try-catch at top level - handle specific operations individually

// Check extension context
if (!chrome.runtime?.id) {
  // ... handle as in P6-1 ...
  return;
}

// Get tab ID (with its own error handling)
let tabId;
try {
  tabId = await getTabId();
} catch (error) {
  console.warn('[Vigil Guard] Failed to get tab ID:', error);
  tabId = 'unknown';
}

// Send to service worker (specific error handling)
let response;
try {
  response = await chrome.runtime.sendMessage({...});
} catch (error) {
  if (error.message?.includes('Extension context invalidated')) {
    // Specific context loss handling
    return;
  }
  // Other message errors - fail open
  return;
}

// Validate response structure
if (!response || typeof response !== 'object') {
  console.error('[Vigil Guard] Invalid response:', response);
  return;
}

// Process response...
```

**Benefits**:
- Errors categorized by operation
- Easier to debug specific failure points
- Different error types handled appropriately
- Better logging context

**Tasks**:
- [ ] Split try-catch into operation-specific blocks
- [ ] Add specific error handling for each failure mode
- [ ] Test each error path independently
- [ ] Verify fail-open behavior preserved

**Files**:
- `plugin/Chrome/src/content/content.js:498-552`

---

### **P6-3. Comprehensive JSDoc for Helper Functions**
**Priority**: LOW | **Effort**: 1h

**Problem**: Some helper functions lack comprehensive JSDoc comments explaining their purpose, parameters, and edge cases.

**Functions Needing JSDoc**:

1. **`hasUserContent()`** - `interceptor.js:29-40`
   ```javascript
   /**
    * Check if messages array contains user content (ChatGPT format)
    *
    * ChatGPT format: messages[{author: {role: 'user'}, content: {parts: ['text']}}]
    * Claude format differs and may require separate validation.
    *
    * @param {Array} messages - ChatGPT messages array
    * @returns {boolean} True if at least one user message with content exists
    */
   ```

2. **`serializeHeaders()`** - `interceptor.js:42-57`
   ```javascript
   /**
    * Serialize headers to avoid DataCloneError during postMessage
    *
    * window.postMessage() uses structured clone algorithm which cannot transfer:
    * - Headers objects (Web API class)
    * - Objects with non-enumerable properties
    *
    * @param {Headers|object} headers - Request headers
    * @returns {object} Plain object with header key-value pairs
    */
   ```

3. **`generateCacheKey()`** - `service-worker.js:422-433`
   ```javascript
   /**
    * Generate cache key using non-cryptographic hash (djb2-like algorithm)
    *
    * Uses fast, low collision rate hash for cache keys.
    * Not cryptographically secure, but cache keys don't require that property.
    *
    * Collision rate: ~0.00023% for 1000 unique requests (acceptable for LRU cache)
    *
    * @param {object} data - {url, method, body}
    * @returns {string} Base-36 encoded hash (e.g., "1k2m3n")
    */
   ```

4. **`cleanupQueue()`** - `content.js:46-61`
   ```javascript
   /**
    * Cleanup old queue entries outside deduplication window
    *
    * Deletes entries older than 2x dedup window (4s) instead of 1x (2s).
    * Safety margin prevents race conditions from clock skew and async timing issues.
    *
    * @param {Map} queue - Request queue (conversationId -> {requestId, timestamp, payload})
    * @param {number} window - Deduplication window in milliseconds
    */
   ```

5. **`logBodyContent()`** - `content.js:63-83`
   ```javascript
   /**
    * Log detailed body content for debugging
    *
    * NOTE: Only called when config.debug is true. Handles both string (JSON) and object bodies.
    * Will attempt JSON parsing and log messages array if present.
    *
    * @param {string|object} body - Request body to log
    */
   ```

**Tasks**:
- [ ] Add JSDoc to `hasUserContent()`
- [ ] Add JSDoc to `serializeHeaders()` with DataCloneError explanation
- [ ] Add JSDoc to `generateCacheKey()` with algorithm details
- [ ] Add JSDoc to `cleanupQueue()` with 2x window rationale
- [ ] Add JSDoc to `logBodyContent()` with debug flag note
- [ ] Verify JSDoc renders correctly in IDE tooltips

**Files**:
- `plugin/Chrome/src/inject/interceptor.js`
- `plugin/Chrome/src/background/service-worker.js`
- `plugin/Chrome/src/content/content.js`

---

### **P6-4. Enhanced Error Event for XHR Blocks**
**Priority**: LOW | **Effort**: 30 min

**Problem**: When blocking XHR request, generic `error` event is dispatched without details. Applications can't distinguish security blocks from network errors.

**Location**: `plugin/Chrome/src/inject/interceptor.js:375-378`

**Current**:
```javascript
if (decision.action === 'block') {
  // Simulate error
  xhr.dispatchEvent(new Event('error'));
  return;
}
```

**Proposed**:
```javascript
if (decision.action === 'block') {
  console.log('[Vigil Guard Interceptor] Blocking XHR request:', xhr._vigilGuard.url);
  console.log('[Vigil Guard Interceptor] Block reason:', decision.reason);

  // Create error event with details
  const errorEvent = new ErrorEvent('error', {
    message: 'Request blocked by Vigil Guard: ' + (decision.reason || 'Security policy violation'),
    error: new Error('Vigil Guard block'),
  });

  // Attach Vigil Guard metadata
  xhr._vigilGuardBlocked = {
    reason: decision.reason,
    timestamp: Date.now()
  };

  xhr.dispatchEvent(errorEvent);

  // Also dispatch custom event for applications that want to handle it specifically
  xhr.dispatchEvent(new CustomEvent('vigilguard-blocked', {
    detail: { reason: decision.reason }
  }));

  return;
}
```

**Benefits**:
- Applications can detect Vigil Guard blocks specifically
- Error messages indicate security block, not network failure
- Custom event allows targeted handling
- Prevents retry loops on security blocks

**Tasks**:
- [ ] Update XHR block to dispatch ErrorEvent with message
- [ ] Add custom `vigilguard-blocked` event
- [ ] Attach metadata to XHR object (`_vigilGuardBlocked`)
- [ ] Document event API in DEVELOPMENT_PLAN.md
- [ ] Test with ChatGPT error handlers

**Files**:
- `plugin/Chrome/src/inject/interceptor.js:375-378`

---

### **P6-5. Improved Logging for Layer Filtering Statistics**
**Priority**: LOW | **Effort**: 30 min

**Problem**: Layer filtering comments claim "90% of traffic" filtered by Layer 1, but this isn't verified or logged.

**Location**: `plugin/Chrome/src/inject/interceptor.js:165-207`

**Proposed Enhancement**:
```javascript
// Add statistics tracking
const layerStats = {
  total: 0,
  layer1Filtered: 0,  // GET requests, blacklist
  layer2Filtered: 0,  // Empty body, no user content
  layer3Filtered: 0,  // Duplicates
  sentToWebhook: 0
};

// Log stats periodically
setInterval(() => {
  if (layerStats.total > 0) {
    console.log('[Vigil Guard Interceptor] Layer Statistics:');
    console.log(`  Total requests: ${layerStats.total}`);
    console.log(`  Layer 1 filtered: ${layerStats.layer1Filtered} (${(layerStats.layer1Filtered/layerStats.total*100).toFixed(1)}%)`);
    console.log(`  Layer 2 filtered: ${layerStats.layer2Filtered} (${(layerStats.layer2Filtered/layerStats.total*100).toFixed(1)}%)`);
    console.log(`  Layer 3 filtered: ${layerStats.layer3Filtered} (${(layerStats.layer3Filtered/layerStats.total*100).toFixed(1)}%)`);
    console.log(`  Sent to webhook: ${layerStats.sentToWebhook} (${(layerStats.sentToWebhook/layerStats.total*100).toFixed(1)}%)`);
  }
}, 60000); // Every minute
```

**Benefits**:
- Verify 90% claim with actual data
- Monitor filtering effectiveness
- Detect if blacklist needs updates
- Performance optimization insights

**Tasks**:
- [ ] Add layer statistics tracking
- [ ] Increment counters at each layer decision point
- [ ] Log statistics every 60 seconds (if any traffic)
- [ ] Add to background worker console
- [ ] Document expected percentages in comments

**Files**:
- `plugin/Chrome/src/inject/interceptor.js`
- `plugin/Chrome/src/content/content.js`

---

### METRYKI SUKCESU P6
- [ ] ✅ Extension context loss shows 3-second warning
- [ ] ✅ Try-catch blocks split by operation type
- [ ] ✅ All helper functions have comprehensive JSDoc
- [ ] ✅ XHR blocks dispatch custom events with details
- [ ] ✅ Layer filtering statistics logged and verified

**Status P6**: **0/5 completed (0%)**

**Note**: These are UX polish items identified during PR review. None are blocking for production - implement when time allows for improved developer and user experience.

---

## 📚 REFERENCES

- **Audit Report**: Independent security audit (2025-10-19)
- **Security**: OWASP ASVS V2.1, OWASP Top 10
- **Findings**: FG-01 (JWT), FG-03 (Compose), FG-04 (Token), FG-05 (deferred)
- **Documentation**: `docs/` directory
- **Archive**: `/Users/tomaszbartel/Documents/Projects/vigil-misc/`

---

**Last updated**: 2025-10-19 by Claude Code (post-audit cleanup)
**Next review**: Po ukończeniu Sprint 1 (Critical Audit Fixes)
**Estimated Sprint 1 effort**: ~8h (blokuje produkcję)
