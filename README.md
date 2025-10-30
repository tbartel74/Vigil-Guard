<div align="center">
  <img src="./docs/pic/vigil_logo.png" alt="Vigil Guard Logo" width="200" height="200" />

  # Vigil Guard

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
  [![Docker](https://img.shields.io/badge/docker-required-blue)](https://www.docker.com/)
</div>

> **Enterprise-grade prompt injection detection and defense platform with real-time monitoring and configuration management for Large Language Model applications.**

## 🛡️ Overview

Vigil Guard is a comprehensive security platform designed to protect Large Language Model (LLM) applications from prompt injection attacks, jailbreak attempts, and malicious content. The system provides real-time threat detection, content sanitization, and analytics through an integrated monitoring dashboard.

### Key Features

- 🔍 **Advanced Threat Detection** - Multi-layer detection engine with 34 detection categories
- 🛡️ **Intelligent Sanitization** - Light and heavy sanitization modes with configurable policies
- 🔒 **PII Detection** - Dual-language Microsoft Presidio integration with 50+ entity types (v1.6.10)
- 🌐 **Browser Extension** - Real-time client-side protection for ChatGPT and Claude.ai (Chrome/Edge)
- 📊 **Real-time Monitoring** - Grafana dashboards with 6 specialized analytics panels
- 🔬 **Investigation Panel** - Advanced prompt search with detailed decision analysis and pattern matching
- ⚙️ **Dynamic Configuration** - Web-based GUI for managing security policies
- 🤖 **LLM Guard Integration** - External LLM validation with risk-based policies
- 🔄 **n8n Workflow Engine** - Scalable processing pipeline with 40 nodes
- 📈 **ClickHouse Logging** - High-performance data storage and analytics
- 🎯 **Risk-based Actions** - ALLOW, SANITIZE (Light/Heavy), BLOCK decisions
- ✅ **Comprehensive Testing** - E2E test suite with 58+ tests and CI/CD integration

## 📸 Visual Overview

### n8n Workflow Pipeline
The complete processing pipeline with 40 nodes handling threat detection, sanitization, and logging:

![n8n Workflow Pipeline](docs/pic/workflow-pipeline.png)

### Monitoring Dashboard
Real-time analytics with Grafana dashboards showing threat detection, processing volumes, and system health:

![Monitoring Dashboard](docs/pic/monitoring-dashboard.png)

### Investigation Panel
Advanced prompt search and analysis interface for investigating security events with detailed decision breakdowns:

![Investigation Panel](docs/pic/investigation-panel.png)

### Data Retention Policy
Automatic data lifecycle management with configurable TTL policies, disk usage monitoring, and force cleanup controls:

![Data Retention Configuration](docs/pic/data-retention-config.png)

### Browser Extension
Client-side protection with real-time prompt validation for ChatGPT and Claude.ai:

![Plugin Popup](docs/pic/plugin-popup.png)
![Plugin in Action](docs/pic/plugin-in-action.png)

## 📁 Project Structure

```
vigil-guard/
├── services/                   # All microservices
│   ├── workflow/              # n8n workflow engine
│   │   ├── config/           # Detection patterns and rules ⚠️
│   │   ├── workflows/        # Workflow JSON files
│   │   ├── tests/            # E2E test suite (NEW)
│   │   │   ├── e2e/         # End-to-end tests
│   │   │   ├── fixtures/    # Test data (100+ samples)
│   │   │   └── helpers/     # Test utilities
│   │   ├── vitest.config.js # Test configuration
│   │   └── docker-compose.yml
│   ├── web-ui/               # Configuration interface
│   │   ├── frontend/         # React + Vite + Tailwind CSS
│   │   ├── backend/          # Express.js API server
│   │   └── docker-compose.yml
│   ├── monitoring/           # Analytics stack
│   │   ├── sql/              # ClickHouse schema
│   │   ├── grafana/          # Dashboard provisioning
│   │   └── docker-compose.yml
│   └── proxy/                # Caddy reverse proxy
│       ├── Caddyfile
│       └── docker-compose.yml
├── prompt-guard-api/         # Llama Prompt Guard service
│   ├── app.py               # FastAPI application
│   ├── Dockerfile           # Container definition
│   ├── docker-compose.yml   # Service orchestration
│   ├── requirements.txt     # Python dependencies
│   └── README.md            # Setup instructions
├── presidio-pii-api/         # Microsoft Presidio PII Detection (NEW v1.6)
│   ├── app.py               # Flask application
│   ├── config/              # Recognizer configurations
│   │   └── recognizers.yaml # Custom Polish + International recognizers
│   ├── validators/          # Entity validators
│   │   ├── credit_card.py  # Luhn algorithm validator
│   │   └── polish_validators.py # PESEL/NIP/REGON checksums
│   ├── Dockerfile           # Container definition
│   ├── docker-compose.yml   # Service orchestration
│   ├── requirements.txt     # Python dependencies (presidio, spaCy)
│   └── README.md            # Setup instructions
├── plugin/                    # Browser Extension
│   ├── Chrome/               # Chrome extension files
│   │   ├── manifest.json    # Extension manifest (v3)
│   │   ├── background.js    # Service worker
│   │   ├── content.js       # Content script
│   │   ├── popup.html       # Extension popup UI
│   │   └── popup.js         # Popup logic
│   └── README.md            # Installation guide
├── docs/                      # Documentation
│   ├── api/                   # API reference
│   ├── guides/                # User guides
│   ├── architecture/          # Technical docs
│   ├── plugin/                # Browser extension docs
│   │   ├── BROWSER_EXTENSION.md    # Main documentation
│   │   ├── QUICK_START.md          # Quick start guide
│   │   └── HYBRID_ARCHITECTURE.md  # Technical architecture
│   └── README.md
├── scripts/                   # Automation scripts
├── config/                    # Shared configuration
│   └── .env.example
├── tests/                     # Integration tests
├── docker-compose.yml         # Main orchestration file
├── package.json              # Monorepo root
└── README.md
```

**Note**: Llama model is stored outside the repository at `../vigil-llm-models/` due to license restrictions.

## 🚀 Quick Start

**Want to get started immediately?** See [QUICKSTART.md](QUICKSTART.md) for a 5-minute setup guide!

### Prerequisites

- **Node.js** ≥ 18.0.0
- **Docker** & Docker Compose
- **Git**
- **Llama Prompt Guard 2 Model** (must be downloaded separately - see below)

### Step 1: Download Llama Prompt Guard Model

**IMPORTANT**: Due to Meta's Llama 4 Community License, the model must be downloaded separately from Hugging Face.

📖 **Quick Guide**: See [MODEL_SETUP.md](MODEL_SETUP.md) for detailed instructions

⚠️ **You must accept Meta's license agreement before downloading**: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

#### Option 1: Download to External Directory (Recommended)

```bash
# Clone the repository first
git clone https://github.com/tbartel74/Vigil-Guard.git
cd vigil-guard

# Run the automated download script
./scripts/download-llama-model.sh
```

The script will download the model to: `../vigil-llm-models/Llama-Prompt-Guard-2-86M` (outside repository)

#### Option 2: Download to Repository Directory

```bash
# After cloning the repository
cd vigil-guard/Llama-Prompt-Guard-2-86M

# Run the local download script
./download-here.sh
```

The script will download the model to: `./Llama-Prompt-Guard-2-86M` (inside repository, but gitignored)

#### Option 3: Manual Download

```bash
# Install Hugging Face CLI
pip install huggingface-hub

# Login to Hugging Face (requires account)
huggingface-cli login

# Accept the license at: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

# Download to external directory (recommended)
cd ..  # Go to parent directory
mkdir -p vigil-llm-models
huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M \
  --local-dir vigil-llm-models/Llama-Prompt-Guard-2-86M

# OR download to repository directory
cd vigil-guard/Llama-Prompt-Guard-2-86M
huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M \
  --local-dir . --local-dir-use-symlinks False
```

**Note**: The installation script will automatically detect the model in either location.

### Step 2: Automated Installation (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd vigil-guard

# Run the installation script
./install.sh
```

The installation script will:
- ✓ Check all prerequisites
- ✓ Verify Llama model is downloaded
- ✓ **Auto-generate secure passwords** (32-64 characters, cryptographically random)
- ✓ Create Docker network
- ✓ Install and build GUI components
- ✓ Start all services in the correct order
- ✓ Verify that everything is running

**Installation time**: ~5-10 minutes (model download adds 5-10 minutes on first run)

### Manual Installation

```bash
# Create Docker network
docker network create vigil-network

# Copy and configure environment variables
cp config/.env.example .env
# Edit .env with your settings

# Install dependencies
npm install

# Build services
npm run build

# Start all services
docker-compose up -d

# Or start services individually:
# docker-compose up -d clickhouse grafana  # Monitoring
# docker-compose up -d n8n                 # Workflow engine
# docker-compose up -d web-ui-backend web-ui-frontend  # Web UI
```

### Access Points

After installation, access the services at:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Web UI** | http://localhost/ui | admin/[from install.sh] ⚠️ |
| **n8n Workflow** | http://localhost:5678 | (create on first access) |
| **Grafana Dashboard** | http://localhost:3001 | admin/[auto-generated] |
| **ClickHouse HTTP** | http://localhost:8123 | admin/[auto-generated] |
| **Prompt Guard API** | http://localhost:8000/docs | - |

⚠️ **IMPORTANT**: `install.sh` **automatically generates unique secure passwords** for all services. Credentials are displayed **ONLY ONCE** during installation - save them immediately!

### Workflow Integration

The n8n workflow can be accessed in two ways:

1. **Chat Window** (Interactive Testing)
   - Open workflow in n8n editor (http://localhost:5678)
   - Click "Test workflow" → "Chat" tab
   - Send prompts directly through the chat interface
   - View real-time processing results

2. **Webhook API** (Production Use)
   - Endpoint: `http://localhost:5678/webhook/<webhook-id>`
   - Method: `POST`
   - Payload: `{"chatInput": "your prompt text"}`
   - Returns: Processing results with threat scores and sanitization status
   - See [services/workflow/tests/README.md](services/workflow/tests/README.md) for examples

### ⚠️ Post-Installation Required Steps

After installation completes, you **must** manually configure n8n:

1. **Create n8n Account**
   - Open http://localhost:5678
   - Create your account (first-time setup)

2. **Import Workflow**
   - In n8n, click "Workflows" → "Import from File"
   - Import: `services/workflow/workflows/Vigil-Guard-v1.5.json`

3. **Configure ClickHouse Credentials**
   - Locate "Logging to ClickHouse" node in workflow
   - Create new credential with:
     - Host: `vigil-clickhouse`
     - Port: `8123`
     - Database: `n8n_logs`
     - Username: `admin`
     - Password: **[use the auto-generated password shown during install.sh]**
   - Save and activate workflow

📖 **Detailed guide**: See [QUICKSTART.md](QUICKSTART.md) for step-by-step instructions

### 🔒 Security: Automatic Password Generation

**✅ SECURE BY DEFAULT**: Vigil Guard automatically generates unique cryptographic passwords during installation:

#### Installation Process

When you run `./install.sh`, the script will:

1. **Generate 3 unique passwords** using `openssl rand -base64`:
   - **ClickHouse Database**: 32 characters
   - **Grafana Dashboard**: 32 characters
   - **Backend Session Secret**: 64 characters
   - **n8n**: Account created via wizard on first visit

2. **Display credentials ONLY ONCE**:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚠️  CRITICAL: SAVE THESE CREDENTIALS - SHOWN ONLY ONCE! ⚠️
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   ClickHouse Database:
     Username: admin
     Password: Elw34IshgKf7kvr0DHRqSgwqtINamuQQ

   Grafana Dashboard:
     Username: admin
     Password: V5JnHKYvb7DYEgKsUvbktzSI2GD4toUj

   Backend Session Secret:
     ByzxrKarBvoQzqI70vDFfDV4UDaDujNo1KY0xALUDjtZc9K3cW1y4D0yhpWubaGt

   Press Enter after you have SAVED these credentials...
   ```

3. **Auto-configure services**: All services automatically use the generated passwords from `.env`

#### Password Policy Features

- ✅ **No default passwords** - Every installation gets unique credentials
- ✅ **Cryptographic randomness** - Uses `openssl rand -base64` for entropy
- ✅ **Web UI password generation** - Backend generates secure random password on first run
- ✅ **Fail-secure backend** - Backend exits if `SESSION_SECRET` not set
- ✅ **One-time display** - Credentials shown only during installation
- ✅ **Platform-aware** - Works on macOS and Linux

#### Credential Rotation

To regenerate passwords (e.g., after suspected compromise):

```bash
# 1. Stop all services
docker-compose down

# 2. Delete existing .env file
rm .env

# 3. Re-run installation (will generate new passwords)
./install.sh

# 4. Update n8n ClickHouse credential with new password
```

#### Web UI Initial Access

The Web UI admin password is auto-generated during installation:

```bash
# Password displayed during ./install.sh execution
# Saved in .env as WEB_UI_ADMIN_PASSWORD
# Login: admin/<password-from-install>
# System forces password change on first login
```

📖 **Complete security guide**: See [docs/SECURITY.md](docs/SECURITY.md)

### Management Scripts

Vigil Guard includes utility scripts for easy management:

```bash
# Check service status
./scripts/status.sh

# View logs
./scripts/logs.sh [service] --follow

# Restart services
./scripts/restart.sh [service]

# Development mode (hot reload)
./scripts/dev.sh

# Stop all services
./scripts/stop.sh

# Complete uninstall
./scripts/uninstall.sh
```

For detailed script documentation, see [scripts/README.md](scripts/README.md)

## 📊 System Architecture

### Processing Pipeline

```
Chat Input → Input Validation → PII Redaction → Normalization
    → Bloom Prefilter → Allowlist Validation → Pattern Matching
    → Decision Engine → Correlation → Sanitization
    → [Optional LLM Guard] → Final Decision
    → ClickHouse Logging → Output
```

### Decision Thresholds

| Decision | Score Range | Action |
|----------|-------------|--------|
| **ALLOW** | 0-29 | Pass through without modification |
| **SANITIZE_LIGHT** | 30-64 | Remove suspicious patterns |
| **SANITIZE_HEAVY** | 65-84 | Aggressive content removal |
| **BLOCK** | 85-100 | Reject content entirely |

### Detection Categories (33)

**Critical Threats:**
- CRITICAL_INJECTION
- JAILBREAK_ATTEMPT
- CONTROL_OVERRIDE
- PROMPT_LEAK_ATTEMPT
- GODMODE_JAILBREAK
- DESTRUCTIVE_COMMANDS

**Security & Access:**
- PRIVILEGE_ESCALATION
- COMMAND_INJECTION
- CREDENTIAL_HARVESTING

**Obfuscation & Manipulation:**
- HEAVY_OBFUSCATION
- FORMAT_COERCION
- SOCIAL_ENGINEERING

**Additional Categories:**
- DANGEROUS_CONTENT, SQL_XSS_ATTACKS, ROLEPLAY_ESCAPE, and 15+ more...

## 🧪 Testing

Vigil Guard includes a comprehensive E2E test suite to validate detection accuracy and prevent regressions:

### Test Suite Overview

- **58+ Tests** across 3 suites (smoke, bypass scenarios, false positives)
- **70% Pass Rate** (33/47 tests passing) - actively improving bypass detection
- **100 Test Fixtures** (50 malicious + 50 benign prompts)
- **CI/CD Integration** via GitHub Actions

**Current Test Status** (see `services/workflow/TEST_SUMMARY.md` for details):
- ✅ Smoke Tests: 3/3 (100%)
- ✅ False Positive Tests: 15/15 (100%)
- ⚠️ Bypass Scenarios: 15/29 (52%) - ongoing work to improve detection of sophisticated obfuscation techniques

### Running Tests

```bash
# Navigate to workflow directory
cd services/workflow

# Install test dependencies (first time only)
npm install

# Run all tests
npm test

# Run specific test suite
npm test -- bypass-scenarios.test.js

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Categories

1. **Smoke Tests** (3 tests) - Basic functionality validation
2. **Bypass Scenarios** (25+ tests) - Advanced attack detection:
   - Encoding bypass (base64, URL, hex) ✅
   - Whitespace obfuscation ✅
   - SQL injection & XSS ✅
   - Jailbreak attempts ✅
   - Polyglot attacks ✅
3. **Emoji Obfuscation** (28 tests) - Emoji-based attack detection:
   - Communication emoji attacks (🗣️ say, 💬 chat)
   - Security emoji attacks (🔓 unlock, 🔑 key)
   - Technology emoji attacks (💻 computer, 🖥️ server)
   - False positive prevention (casual emoji usage)
4. **False Positives** (15+ tests) - Legitimate content validation

### Test Results

Current detection capabilities:
- ✅ Encoding bypass detection (base64, URL encoding, hex)
- ✅ Obfuscation detection (zero-width chars, spaced letters)
- ✅ SQL injection patterns (case-insensitive)
- ✅ Jailbreak patterns (direct, roleplay, prompt leak)
- ✅ Polyglot attacks (mixed scripts)
- ⚠️ Advanced attacks (context confusion, multi-step) - Planned for Phase 2

**Documentation**: See [services/workflow/TEST_SUMMARY.md](services/workflow/TEST_SUMMARY.md) for detailed test results and troubleshooting.

## 📖 Documentation

Comprehensive documentation is available in the `docs/` directory:

### Core Documentation
- [Installation Guide](docs/INSTALLATION.md) - Detailed setup instructions
- [User Guide](docs/USER_GUIDE.md) - Complete user manual
- [Configuration Reference](docs/CONFIGURATION.md) - All configuration options
- [API Documentation](docs/API.md) - REST API endpoints and usage
- [Security Guide](docs/SECURITY.md) - Security policies and best practices
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Technical Architecture](docs/architecture/architecture.md) - System design details

### Component Documentation
- [Browser Extension Guide](docs/plugin/BROWSER_EXTENSION.md) - Plugin installation and configuration
- [Browser Extension Quick Start](docs/plugin/QUICK_START.md) - 5-minute plugin setup
- [Browser Extension Architecture](docs/plugin/HYBRID_ARCHITECTURE.md) - Technical implementation details
- [Test Suite Guide](services/workflow/tests/README.md) - E2E testing and validation
- [Prompt Guard API](prompt-guard-api/README.md) - LLM Guard service documentation

### Reference Materials
- [Detection Categories](docs/DETECTION_CATEGORIES.md) - All 33 threat patterns
- [Configuration Variables](docs/CONFIG_VARIABLES.md) - Variable mapping reference
- [Model Setup](MODEL_SETUP.md) - Llama Prompt Guard download guide
- [Quick Start](QUICKSTART.md) - 5-minute installation guide

## 🔧 Configuration

The system uses a unified configuration management approach:

- **Configuration Files**: Located in `services/workflow/config/`
  - `unified_config.json` - Main settings
  - `thresholds.config.json` - Score ranges
  - `rules.config.json` - Detection patterns
  - `allowlist.schema.json` - Allowed content schema
  - `normalize.conf` - Text normalization rules
  - `pii.conf` - PII redaction patterns

- **GUI Configuration**: Web interface at http://localhost:5173
  - Variable mapping to configuration files
  - Real-time updates with ETag validation
  - Backup rotation (max 2 backups per file)

- **Environment Variables**: Configure via `.env` file
  - Copy `config/.env.example` to `.env`
  - Customize settings for your deployment
  - All services respect environment variables

⚠️ **IMPORTANT**: The `services/workflow/config/` directory contains critical detection patterns and rules. Do NOT modify directory name, file names, or their contents directly. Use the GUI for configuration changes.

## 🔒 Security Features

- **Path Traversal Protection**: Filename validation in backend
- **ETag-Based Concurrency Control**: Prevents configuration conflicts
- **Secret Masking**: Sensitive values hidden in UI
- **Atomic File Operations**: Ensures data consistency
- **CORS Protection**: Restricted to localhost origins
- **Audit Logging**: Complete change history

## 🐳 Docker Services

### Network Configuration

All services communicate via `vigil-net` external Docker network.

```bash
# Network is created automatically by docker-compose.yml
# Manual creation (if needed):
docker network create vigil-net
```

### Port Allocation

- `5173` - GUI Frontend
- `8787` - GUI Backend API
- `5678` - n8n Workflow Engine
- `3001` - Grafana
- `8123` - ClickHouse HTTP API
- `9000` - ClickHouse Native TCP

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

```bash
# GUI Frontend development
cd GUI/frontend
npm install
npm run dev

# GUI Backend development
cd GUI/backend
npm install
npm run dev

# TypeScript type checking
npm run build
```

## 📄 License

This project (Vigil Guard) is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-Party Licenses

**Meta Llama Prompt Guard 2**

This project uses Meta's Llama Prompt Guard 2 model, which is licensed under the **Llama 4 Community License**.

⚠️ **Important License Requirements:**

1. **User must download the model separately** - The model files are NOT included in this repository due to license restrictions
2. **License acceptance required** - You must accept Meta's license at https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
3. **Attribution required** - "Built with Llama" must be displayed in your user interface
4. **Distribution restrictions** - Model files cannot be redistributed in this repository

**Model Download Instructions:**
```bash
# Use our automated script
./scripts/download-llama-model.sh

# Or download manually - see prompt-guard-api/README.md
```

**License Text:**
> Llama 4 is licensed under the Llama 4 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.

Full license: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/tbartel74/Vigil-Guard/issues)
- **Security**: Report security vulnerabilities privately

## 🙏 Acknowledgments

**Built with Llama** - This project uses Meta's Llama Prompt Guard 2 model for advanced prompt injection detection.

Built with:
- **[Meta Llama Prompt Guard 2](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M)** - AI-powered prompt injection detection
- [n8n](https://n8n.io/) - Workflow automation
- [React](https://reactjs.org/) - UI framework
- [FastAPI](https://fastapi.tiangolo.com/) - Prompt Guard API
- [Express.js](https://expressjs.com/) - Backend API
- [ClickHouse](https://clickhouse.com/) - Analytics database
- [Grafana](https://grafana.com/) - Monitoring dashboards
- [Tailwind CSS](https://tailwindcss.com/) - UI styling

---

<div align="center">

**Made with ❤️ for LLM Security**

[Documentation](docs/) • [Installation](docs/INSTALLATION.md) • [User Guide](docs/USER_GUIDE.md) • [Configuration](docs/CONFIGURATION.md) • [Troubleshooting](docs/TROUBLESHOOTING.md) • [API](docs/API.md)

</div>
