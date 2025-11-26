# Vigil Guard Documentation Hub

Last updated: 2025-11-26

## Co tu znajdziesz
- Architektura 3-branch (Heuristics, Semantic, NLP Safety) i pipeline n8n.
- Instrukcje instalacji, uruchamiania i utrzymania.
- Konfigurację centralną (`unified_config.json`), heurystyki i zmienne środowiskowe.
- Opisy serwisów (A/B/C, PII, Web UI, workflow) oraz kontrakty API/ClickHouse.
- Bezpieczeństwo (detekcja, sanitization, PII) i testy/CI.

## Szybkie linki
- Start: `overview/README.md`, `overview/QUICKSTART.md`
- Architektura: `architecture/system.md`, `architecture/pipeline.md`, `architecture/branches.md`
- Konfiguracja: `config/unified-config.md`, `config/heuristics.md`, `config/env.md`
- Serwisy: `services/heuristics.md`, `services/semantic.md`, `services/nlp-safety.md`, `services/pii.md`, `services/workflow.md`, `services/web-ui.md`
- API/Logi: `api/events_v2.md`, `api/plugin.md`, `api/web-api.md`
- Operacje: `operations/installation.md`, `operations/docker.md`, `operations/ci-cd.md`, `operations/troubleshooting.md`
- Bezpieczeństwo: `security/threat-detection.md`, `security/sanitization.md`, `security/pii-security.md`
- Testy: `tests/index.md`

## Najważniejsze porty i endpointy
- Workflow webhook: `POST /webhook/vigil-guard-2` (n8n, port 5678)
- Branch A: `http://heuristics-service:5005/analyze`
- Branch B: `http://semantic-service:5006/analyze`
- Branch C: `http://prompt-guard-api:8000/detect` (NLP Safety)
- PII: `http://vigil-presidio-pii:5001/analyze`
- Web UI backend: `http://localhost:8787` (prod przez Caddy `/ui/api/*`)
- Web UI frontend: `http://localhost/ui/` (prod) lub `http://localhost:5173` (dev)
- ClickHouse: `http://localhost:8123`, Grafana: `http://localhost:3000`

## Minimalny przebieg (pipeline)
Wejście → walidacja → 3-Branch Executor (A/B/C) → Arbiter → (ALLOW → PII) | (BLOCK → szybka odpowiedź) → Build NDJSON → ClickHouse → output/plugin.
