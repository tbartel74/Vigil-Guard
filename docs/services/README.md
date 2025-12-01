# Vigil Guard Services Reference

<!-- GUI-HELP: Quick reference for all Vigil Guard microservices -->
<!-- GUI-SECTION: services -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Service Overview

| Service | Port | Role | Timeout |
|---------|------|------|---------|
| Heuristics (Branch A) | 5005 | Pattern/obfuscation detection | 1s |
| Semantic (Branch B) | 5006 | Embedding similarity | 2s |
| LLM Safety Engine (Branch C) | 8000 | Llama Guard classification | 3s |
| PII (Presidio) | 5001 | Dual-language PII detection | 5s |
| Language Detector | 5002 | Polish/English detection | 1s |
| Workflow (n8n) | 5678 | Pipeline orchestration | - |
| Web UI Backend | 8787 | Configuration API | - |
| Web UI Frontend | 80 | React dashboard | - |
| ClickHouse | 8123 | Analytics logging | - |

---

## Service Decision Tree

```
Input Request
    ↓
Which service handles it?
    │
    ├─ Detection (threat analysis)
    │   ├─ Heuristics → Pattern matching, entropy, obfuscation
    │   ├─ Semantic → Vector similarity to known attacks
    │   └─ LLM Safety Engine → LLM-based classification
    │
    ├─ Data Protection
    │   ├─ PII → Personal data redaction (EN/PL)
    │   └─ Language → Detect text language for routing
    │
    ├─ Orchestration
    │   └─ Workflow (n8n) → Coordinates all services
    │
    └─ Management
        ├─ Web UI → Configuration, monitoring
        └─ ClickHouse → Logging, analytics
```

---

## Branch A: Heuristics Service

**Endpoint:** `POST http://heuristics-service:5005/analyze`

```json
{ "text": "input", "request_id": "id-123", "lang": "pl|en" }
```

**Detectors:**
| Detector | Weight | Purpose |
|----------|--------|---------|
| Obfuscation | 0.25 | Zero-width chars, homoglyphs, mixed scripts |
| Structure | 0.20 | Code fences, boundaries, newlines |
| Whisper | 0.25 | Roleplay, dividers, question patterns |
| Entropy | 0.15 | KL divergence, bigram anomaly |
| Security | 0.15 | SQLi, XSS, command injection |

**Response:**
```json
{
  "score": 75,
  "threat_level": "HIGH",
  "confidence": 0.85,
  "critical_signals": ["security_attack"],
  "features": {
    "entropy": { "entropy_raw": 4.2, "bigram_anomaly_score": 0.3 },
    "security": { "detected_patterns": ["sql_injection"] }
  },
  "timing_ms": 45,
  "degraded": false
}
```

**Config:** `services/heuristics-service/config/default.json`

---

## Branch B: Semantic Service

**Endpoint:** `POST http://semantic-service:5006/analyze`

```json
{ "text": "input", "request_id": "id-123" }
```

**Purpose:** Compare input embeddings against known attack vectors.

**Response:**
```json
{
  "score": 60,
  "threat_level": "MEDIUM",
  "confidence": 0.72,
  "critical_signals": ["high_similarity"],
  "explanations": ["Similar to known jailbreak pattern"],
  "timing_ms": 120,
  "degraded": false
}
```

**Arbiter Boost:** `SEMANTIC_HIGH_SIMILARITY` when similarity > 0.8

---

## Branch C: LLM Safety Engine Analysis

**Endpoint:** `POST http://prompt-guard-api:8000/detect`

```json
{ "text": "input" }
```

**Purpose:** Llama Guard-based threat classification.

**Score Normalization:**
- `is_attack=true` → score = 85 (HIGH)
- Otherwise → score = risk_score × 100

**Response:**
```json
{
  "is_attack": true,
  "risk_score": 0.92,
  "confidence": 0.88,
  "verdict": "BLOCKED"
}
```

**Arbiter Boosts:** `CONSERVATIVE_OVERRIDE`, `LLM_GUARD_HIGH_CONFIDENCE`

