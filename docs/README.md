# Vigil Guard Documentation

<!-- GUI-HELP: Documentation hub for Vigil Guard v2.0.0 -->
<!-- GUI-SECTION: docs-hub -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Quick Navigation

| I want to... | Go to |
|--------------|-------|
| Get started quickly | [Quickstart](overview/QUICKSTART.md) |
| Understand the architecture | [Architecture](ARCHITECTURE.md) |
| Configure detection rules | [Configuration Guide](guides/configuration.md) |
| Monitor threats | [Dashboard Guide](guides/dashboard.md) |
| Investigate prompts | [Investigation Guide](guides/investigation.md) |
| Troubleshoot issues | [Troubleshooting](TROUBLESHOOTING.md) |
| Use the API | [API Reference](api/web-api.md) |

---

## Documentation Structure

```
docs/
├── README.md                 # This file (hub)
├── ARCHITECTURE.md           # 3-branch system design
├── SECURITY.md               # Security policies
├── TROUBLESHOOTING.md        # Common issues
│
├── overview/
│   └── QUICKSTART.md         # 5-minute setup
│
├── guides/                   # User guides
│   ├── README.md            # Guide navigation
│   ├── dashboard.md         # Monitoring
│   ├── investigation.md     # Prompt analysis
│   ├── configuration.md     # Settings
│   ├── administration.md    # User management
│   └── settings.md          # Preferences
│
├── services/
│   └── README.md            # All microservices
│
├── config/
│   ├── unified-config.md    # Main configuration
│   ├── heuristics.md        # Branch A settings
│   └── env.md               # Environment variables
│
├── operations/
│   ├── installation.md      # Full install guide
│   ├── docker.md            # Container management
│   └── troubleshooting.md   # Quick fixes
│
├── api/
│   ├── web-api.md           # REST API reference
│   ├── events_v2.md         # ClickHouse schema
│   └── plugin.md            # Browser extension API
│
├── plugin/
│   ├── BROWSER_EXTENSION.md # Chrome extension docs
│   └── QUICK_START.md       # Extension setup
│
└── specialized/
    ├── GRAFANA_SETUP.md     # Dashboard setup
    ├── CLICKHOUSE_RETENTION.md # Data lifecycle
    └── WEBHOOK_SECURITY.md  # Webhook auth
```

---

## Key Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| Web UI | http://localhost/ui | Configuration interface |
| n8n Webhook | POST /webhook/vigil-guard-2 | Detection endpoint |
| Grafana | http://localhost:3001 | Dashboards |
| ClickHouse | http://localhost:8123 | Analytics |

**Internal Services:**
| Service | Endpoint | Timeout |
|---------|----------|---------|
| Heuristics (A) | http://heuristics-service:5005/analyze | 1s |
| Semantic (B) | http://semantic-service:5006/analyze | 2s |
| LLM Safety Engine (C) | http://prompt-guard-api:8000/detect | 3s |
| PII | http://vigil-presidio-pii:5001/analyze | 5s |

---

## Pipeline Overview

```
Input → Validation → 3-Branch Executor → Arbiter → Decision
                           ↓                ↓
                     [A] [B] [C]      ALLOW/BLOCK
                                           ↓
                                     PII Redaction
                                           ↓
                                     ClickHouse Log
                                           ↓
                                        Output
```

**Arbiter:** Weights A=0.30, B=0.35, C=0.35 | Block threshold: 50

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 2.0.0 | 2025-11 | 3-branch architecture, Arbiter v2 |
| 1.8.1 | 2025-11 | Hybrid language detection |
| 1.7.0 | 2025-11 | Sanitization integrity |
| 1.6.0 | 2025-01 | Presidio integration |

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md)

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

**Quick commands:**
```bash
# Run tests
cd services/workflow && npm test

# Development
cd services/web-ui/frontend && npm run dev
```

---

**Need help?** See [Troubleshooting](TROUBLESHOOTING.md) or file an [issue](https://github.com/yourusername/vigil-guard/issues).
