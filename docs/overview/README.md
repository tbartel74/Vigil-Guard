# Vigil Guard – Overview

Last updated: 2025-11-26

This document gives a quick picture of the platform: components, how they communicate, and the data flow in the 3-branch architecture (Heuristics, Semantic, NLP Safety).

## Platform goals
- Protect LLM apps from prompt injection, obfuscation, SQLi/XSS/command injection, privilege escalation.
- Dual-language PII redaction (pl/en) with audit of detected types.
- Real-time monitoring (ClickHouse + Grafana) and a Web UI / browser plugin control plane.

## Key components
- Workflow Engine (n8n) – orchestrates the full pipeline, loads configuration, validates input, runs 3 branches and PII.
- Branch A – Heuristics Service (obfuscation/structure/whisper/entropy/security detectors).
- Branch B – Semantic Service (embedding similarity).
- Branch C – NLP Safety Analysis (Llama Guard-based classifier).
- PII Service (Presidio pl/en + regex fallback).
- Web UI (frontend + backend) – configuration, health checks, log browsing.
- ClickHouse – event logging (events_v2) and analytics, Grafana – dashboards.
- Browser Plugin – enforces decisions (allow/block/sanitize) on the client side.

## Visual preview
- n8n 3-branch pipeline:  
  ![Workflow pipeline](../pic/Workflow-pipeline.png)
- Monitoring dashboard (Grafana):  
  ![Monitoring panel](../pic/Monitoring-panel.png)
- Arbiter settings (Web UI):  
  ![Arbiter configuration](../pic/Arbiter-Configuration-dashboard.png)
- Investigation panel (Web UI):  
  ![Investigation](../pic/Invastigation.png)

## High-level flow
1) Input (Webhook/Chat Trigger) → length/format validation.  
2) Load `allowlist.schema.json`, `pii.conf`, `unified_config.json`.  
3) 3-Branch Executor (parallel A/B/C) with timeouts 1s/2s/3s.  
4) Arbiter (default weights: A 0.30, B 0.35, C 0.35; BLOCK threshold 50; priority boosts; degraded branches reweighted).  
5) ALLOW → PII Redactor; BLOCK → fast response without PII.  
6) Build NDJSON → insert into ClickHouse `n8n_logs.events_v2` → response to client/plugin.  

## Configuration at a glance
- Central file: `services/workflow/config/unified_config.json` (normalization, sanitization, enforcement, arbiter, pii, prompt_guard_policy).
- Branch A: `services/heuristics-service/config/default.json` + environment overrides (weights, thresholds, lang-aware entropy, security thresholds).
- PII: Presidio URL, timeouts, redaction tokens (including URL), regex fallback.

## Tests and CI
- Unit tests: heuristics service, semantic service (GitHub Actions).
- Workflow E2E (n8n): events_v2 schema, OWASP AITG uncovered.
- Local: `npm test -- tests/unit/` (heuristics), `npm test -- tests/unit/` (semantic), workflow e2e in `services/workflow/tests`.

## Key document links
- Quickstart: `docs/overview/QUICKSTART.md`
- Architecture: `docs/architecture/system.md`, `docs/architecture/pipeline.md`, `docs/architecture/branches.md`
- Configuration: `docs/config/unified-config.md`, `docs/config/heuristics.md`, `docs/config/env.md`
- Services: `docs/services/heuristics.md`, `docs/services/semantic.md`, `docs/services/nlp-safety.md`, `docs/services/pii.md`, `docs/services/workflow.md`, `docs/services/web-ui.md`
- API/Logs: `docs/api/events_v2.md`, `docs/api/plugin.md`, `docs/api/web-api.md`
- Operations: `docs/operations/installation.md`, `docs/operations/docker.md`, `docs/operations/ci-cd.md`, `docs/operations/troubleshooting.md`
- Security: `docs/security/threat-detection.md`, `docs/security/sanitization.md`, `docs/security/pii-security.md`
