# Vigil Guard - Quick Start Guide

**Get up and running in 5 minutes!** ⚡

## 1️⃣ Prerequisites Check

Before starting, ensure you have:

```bash
# Check Node.js (need ≥18)
node --version

# Check Docker
docker --version

# Check Docker Compose
docker-compose --version
```

If anything is missing, install from:
- **Node.js**: https://nodejs.org/
- **Docker**: https://www.docker.com/get-started

## 2️⃣ One-Command Install

```bash
# Clone and install
git clone <repository-url>
cd vigil-guard
./install.sh
```

That's it! The script will:
- ✓ Verify all prerequisites
- ✓ Install dependencies
- ✓ Build projects
- ✓ Start all services
- ✓ Run health checks

**Time**: ~5-10 minutes (depending on internet speed)

## 3️⃣ Access Your Services

Once installation completes, open these URLs:

| Service | URL | Credentials |
|---------|-----|-------------|
| 🎨 **Web UI** | http://localhost:5173/ui | admin/admin123 |
| ⚙️ **n8n** | http://localhost:5678 | (create on first access) |
| 📊 **Grafana** | http://localhost:3001 | admin/admin123 |
| 🔍 **ClickHouse** | http://localhost:8123 | admin/admin123 |

## 4️⃣ Post-Installation Setup (Manual Steps)

### ⚠️ REQUIRED: n8n Workflow Configuration

After installation completes, you **must** perform these manual steps:

#### Step 1: Create n8n Account
1. Open http://localhost:5678
2. Create your n8n account (first-time setup)
3. Login to n8n interface

#### Step 2: Import Workflow
1. Click on **"Workflows"** in the left sidebar
2. Click **"Add Workflow"** → **"Import from File"**
3. Import the workflow file from:
   ```
   services/workflow/workflows/Vigil-Guard-v1.3.json
   ```
4. The workflow will load with all 34 nodes

#### Step 3: Configure ClickHouse Credentials
1. In the imported workflow, locate the **"Logging to ClickHouse"** node
2. Click on the node to open settings
3. Click **"Create New Credential"** for ClickHouse
4. Configure with these values:
   - **Host**: `vigil-clickhouse`
   - **Port**: `8123`
   - **Database**: `n8n_logs`
   - **Username**: `admin`
   - **Password**: `admin123`
5. Click **"Save"**
6. Activate the workflow by clicking the toggle switch

✅ **Your workflow is now ready to process requests!**

## 5️⃣ Quick Test

### Test the Web UI
1. Open http://localhost:5173/ui
2. Login with **admin/admin123**
3. Navigate to Monitoring dashboard
4. View real-time statistics

### Test n8n Workflow
1. Open http://localhost:5678
2. Open the imported workflow
3. Click **"Test Workflow"** or send a chat message trigger
4. Watch it process through the pipeline

### Test Monitoring
1. Open http://localhost:3001
2. Login with **admin/admin123**
3. Navigate to **Vigil Guard Dashboard**
4. View real-time threat detection metrics

## 6️⃣ Security: Default Credentials

**⚠️ IMPORTANT**: All services use unified credentials for easy setup:

- **Username**: `admin`
- **Password**: `admin123`

**For Production Deployment:**
1. ✅ Change passwords immediately after first login
2. ✅ Web UI: Navigate to **Settings** → **Change Password**
3. ✅ Update `.env` file for other services (ClickHouse, Grafana)
4. ✅ Restart services: `docker-compose restart`
5. ✅ Configure strong JWT_SECRET in `.env` (32+ characters)

📖 **Complete security guide**: [docs/SECURITY.md](docs/SECURITY.md)

## 7️⃣ Common Commands

```bash
# Check if everything is running
./scripts/status.sh

# View logs
./scripts/logs.sh

# Restart a service
./scripts/restart.sh gui

# Stop everything
./scripts/stop.sh

# Development mode (hot reload)
./scripts/dev.sh
```

## 🐛 Troubleshooting

### Services not starting?
```bash
# Check what's wrong
./scripts/status.sh
./scripts/logs.sh all

# Try restarting
./scripts/restart.sh all
```

### Port already in use?
```bash
# Check which ports are in use
lsof -i :5173  # GUI Frontend
lsof -i :8787  # GUI Backend
lsof -i :5678  # n8n
lsof -i :3001  # Grafana
```

### Fresh start needed?
```bash
# Complete cleanup and reinstall
./scripts/uninstall.sh
./install.sh
```

## 📚 Next Steps

1. **✅ Complete n8n Setup** (REQUIRED - see Step 4 above)
   - Create n8n account
   - Import workflow from `services/workflow/workflows/Vigil-Guard-v1.0.json`
   - Configure ClickHouse credentials (admin/admin123)

2. **Configure Security Rules**
   - Open Web UI at http://localhost:5173/ui
   - Login with admin/admin123
   - Navigate to Configuration
   - Adjust detection thresholds

3. **Monitor System**
   - View real-time stats in Web UI Monitoring dashboard
   - Open Grafana at http://localhost:3001 for detailed analytics
   - Monitor workflow execution in n8n

4. **Read Documentation**
   - [Installation Guide](docs/INSTALLATION.md)
   - [Configuration Reference](docs/CONFIGURATION.md)
   - [Authentication Guide](docs/AUTHENTICATION.md)
   - [API Documentation](docs/API.md)

## 🆘 Need Help?

- **Documentation**: [docs/README.md](docs/README.md)
- **Scripts Guide**: [scripts/README.md](scripts/README.md)
- **Architecture**: [docs/technical/architecture.md](docs/technical/architecture.md)
- **Issues**: [GitHub Issues](https://github.com/tbartel74/Vigil-Guard/issues)

## 🎯 Development Mode

For active development with hot reload:

```bash
./scripts/dev.sh
```

This will:
- Start Docker services (monitoring, n8n)
- Run frontend with Vite (hot reload)
- Run backend with tsx watch (auto-restart)
- Open in separate terminal windows

---

**That's all you need to get started!** 🚀

For detailed documentation, see [README.md](README.md) and [docs/](docs/)
