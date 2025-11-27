# Vigil Guard Documentation Hub

Last updated: 2025-11-26

## What's inside
- 3-branch architecture (Heuristics, Semantic, NLP Safety) and n8n pipeline.
- Installation, runtime, and maintenance guides.
- Central configuration (`unified_config.json`), heuristics settings, and environment variables.
- Service guides (A/B/C, PII, Web UI, workflow) and API/ClickHouse contracts.
- Security (detection, sanitization, PII) and tests/CI.

## Quick links
- Start: `overview/README.md`, `overview/QUICKSTART.md`
- Architecture: `architecture/system.md`, `architecture/pipeline.md`, `architecture/branches.md`
- Configuration: `config/unified-config.md`, `config/heuristics.md`, `config/env.md`
- Services: `services/heuristics.md`, `services/semantic.md`, `services/nlp-safety.md`, `services/pii.md`, `services/workflow.md`, `services/web-ui.md`
- API/Logs: `api/events_v2.md`, `api/plugin.md`, `api/web-api.md`
- Operations: `operations/installation.md`, `operations/docker.md`, `operations/ci-cd.md`, `operations/troubleshooting.md`
- Security: `security/threat-detection.md`, `security/sanitization.md`, `security/pii-security.md`
- Tests: `tests/index.md`

## Key ports and endpoints
- Workflow webhook: `POST /webhook/vigil-guard-2` (n8n, port 5678)
- Branch A: `http://heuristics-service:5005/analyze`
- Branch B: `http://semantic-service:5006/analyze`
- Branch C: `http://prompt-guard-api:8000/detect` (NLP Safety)
- PII: `http://vigil-presidio-pii:5001/analyze`
- Web UI backend: `http://localhost:8787` (prod via Caddy `/ui/api/*`)
- Web UI frontend: `http://localhost/ui/` (prod) or `http://localhost:5173` (dev)
- ClickHouse: `http://localhost:8123`, Grafana: `http://localhost:3000`

## Minimal pipeline walkthrough
Input → validation → 3-Branch Executor (A/B/C) → Arbiter → (ALLOW → PII) | (BLOCK → fast response) → Build NDJSON → ClickHouse → output/plugin.
