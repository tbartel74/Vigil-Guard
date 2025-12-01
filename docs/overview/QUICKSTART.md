# Quickstart (5 minutes)

Last updated: 2025-11-26

## Requirements
- Node.js ≥ 18, Docker + Docker Compose, Git.
- Llama Prompt Guard 2 model (downloaded via script).

## Steps
1) Clone repo:
```bash
git clone https://github.com/tbartel74/Vigil-Guard.git
cd Vigil-Guard
```
2) Download model (after accepting Meta license):
```bash
./scripts/download-llama-model.sh   # saves to ../vigil-llm-models/
```
3) Run installer:
```bash
chmod +x install.sh
./install.sh
```
4) Start services (docker-compose):
```bash
docker-compose up -d
```
5) Smoke test heuristics (Branch A):
```bash
curl -X POST http://localhost:5005/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","request_id":"qs-smoke"}'
```
6) Smoke test workflow webhook:
```bash
curl -X POST http://localhost:5678/webhook/vigil-guard-2 \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"Hello world","sessionId":"demo-1"}'
```

## Key ports
- Web UI: 5173 (dev) / 80 via Caddy (`/ui/`), backend 8787.
- Workflow (n8n): 5678 (`/n8n/`), webhook `/webhook/vigil-guard-2`.
- PII API: 5001, Language Detector: 5002.
- Heuristics: 5005, Semantic: 5006, LLM Safety Engine: 8000.
- ClickHouse: 8123 (HTTP), Grafana: 3000.

## What next
- Check architecture: `docs/architecture/pipeline.md`
- Configure: `docs/config/unified-config.md`, `docs/config/heuristics.md`
- Run tests: `docs/tests/index.md`
