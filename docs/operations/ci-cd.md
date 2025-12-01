# CI/CD

Last updated: 2025-11-26

GitHub Actions workflow (ci.yml) – key jobs:
- Lint/tests for frontend/backend (existing repo steps).
- Security audit, secret scan, install script check.
- **Heuristics Service - Unit Tests**: Node 20, `npm ci`, `npm test -- tests/unit/` in `services/heuristics-service`.
- **Semantic Service - Unit Tests**: Node 20, `npm ci`, `npm test -- tests/unit/` in `services/semantic-service`.
- Aggregator `all-checks` depends on the above.

Required secrets:
- Standard GitHub Actions access; if integrating with registries or external services, add relevant secrets (not covered here).

Local runs:
- Heuristics: `cd services/heuristics-service && npm ci && npm test -- tests/unit/`
- Semantic: `cd services/semantic-service && npm ci && npm test -- tests/unit/`
- Workflow e2e: `cd services/workflow && npm test -- tests/e2e/`