---

## PII Service (Presidio)

**Endpoint:** `POST http://vigil-presidio-pii:5001/analyze`

**Languages:** Polish (pl) and English (en) in parallel

**Detected Entities:**
| Category | Types |
|----------|-------|
| Polish | PESEL, NIP, REGON, ID_CARD |
| International | SSN, CREDIT_CARD, IBAN |
| General | EMAIL, PHONE, URL, IP_ADDRESS |
| Personal | PERSON, LOCATION |

**Output Fields:**
- `_pii_sanitized`: boolean (true if PII found and redacted)
- `pii_classification`: `{ types: [], count: number, method: string }`
- `detected_language`: string ("pl" or "en")

**Fallback:** Regex patterns from `pii.conf` if Presidio offline

---

## Language Detector

**Endpoint:** `POST http://vigil-language-detector:5002/detect`

**Purpose:** Identify text language (Polish/English) for proper entity routing.

**Response:**
```json
{
  "language": "pl",
  "confidence": 0.95,
  "method": "hybrid"
}
```

**Methods:**
1. Entity-based hints (PESEL/NIP → Polish)
2. Statistical (langdetect library)
3. Hybrid (combined confidence)

---

## Workflow (n8n)

**File:** `services/workflow/workflows/Vigil Guard v2.0.0.json`

**Webhook:** `POST /webhook/vigil-guard-2`

**Pipeline Steps:**
1. Extract Input → validate format
2. Load Config (allowlist, pii.conf, unified_config)
3. 3-Branch Executor (parallel A/B/C)
4. Arbiter v2 (weights: 0.30/0.35/0.35, threshold: 50)
5. Decision: ALLOW → PII Redactor | BLOCK → Block Response
6. Log to ClickHouse (events_v2)
7. Output to plugin

**Degradation:** Branch timeout → score=0, degraded=true → arbiter reweights

---

## Web UI

**Frontend:** React 18 + Vite + Tailwind CSS v4
- Dev: http://localhost:5173
- Prod: http://localhost/ui

**Backend:** Express.js + JWT authentication
- Port: 8787
- API: `/api/*`

**Key Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| GET /api/system/containers | Service health status |
| GET /api/config | Fetch configuration |
| POST /api/save | Save configuration (ETag) |
| GET /api/audit | Configuration audit log |
| GET /api/prompts/list | Investigation panel data |

**Screenshots:**
- Arbiter Configuration: `docs/pic/Arbiter-Configuration-dashboard.png`
- Investigation Panel: `docs/pic/Investigation.png`
- Monitoring: `docs/pic/Monitoring-panel.png`

---

## Quick Links

| Service | Source Code | Tests |
|---------|-------------|-------|
| Heuristics | [services/heuristics-service/](../../services/heuristics-service/) | `npm test -- tests/unit/` |
| Semantic | [services/semantic-service/](../../services/semantic-service/) | `npm test -- tests/unit/` |
| LLM Safety Engine | [prompt-guard-api/](../../prompt-guard-api/) | Integration tests |
| PII | [services/presidio-pii-api/](../../services/presidio-pii-api/) | `tests/e2e/pii-detection.test.js` |
| Language | [services/language-detector/](../../services/language-detector/) | `tests/e2e/language-detection.test.js` |
| Workflow | [services/workflow/](../../services/workflow/) | `npm test` (100+ tests) |
| Web UI | [services/web-ui/](../../services/web-ui/) | Frontend: Vitest |

---

## Health Checks

```bash
# Check all services
./scripts/status.sh

# Individual health checks
curl http://localhost:5005/health    # Heuristics
curl http://localhost:5006/health    # Semantic
curl http://localhost:8000/health    # LLM Safety Engine
curl http://localhost:5001/health    # PII
curl http://localhost:5002/health    # Language
curl http://localhost:8123/ping      # ClickHouse
```

---

**Full architecture details:** [ARCHITECTURE.md](../ARCHITECTURE.md)
