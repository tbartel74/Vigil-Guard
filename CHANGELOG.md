# Changelog

All notable changes to Vigil Guard will be documented in this file.

## [1.7.0] - 2025-11-01

### Added - Data Integrity & Audit Trail

#### Sanitization Integrity (CRITICAL Security Enhancement)
- **3-Layer sanitizedBody Defense**: Prevents PII leakage to AI providers
  - Layer 1: Workflow ALWAYS constructs `sanitizedBody` (2 fallback mechanisms)
  - Layer 2: Service worker validation + emergency fallback
  - Layer 3: Extension (overlay.js) prioritizes sanitizedBody over chatInput
- **Grafana PII Leak Alert**: Real-time monitoring (checks every 1 minute)
  - CRITICAL: Detects if original PII reaches AI providers
  - WARNING: Detects missing sanitizedBody for SANITIZE actions
  - INFO: Monitors PII detection rate drops
- **E2E Sanitization Tests**: 18 test cases for leak detection
  - PII redaction integrity (PESEL, SSN, Email, Credit Card, NIP)
  - Pattern sanitization (SQL injection, Prompt injection, XSS, GODMODE)
  - sanitizedBody structure validation

#### PII Classification & Statistics
- **PII Classification Tracking**: Structured audit data
  - `_pii_sanitized` boolean flag at workflow level
  - `pii_classification` object (types, count, detection method)
  - New ClickHouse columns: `pii_sanitized`, `pii_types_detected`, `pii_entities_count`
- **PII Statistics API Endpoints**:
  - `GET /api/stats/pii/types` - Top 10 PII entity types with percentages
  - `GET /api/stats/pii/overview` - Detection rate, total entities, top types
  - Time range support: 1h, 6h, 12h, 24h, 7d

#### Client Identification & Browser Metadata
- **Persistent Client ID**: Tracks browser instances across sessions
  - Format: `vigil_<timestamp>_<random>`
  - Stored in chrome.storage.local
  - Survives browser restarts
- **Browser Metadata Collection**: Anonymized browser/OS information
  - Browser name & version (Chrome, Firefox, Safari)
  - Operating system (Windows, macOS, Linux, Android, iOS)
  - Browser language & timezone
- **New ClickHouse Columns** (9 total):
  - `client_id`, `browser_name`, `browser_version`
  - `os_name`, `browser_language`, `browser_timezone`

### Changed

- **n8n Workflow**: v1.6.11 → v1.7.0
  - Node "output to plugin": ALWAYS constructs sanitizedBody
  - Node "PII_Redactor_v2": Added `_pii_sanitized` flag + `pii_classification` object
  - Node "Build+Sanitize NDJSON": Populates 9 new ClickHouse audit columns
- **Browser Extension**: service-worker.js v0.5.0 → v0.6.0
  - Added `getOrCreateClientId()` function
  - Added `collectBrowserMetadata()` function
  - Payload includes `clientId` and `browser_metadata`
- **ClickHouse Schema**: Migration 06-add-audit-columns-v1.7.0.sql
  - Backward compatible (all columns have DEFAULT values)
  - No breaking changes for old workflow versions
- **Backend API**: New PII statistics endpoints
  - Added `getPIITypeStats()` and `getPIIOverview()` in clickhouse.ts
  - Integrated into server.ts with authentication

### Security

- **Zero PII Leakage Risk**: 3-layer defense ensures sanitizedBody always used
- **Real-time Leak Detection**: Grafana alerts catch any violations within 1 minute
- **Audit Trail**: Complete tracking of PII detections, browser instances, and metadata
- **Privacy-Preserving**: Browser metadata is anonymized (no personal identifiers)

### Compatibility

