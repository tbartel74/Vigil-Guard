# Vigil Guard Workflow Tests

Comprehensive test suite for the Vigil Guard n8n workflow security system.

## Prerequisites

1. **n8n workflow** must be running and active
2. **ClickHouse** must be accessible
3. **Environment variables** must be configured in `.env`:
   - `CLICKHOUSE_PASSWORD` - ClickHouse database password
   - `WEBUI_ADMIN_PASSWORD` - Web UI admin password

## Quick Start

### 1. Verify ClickHouse Connection (IMPORTANT: Run this first!)

```bash
cd services/workflow
./tests/verify-clickhouse.sh
```

### 2. Run Tests

```bash
cd services/workflow  
npm test
```

## Test Structure

- **API Tests**: 12 tests for Web UI backend endpoints
- **E2E Tests**: 150+ tests for complete workflow execution
  - Bypass scenarios (25 tests)
  - PII detection (30+ tests)
  - Language detection (50 tests) **NEW v1.8.1**
  - False positives (15 tests)
  - Input validation (10 tests)
  - OWASP AITG (50+ tests)
- **Expected Results**: 160+/165 tests passing

## Test Suites

### Language Detection Tests (NEW v1.8.1)
**File:** `e2e/language-detection.test.js`
**Count:** 50 tests
**Purpose:** Validates language-aware PII detection to prevent cross-language false positives

**Key Coverage:**
- Polish text detection (8 tests)
- English text detection (6 tests)
- Edge cases (10 tests)
- Mixed language (3 tests)
- PII cross-language handling (9 tests)
- Performance (2 tests)
- Regression tests (3 tests)
- Statistics logging (2 tests)
- Service health (2 tests)

**Documentation:** See `tests/LANGUAGE_DETECTION_TESTS.md`

**Run:** `npm test -- language-detection.test.js`

### Other Test Suites
- **PII Detection:** `pii-detection-*.test.js` (30+ tests)
- **Bypass Scenarios:** `bypass-scenarios.test.js` (25 tests)
- **False Positives:** `false-positives.test.js` (15 tests)
- **OWASP AITG:** `owasp-aitg-*.test.js` (50+ tests)
- **Input Validation:** `input-validation.test.js` (10 tests)

## Recent Changes

### 2025-02-01: Language Detection Integration (v1.8.1)
**New Feature**: Language detection microservice prevents cross-language false positives
- Added 50 E2E tests for language detection
- Validates "jest" → NOT [PERSON] in Polish text
- Tests edge cases, mixed language, and performance

### 2025-10-18: SQL/XSS Configuration Update
**Configuration Change**: SQL_XSS_ATTACKS category `base_weight` increased from 30 → 50 in `rules.config.json`.

**Test Status**: Tests use baseline detection thresholds (score >= 30) to remain compatible with workflow cache behavior. Enhanced detection will activate once workflow is updated to reload configuration.

**Note**: n8n workflow may cache JavaScript code from nodes. After config changes:
1. Restart n8n container: `docker restart vigil-n8n`
2. Verify workflow loads from `/home/node/config/rules.config.json`
3. Tests validate detection works (score >= 30), not specific threshold values

**Known Issue**:
- `false-positives.test.js` - "Security education content" test fails (expects `ALLOWED`, gets `BLOCKED`)
- This is a legitimate false positive requiring allowlist adjustment (tracked separately)

## Troubleshooting

### "CLICKHOUSE_PASSWORD not found in .env"
Add password to `.env` in repository root:
```bash
echo "CLICKHOUSE_PASSWORD=your_password" >> ../../.env
```

### "Event not found in ClickHouse"
**FIXED!** This was caused by UTC/local timezone mismatch. The fix:
- Removed timestamp filter from query (sessionId is unique identifier)
- Increased max wait time to 10 seconds

For more details, run: `./tests/verify-clickhouse.sh`
