<div align="center">
  <img src="./docs/pic/vigil_logo.png" alt="Vigil Guard Logo" width="200" height="200" />

  # Vigil Guard

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
  [![Docker](https://img.shields.io/badge/docker-required-blue)](https://www.docker.com/)
</div>

> **Enterprise-grade prompt injection detection and defense platform for Large Language Model applications.**

## Overview

Vigil Guard protects LLM applications from prompt injection attacks, jailbreak attempts, and malicious content through a 3-branch parallel detection architecture with real-time monitoring and configuration management.

### Key Features

| Feature | Description |
|---------|-------------|
| **3-Branch Detection** | Heuristics + Semantic + LLM Safety Engine in parallel |
| **44 Detection Categories** | Comprehensive threat coverage |
| **Dual-Language PII** | Polish + English via Microsoft Presidio |
| **Real-time Monitoring** | Grafana dashboards with 6 analytics panels |
| **Investigation Panel** | Advanced prompt search with decision analysis |
| **Dynamic Configuration** | Web-based GUI for security policies |
| **Browser Extension** | Chrome/Edge protection for ChatGPT/Claude.ai |
| **160+ Tests** | E2E suite with OWASP AITG coverage |

## Architecture

```
Input → Validation → [Branch A: Heuristics  ] → Arbiter → Decision
                   → [Branch B: Semantic     ] →   ↓
                   → [Branch C: LLM Safety Engine   ] → ALLOW/SANITIZE/BLOCK
                                                    ↓
                                              → PII Redaction → Output
```

**Arbiter Decision Fusion:**
- Weights: A=0.30, B=0.35, C=0.35
- Block threshold: 50 points
- Boost policies for high-confidence detections

## Quick Start

```bash
# Clone repository
git clone https://github.com/tbartel74/vigil-guard.git
cd vigil-guard

# Download Llama model (required)
./scripts/download-llama-model.sh

# Run installer (generates secrets, starts services)
./install.sh

# Access Web UI
open http://localhost/ui
```

**Installation time:** ~10 minutes | **Full guide:** [docs/operations/installation.md](docs/operations/installation.md)

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Web UI | 80 | Configuration interface |
| n8n | 5678 | Workflow engine |
| Grafana | 3001 | Monitoring dashboards |
| Heuristics | 5005 | Branch A detection |
| Semantic | 5006 | Branch B embeddings |
| LLM Safety Engine | 8000 | Branch C classification |
| Presidio PII | 5001 | PII detection |
| ClickHouse | 8123 | Analytics logging |

## Documentation

| Guide | Description |
|-------|-------------|
| [Quickstart](docs/overview/QUICKSTART.md) | 5-minute setup |
| [Architecture](docs/ARCHITECTURE.md) | Technical design |
| [User Guides](docs/guides/) | Dashboard, Investigation, Configuration |
| [Services Reference](docs/services/README.md) | All microservices |
| [API Reference](docs/api/web-api.md) | REST API |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues |

## Project Structure

```
vigil-guard/
├── services/
│   ├── workflow/           # n8n detection engine
│   │   ├── config/        # Detection rules (use Web UI!)
│   │   ├── tests/         # 160+ E2E tests
│   │   └── workflows/     # Vigil Guard v2.0.0.json
│   ├── web-ui/            # React + Express
│   ├── presidio-pii-api/  # Dual-language PII
│   ├── language-detector/ # PL/EN detection
│   └── monitoring/        # ClickHouse + Grafana
├── prompt-guard-api/      # Llama Guard service
├── plugin/                # Chrome extension
├── docs/                  # Documentation
└── docker-compose.yml     # 9 services
```

## Screenshots

| Screen | Image |
|--------|-------|
| Workflow Pipeline | ![Pipeline](docs/pic/workflow-pipeline.png) |
| Monitoring | ![Monitoring](docs/pic/Monitoring-panel.png) |
| Investigation | ![Investigation](docs/pic/Investigation.png) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Run tests
cd services/workflow && npm test

# Development
cd services/web-ui/frontend && npm run dev
```

## Support

### Getting Help

| Resource | Link |
|----------|------|
| Documentation | [docs/](docs/) |
| FAQ | [docs/FAQ.md](docs/FAQ.md) |
| Troubleshooting | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Issue Tracker | [GitHub Issues](https://github.com/tbartel74/vigil-guard/issues) |

### Quick Diagnostics

```bash
# Check service health
./scripts/status.sh

# View logs
./scripts/logs.sh

# Test webhook
curl -X POST http://localhost:5678/webhook/vigil-guard-2 \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"test","sessionId":"demo"}'
```

### Reporting Issues

When reporting issues, include:
1. Output of `./scripts/status.sh`
2. Relevant logs from `./scripts/logs.sh`
3. Steps to reproduce
4. Expected vs actual behavior

## License

**MIT License** - See [LICENSE](LICENSE)

**Third-Party:**
- Meta Llama Prompt Guard 2: Llama 4 Community License
- Microsoft Presidio: Apache License 2.0
- spaCy: MIT License

---

<div align="center">

**Built with Llama** - Powered by Meta's Llama Guard 2

[Documentation](docs/) • [Installation](docs/operations/installation.md) • [User Guides](docs/guides/) • [Troubleshooting](docs/TROUBLESHOOTING.md)

</div>