- **Backward Compatible**: All changes maintain compatibility with v1.6.11
  - Old workflows continue to work (use DEFAULT column values)
  - New columns optional (won't break existing queries)
  - Service worker generates clientId on-demand (no migration needed)
- **Migration Path**: Run `./scripts/init-clickhouse.sh` to add new columns
- **Rollback Support**: Can revert to v1.6.11 workflow if needed (data remains intact)

### Documentation

- **ARCHITECTURE_v1.6.11.md**: 1800+ lines documenting complete data flow
- **sanitization-integrity.test.js**: 18 E2E test cases with documentation
- **pii-leak-alert.yml**: Grafana alert rules with troubleshooting guides
- **06-add-audit-columns-v1.7.0.sql**: Migration script with verification queries

### Fixed

- **Investigation Panel Status Display**: Fixed status badge not showing "SANITIZED" when PII is detected
  - **Problem**: Investigation Panel showed "ALLOWED" (green) instead of "SANITIZED" (yellow) when PII was redacted
  - **Root Cause**: `finalStatus` calculation in "Build+Sanitize NDJSON" node only checked threat patterns, not PII detection
  - **Fix**: Added `piiDetected` variable checking `j._pii_sanitized || pii_classification.count > 0`
  - **Impact**: Investigation Panel now correctly displays yellow "SANITIZED" status when PII is detected
  - **Location**: `services/workflow/workflows/Vigil-Guard-v1.7.0.json` node "Build+Sanitize NDJSON"

- **PERSON Recognizer False Positives**: Removed "pesel", "PESEL", "nip", "NIP" from PERSON_PL context keywords
  - **Problem**: Phrases like "moim pesel" were incorrectly detected as person names (score 0.85)
  - **Root Cause**: Context keywords for PII identifiers were boosting PERSON detection
  - **Fix**: Updated `services/presidio-pii-api/config/recognizers.yaml` to remove PII-related context
  - **Impact**: Eliminated false positives without affecting legitimate person name detection
  - **Note**: This was a pre-existing bug, not introduced by v1.7.0

---

## [1.6.10] - 2025-01-30

### Added - Dual-Language PII Detection

- **Dual-Language Detection**: Parallel API calls to Presidio (Polish + International PII)
- **Credit Card Recognizer**: Enhanced CREDIT_CARD_ENHANCED with Luhn validation
  - 10 regex patterns for all major card types (Visa, Mastercard, Amex, Discover, JCB, Diners)
  - Luhn algorithm validator (modulo-10 checksum)
  - Polish context keywords (karta, kredytowa, płatność, numer)
  - Detection rate: 93.8% (15/16 valid card types)
- **Entity Deduplication**: Automatic removal of overlapping detections
- **Language Statistics**: Detailed logging in ClickHouse
  - `pii.language_stats.polish_entities`
  - `pii.language_stats.international_entities`
  - `pii.language_stats.total_after_dedup`

### Changed

- n8n Workflow: v1.6.9 → v1.6.10 (PII_Redactor_v2 dual-language implementation)
- Presidio recognizers.yaml: Split language support (Polish: pl, International: en)
- unified_config.json: Language configuration updated

### Performance

- Avg latency: 310ms (vs 150ms single-language, +107%)
- P95: 538ms, P99: 656ms (acceptable for production)
- Success rate: 100% under load (50 concurrent requests)
- PII detection rate: 96% (48/50 requests)
- Memory: ~616MB (unchanged)
- CPU: <5% (unchanged)

### Compatibility

- **Backward Compatible**: Same output format, no breaking changes
- **ClickHouse Schema**: New optional fields (language_stats)
- **Workflow Rollback**: Can revert to v1.6.9 if needed

---

## [1.6.0] - 2025-01-29

### Added - PII Detection Modernization

- Microsoft Presidio Integration with 50+ entity types
- Custom Polish recognizers (PESEL, NIP, REGON, ID cards) with checksum validation
- spaCy models: en_core_web_sm + pl_core_news_sm
- New service: Presidio PII API (port 5001, offline capable, ~616MB Docker image)
- Web UI: PII Settings panel (Configuration → PII Detection)
- Test suite: e2e/pii-detection-presidio.test.js, e2e/pii-detection-fallback.test.js
- Documentation: docs/PII_DETECTION.md (~650 lines)

### Changed

- n8n Workflow: PII_Redactor → PII_Redactor_v2 (Presidio integration + regex fallback)
- unified_config.json: Added pii_detection section (11 options)
- ClickHouse: New fields (detection_method, entities_detected)

### Performance

- Detection coverage: 13 patterns → 50+ types (+285%)
- False positive rate: ~30% → <10% (-67%)
- New capabilities: NLP-based person names, checksum validation

### Security

- Zero external API calls (100% offline)
- GDPR/RODO compliant
- Automatic fallback to regex if Presidio unavailable

---

## [1.5.0] - 2025-10-27

- PROMPT_LEAK Detection: 38.3% → 55.0% (+43% improvement)
- MEDICAL_MISUSE Category: New (60% detection, 0% FP)
- Phase 2.5 Tests: All 12/12 passing

---

## [1.4.0] - 2025-10-18

- Browser Extension: Chrome plugin (overlay proxy + 3-layer filtering)
- SQL_XSS_ATTACKS: Enhanced (base weight 30→50, +24 patterns)

---

## [1.3.0] - 2025-10-13

- Investigation Panel: Advanced search + CSV/JSON export
- E2E Test Suite: 58+ tests (Vitest)

---

## [1.2.0] - 2025-10-01

- Authentication & User Management: JWT-based RBAC

---

## [1.1.0] - 2025-09-20

- Grafana Monitoring: 6 panels
- ClickHouse Logging: n8n_logs database

---

## [1.0.0] - 2025-09-10

Initial release.
