# System Architecture

Last updated: 2025-11-26

## Context view
- Client (app or browser plugin) sends requests to the n8n webhook (`/webhook/vigil-guard-2`) or Chat Trigger.
- n8n workflow performs validation, runs three detection branches plus PII, then logs to ClickHouse.
- Web UI (frontend + backend) provides configuration, health checks, and log/analytics access (ClickHouse/Grafana).

## Containers / services
- Caddy (reverse proxy, port 80) – routes /ui → frontend, /ui/api → backend, /n8n → workflow, /grafana → Grafana.
- Web UI frontend (React/Vite/Tailwind, port 5173 dev / nginx prod).
- Web UI backend (Express, port 8787) – configuration API, health checks.
- Workflow (n8n, port 5678) – 3-branch pipeline, PII, logging.
- Heuristics Service (Branch A, port 5005) – obfuscation/structure/whisper/entropy/security detectors.
- Semantic Service (Branch B, port 5006) – embedding similarity.
- NLP Safety Analysis (Branch C, port 8000) – Llama Guard-based threat classifier.
- PII API (Presidio dual-lang, port 5001) + Language Detector (5002).
- ClickHouse (8123/9000) – events_v2 database; Grafana (3000) – dashboards.
- Volumes: vigil_data (config, users.db), clickhouse-data, grafana-data, external Llama model (`../vigil-llm-models/`).

## Network and security
- Shared docker network `vigil-network`; internal addresses used in workflow and backend.
- Service passwords/keys generated during installation; environment variables in `.env`.
- Reverse proxy handles TLS termination per Caddy config (HTTP by default in dev).
