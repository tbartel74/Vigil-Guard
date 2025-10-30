# Changelog

All notable changes to Vigil Guard will be documented in this file.

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
