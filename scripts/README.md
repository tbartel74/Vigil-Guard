# Vigil Guard - Management Scripts

This directory contains utility scripts for managing Vigil Guard services.

## 📋 Available Scripts

### Main Installation
- **`../install.sh`** - Complete installation and setup of all components
  ```bash
  ./install.sh
  ```

### Service Management

- **`status.sh`** - Check status of all running services
  ```bash
  ./scripts/status.sh
  ```

- **`stop.sh`** - Stop all services
  ```bash
  ./scripts/stop.sh
  ```

- **`restart.sh`** - Restart services
  ```bash
  ./scripts/restart.sh [service]

  # Examples:
  ./scripts/restart.sh          # Restart all services
  ./scripts/restart.sh gui      # Restart only GUI
  ./scripts/restart.sh n8n      # Restart only n8n
  ./scripts/restart.sh monitoring  # Restart only monitoring
  ```

### Logs and Debugging

- **`logs.sh`** - View service logs
  ```bash
  ./scripts/logs.sh [service] [options]

  # Examples:
  ./scripts/logs.sh                # Show all logs
  ./scripts/logs.sh gui --follow   # Follow GUI logs
  ./scripts/logs.sh n8n -n 50      # Show last 50 lines of n8n logs
  ```

### Database Management

- **`init-clickhouse.sh`** - Initialize ClickHouse database structure
  ```bash
  ./scripts/init-clickhouse.sh
  ```
  Use this if:
  - ClickHouse database wasn't created during installation
  - You need to recreate tables after a reset
  - Database structure needs to be manually initialized

- **`init-grafana.sh`** - Initialize Grafana with datasource and dashboard
  ```bash
  ./scripts/init-grafana.sh
  ```
  Use this if:
  - Grafana datasource is not configured
  - Dashboard is missing after installation
  - Admin password needs to be reset
  - Provisioning verification is needed

### Development

- **`dev.sh`** - Start development mode (GUI runs locally without Docker)
  ```bash
  ./scripts/dev.sh
  ```
  This starts:
  - Docker services (monitoring, n8n)
  - Frontend dev server (hot reload)
  - Backend dev server (auto-restart)

### Cleanup

- **`uninstall.sh`** - Complete removal of all components
  ```bash
  ./scripts/uninstall.sh
  ```
  ⚠️ **Warning**: This will remove all data and cannot be undone!

## 🔧 Common Workflows

### First Time Setup
```bash
# Install everything
./install.sh

# Check if everything is running
./scripts/status.sh
```

### Daily Development
```bash
# Start in development mode
./scripts/dev.sh

# Make changes...

# Check logs if something goes wrong
./scripts/logs.sh gui --follow
```

### Production Deployment
```bash
# Stop development mode
./scripts/stop.sh

# Start in production mode
./install.sh

# Monitor services
./scripts/status.sh
```

### Troubleshooting
```bash
# Check service status
./scripts/status.sh

# View logs
./scripts/logs.sh all

# Restart problematic service
./scripts/restart.sh n8n

# Full restart if needed
./scripts/stop.sh
./install.sh
```

### Complete Cleanup
```bash
# Remove everything
./scripts/uninstall.sh

# Fresh install
./install.sh
```

## 📊 Service Ports

| Service | Port | Description |
|---------|------|-------------|
| GUI Frontend | 5173 | Web interface |
| GUI Backend | 8787 | REST API |
| n8n | 5678 | Workflow engine |
| Grafana | 3001 | Monitoring dashboard |
| ClickHouse HTTP | 8123 | Database API |
| ClickHouse TCP | 9000 | Database native protocol |

## 🔍 Script Details

### status.sh
- Checks HTTP endpoints
- Shows Docker container status
- Displays resource usage
- Verifies Docker network

### logs.sh Options
- `-f, --follow` - Follow log output in real-time
- `-n, --lines NUM` - Number of lines to show (default: 100)

### restart.sh Services
- `gui` - Frontend and backend
- `n8n` - Workflow engine
- `monitoring` - ClickHouse and Grafana
- `all` - All services (default)

### dev.sh Features
- Auto-installs dependencies if missing
- Starts Docker services in background
- Opens development servers in new terminal windows
- Supports macOS and Linux

### uninstall.sh Removes
- All Docker containers
- All Docker volumes
- Docker network
- node_modules directories
- Build artifacts (dist/)
- Optional: package-lock.json files

## 💡 Tips

1. **Always check status first**
   ```bash
   ./scripts/status.sh
   ```

2. **Use dev mode for development**
   ```bash
   ./scripts/dev.sh
   ```

3. **Monitor logs when debugging**
   ```bash
   ./scripts/logs.sh all --follow
   ```

4. **Restart individual services instead of all**
   ```bash
   ./scripts/restart.sh gui
   ```

5. **Clean install if problems persist**
   ```bash
   ./scripts/uninstall.sh
   ./install.sh
   ```

## 🆘 Help

For detailed documentation, see:
- [Installation Guide](../docs/INSTALLATION.md)
- [Configuration Reference](../docs/CONFIGURATION.md)
- [Troubleshooting](../docs/README.md)
