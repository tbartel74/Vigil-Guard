# Testy

Last updated: 2025-11-26

## Heuristics Service
- `npm ci`
- `npm test -- tests/unit/` – testy jednostkowe scorer/detektory.
- `npm test -- tests/e2e/` – heuristics-comprehensive, security-attacks, multi-language entropy.

## Semantic Service
- `npm ci`
- `npm test -- tests/unit/`

## Workflow
- `npm test -- tests/e2e/events-v2-schema.test.js` – ClickHouse events_v2 schema compliance.
- `npm test -- tests/e2e/owasp-aitg-uncovered.test.js` – security scenario coverage.

## Smoke
- Heuristics: `curl http://localhost:5005/analyze -d '{"text":"hi","request_id":"t1"}'`
- Workflow webhook: `curl http://localhost:5678/webhook/vigil-guard-2 -d '{"chatInput":"hi","sessionId":"demo"}'`

## CI (GitHub Actions)
- Heuristics unit job, Semantic unit job (Node 20) + existing lint/security/install checks.
