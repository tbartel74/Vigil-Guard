# Docker and runtime

Last updated: 2025-11-26

## Basic commands
- Start: `docker-compose up -d`
- Stop: `docker-compose down`
- Service logs: `docker-compose logs -f <service>`

## Main services and ports
- caddy:80, web-ui-frontend:80 (internal), web-ui-backend:8787, workflow:5678, heuristics:5005, semantic:5006, prompt-guard-api:8000, presidio-pii-api:5001, language-detector:5002, clickhouse:8123/9000, grafana:3000.

## Volumes
- `vigil_data/` – config, users.db.
- `clickhouse-data/`, `grafana-data/`.
- Llama model outside repo: `../vigil-llm-models/`.

## Network
- `vigil-network` – shared container network; Caddy reverse proxy routes traffic to internal services.

## Service health
- Web UI backend `/api/system/containers` or `docker ps`/`docker healthcheck` (if configured).

## Updating
- `git pull`, optionally `npm ci` in JS services, `docker-compose build --no-cache`, restart `docker-compose up -d`.
