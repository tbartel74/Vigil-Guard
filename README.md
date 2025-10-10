# Vigil Guard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-required-blue)](https://www.docker.com/)

> **Enterprise-grade prompt injection detection and defense platform with real-time monitoring and configuration management for Large Language Model applications.**

## 🛡️ Overview

Vigil Guard is a comprehensive security platform designed to protect Large Language Model (LLM) applications from prompt injection attacks, jailbreak attempts, and malicious content. The system provides real-time threat detection, content sanitization, and analytics through an integrated monitoring dashboard.

### Key Features

- 🔍 **Advanced Threat Detection** - Multi-layer detection engine with 20+ pattern categories
- 🛡️ **Intelligent Sanitization** - Light and heavy sanitization modes with configurable policies
- 📊 **Real-time Monitoring** - Grafana dashboards with 6 specialized analytics panels
- ⚙️ **Dynamic Configuration** - Web-based GUI for managing security policies
- 🤖 **LLM Guard Integration** - External LLM validation with risk-based policies
- 🔄 **n8n Workflow Engine** - Scalable processing pipeline with 34 nodes
- 📈 **ClickHouse Logging** - High-performance data storage and analytics
- 🎯 **Risk-based Actions** - ALLOW, SANITIZE (Light/Heavy), BLOCK decisions

## 📁 Project Structure

```
vigil-guard/
├── services/                   # All microservices
│   ├── workflow/              # n8n workflow engine
│   │   ├── config/           # Detection patterns and rules ⚠️
│   │   ├── workflows/        # Workflow JSON files
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
├── prompt-guard-api/         # Llama Prompt Guard service (NEW)
│   ├── app.py               # FastAPI application
│   ├── Dockerfile           # Container definition
│   ├── docker-compose.yml   # Service orchestration
│   ├── requirements.txt     # Python dependencies
│   └── README.md            # Setup instructions
├── docs/                      # Documentation
│   ├── api/                   # API reference
│   ├── guides/                # User guides
│   ├── architecture/          # Technical docs
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
| **Web UI** | http://localhost:5173/ui | admin/admin123 |
| **n8n Workflow** | http://localhost:5678 | (create on first access) |
| **Grafana Dashboard** | http://localhost:3001 | admin/admin123 |
| **ClickHouse HTTP** | http://localhost:8123 | admin/admin123 |
| **Prompt Guard API** | http://localhost:8000/docs | - |

### ⚠️ Post-Installation Required Steps

After installation completes, you **must** manually configure n8n:

1. **Create n8n Account**
   - Open http://localhost:5678
   - Create your account (first-time setup)

2. **Import Workflow**
   - In n8n, click "Workflows" → "Import from File"
   - Import: `services/workflow/workflows/Vigil_LLM_guard_v1.json`

3. **Configure ClickHouse Credentials**
   - Locate "Logging to ClickHouse" node in workflow
   - Create new credential with:
     - Host: `vigil-clickhouse`
     - Port: `8123`
     - Database: `n8n_logs`
     - Username: `admin`
     - Password: `admin123`
   - Save and activate workflow

📖 **Detailed guide**: See [QUICKSTART.md](QUICKSTART.md) for step-by-step instructions

### 🔒 Security: Default Credentials Policy

**⚠️ IMPORTANT**: Vigil Guard ships with unified default credentials for quick testing and development:

| Service | Username | Password |
|---------|----------|----------|
| Web UI | `admin` | `admin123` |
| Grafana | `admin` | `admin123` |
| ClickHouse | `admin` | `admin123` |
| n8n | (create on first access) | - |

**Security Recommendations:**

1. **Development/Testing Environment**: Default credentials are acceptable
2. **Production Deployment**:
   - Change ALL passwords immediately after installation
   - Update credentials in `.env` file before running `install.sh`
   - Configure strong JWT_SECRET (32+ characters)
   - Enable HTTPS via Caddy reverse proxy
   - Restrict network access to services (firewall rules)

**How to Change Credentials:**

```bash
# 1. Stop all services
docker-compose down

# 2. Edit .env file
nano .env
# Update: CLICKHOUSE_PASSWORD, GF_SECURITY_ADMIN_PASSWORD, JWT_SECRET

# 3. For Web UI: Login and use Settings page to change password

# 4. Restart services
docker-compose up -d
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
Chat Input → PII Redaction → Normalization → Bloom Prefilter
    → Allowlist Validation → Pattern Matching → Decision Engine
    → Correlation → Sanitization → [Optional LLM Guard]
    → Final Decision → ClickHouse Logging → Output
```

### Decision Thresholds

| Decision | Score Range | Action |
|----------|-------------|--------|
| **ALLOW** | 0-29 | Pass through without modification |
| **SANITIZE_LIGHT** | 30-64 | Remove suspicious patterns |
| **SANITIZE_HEAVY** | 65-84 | Aggressive content removal |
| **BLOCK** | 85-100 | Reject content entirely |

### Detection Categories (20+)

- CRITICAL_INJECTION
- JAILBREAK_ATTEMPT
- CONTROL_OVERRIDE
- PROMPT_LEAK_ATTEMPT
- HEAVY_OBFUSCATION
- FORMAT_COERCION
- DANGEROUS_CONTENT
- GODMODE_JAILBREAK
- And more...

## 📖 Documentation

Comprehensive documentation is available in the `docs/` directory:

- [Installation Guide](docs/INSTALLATION.md) - Detailed setup instructions
- [Configuration Reference](docs/CONFIGURATION.md) - All configuration options
- [API Documentation](docs/API.md) - API endpoints and usage
- [Technical Architecture](docs/technical/architecture.md) - System design details

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

All services communicate via `n8n-network` external Docker network.

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

[Documentation](docs/) • [Installation](docs/INSTALLATION.md) • [User Guide](docs/USER_GUIDE.md) • [Configuration](docs/CONFIGURATION.md) • [API](docs/API.md)

</div>
