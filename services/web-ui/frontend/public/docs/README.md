# Vigil Guard Documentation Hub

Last updated: 2025-11-26

## What’s inside
- 3-branch architecture (Heuristics, Semantic, NLP Safety) and n8n pipeline.
- Installation, runtime, and maintenance guides.
- Central configuration (`unified_config.json`), heuristics settings, and environment variables.
- Service guides (A/B/C, PII, Web UI, workflow) and API/ClickHouse contracts.
- Security (detection, sanitization, PII) and tests/CI.

## Quick links

**Getting Started**
- [Overview](overview/README.md) • [Quickstart Guide](overview/QUICKSTART.md)

**Architecture**
- [System Overview](architecture/system.md) • [3-Branch Pipeline](architecture/pipeline.md) • [Detection Branches](architecture/branches.md)

**Configuration**
- [Unified Config](config/unified-config.md) • [Heuristics Settings](config/heuristics.md) • [Environment Variables](config/env.md)

**Services**
- [Heuristics (Branch A)](services/heuristics.md) • [Semantic (Branch B)](services/semantic.md) • [NLP Safety (Branch C)](services/nlp-safety.md)
- [PII Detection](services/pii.md) • [Workflow (n8n)](services/workflow.md) • [Web UI](services/web-ui.md)

**API & Logs**
- [Events v2](api/events_v2.md) • [Plugin API](api/plugin.md) • [Web API](api/web-api.md)

**Operations**
- [Installation](operations/installation.md) • [Docker](operations/docker.md) • [CI/CD](operations/ci-cd.md) • [Troubleshooting](operations/troubleshooting.md)

**Security**
- [Threat Detection](security/threat-detection.md) • [Sanitization](security/sanitization.md) • [PII Security](security/pii-security.md)
- [Webhook Security](WEBHOOK_SECURITY.md)

**Testing**
- [Test Suite](tests/index.md)

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
