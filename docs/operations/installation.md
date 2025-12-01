# Installation

Last updated: 2025-11-26

## Requirements
- Node.js ≥ 18, Docker + Docker Compose, Git, ~30 GB disk (large spaCy models + cache).
- Access to Llama Prompt Guard 2 model (Hugging Face, license acceptance).

## Steps
1) Clone the repo and enter directory.  
2) Download model:
```bash
./scripts/download-llama-model.sh   # saves to ../vigil-llm-models/
```
3) Set execute bits:
```bash
chmod +x install.sh scripts/download-llama-model.sh
```
4) Run installer:
```bash
./install.sh
```
- Creates `.env`, generates passwords, initializes ClickHouse, sets volumes, builds images.
5) Start all services:
```bash
docker-compose up -d
```

## Verification
- Heuristics: `curl http://localhost:5005/analyze -d '{"text":"hi","request_id":"t1"}'`
- Webhook: `curl http://localhost:5678/webhook/vigil-guard-2 -d '{"chatInput":"hi","sessionId":"demo"}'`
- ClickHouse: `curl http://localhost:8123/ -u user:pass`
- Web UI: `http://localhost/ui/`

## Important `.env` entries
- `JWT_SECRET`, `CLICKHOUSE_PASSWORD`, `GF_SECURITY_ADMIN_PASSWORD`
- `GROQ_API_KEY` (if required by LLM Safety Engine)
- Volume paths: `vigil_data`, `clickhouse-data`, `grafana-data`

## Models
- Llama Prompt Guard 2 86M – stored outside repo: `../vigil-llm-models/Llama-Prompt-Guard-2-86M/` (gitignored).
