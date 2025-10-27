---
name: docker-vigil-orchestration
description: Docker Compose orchestration for Vigil Guard microservices. Use when deploying services, managing containers, troubleshooting Docker network issues, working with vigil-network, configuring docker-compose.yml, or handling service dependencies.
version: 1.0.0
allowed-tools: [Read, Write, Bash, Grep, Glob]
---

# Docker Orchestration for Vigil Guard

## Overview
Multi-service Docker deployment orchestration for Vigil Guard's microservices architecture.

## When to Use This Skill
- Starting/stopping services
- Debugging container issues
- Managing Docker network (vigil-network)
- Modifying docker-compose.yml
- Viewing service logs
- Checking service health
- Troubleshooting port conflicts
- Understanding service dependencies

## Service Architecture

### All Services
```yaml
services:
  # Monitoring Stack
  clickhouse:      # Analytics database (8123, 9000)
  grafana:         # Dashboards (3001)

  # Core Platform
  n8n:            # Workflow engine (5678)
  web-ui-backend: # API server (8787)
  web-ui-frontend:# React SPA (80 internal)

  # Infrastructure
  proxy:          # Caddy reverse proxy (80)
  prompt-guard-api: # LLM validation (8000)
```

### Docker Network
All services communicate via `vigil-network` external network.

## Common Commands

### Start All Services
```bash
docker-compose up -d
```

### Start Specific Services
```bash
# Monitoring only
docker-compose up -d clickhouse grafana

# Web UI only
docker-compose up -d web-ui-backend web-ui-frontend proxy

# Workflow engine
docker-compose up -d n8n
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f web-ui-backend

# Last 100 lines
docker-compose logs --tail=100 n8n
```

### Restart Services
```bash
# All
docker-compose restart

# Specific
docker-compose restart web-ui-backend
```

### Stop and Remove
```bash
# Stop all
docker-compose down

# Stop and remove volumes (DESTRUCTIVE!)
docker-compose down -v
```

### Rebuild After Changes
```bash
# Rebuild all
docker-compose up --build -d

# Rebuild specific
docker-compose up --build -d web-ui-frontend
```

## Service Health Checks

### Check Running Containers
```bash
docker ps
# Should show: vigil-clickhouse, vigil-grafana, vigil-n8n, etc.
```

### Test Service Endpoints
```bash
# n8n
curl http://localhost:5678/healthz

# ClickHouse
curl http://localhost:8123/ping

# Grafana
curl -I http://localhost:3001

# Backend API
curl http://localhost:8787/api/files

# Proxy
curl -I http://localhost/ui/
```

## Docker Network

### Inspect Network
```bash
docker network inspect vigil-network
```

### Services in Network
All services must be on `vigil-network` to communicate:
- `vigil-clickhouse` (internal hostname)
- `vigil-grafana`
- `vigil-n8n`
- `web-ui-backend`
- `web-ui-frontend`

### Create Network (if missing)
```bash
docker network create vigil-network
```

## Volume Management

### List Volumes
```bash
docker volume ls | grep vigil
```

### Backup Volume
```bash
# ClickHouse data
docker run --rm -v vigil_clickhouse_data:/data -v $(pwd):/backup alpine tar czf /backup/clickhouse-backup.tar.gz /data

# n8n data
docker run --rm -v vigil_n8n_data:/data -v $(pwd):/backup alpine tar czf /backup/n8n-backup.tar.gz /data
```

### ⚠️ CRITICAL: ClickHouse Volume Cleanup Procedure

**When to use:**
- Password rotation (new password generated in `.env`)
- Database corruption
- Schema changes requiring fresh start

**⚠️ WARNING:** This deletes ALL ClickHouse data! Always backup first.

**Proper Procedure (DO NOT SKIP STEPS):**

```bash
# Step 1: Verify Docker daemon is accessible
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon not running or not accessible"
    exit 1
fi

# Step 2: Stop ClickHouse container
docker-compose stop clickhouse
docker-compose rm -f clickhouse

# Step 3: Remove volume with error handling
if ! rm -rf vigil_data/clickhouse 2>&1; then
    echo "CRITICAL: Failed to delete vigil_data/clickhouse"
    echo "Possible solutions:"
    echo "  1. Run with elevated permissions: sudo rm -rf vigil_data/clickhouse"
    echo "  2. Check file permissions: ls -la vigil_data/"
    exit 1
fi

# Step 4: Verify deletion succeeded
if [ -d "vigil_data/clickhouse" ]; then
    echo "CRITICAL: Volume directory still exists after deletion!"
    echo "This WILL cause password authentication failures!"
    exit 1
fi

# Step 5: Start ClickHouse with clean volume
docker-compose up -d clickhouse

# Step 6: Wait for initialization (30-60 seconds)
sleep 60

# Step 7: Verify database created
docker exec vigil-clickhouse clickhouse-client -q "SHOW DATABASES"

# Step 8: Reinitialize schema (if needed)
./scripts/init-clickhouse.sh
```

**Why each step matters:**
- **Step 1**: Prevents silent failures if Docker is unavailable
- **Step 2**: Ensures no file locks on volume
- **Step 3**: Detects permission errors immediately
- **Step 4**: Catches partial deletions (silent failures)
- **Step 5**: Clean start with new password
- **Step 6**: Allow init scripts to run
- **Step 7**: Verify database accessible
- **Step 8**: Recreate tables if using external scripts

**Common Mistakes (AVOID!):**
- ❌ Skipping Docker daemon check → silent failures
- ❌ Not verifying deletion → old password persists
- ❌ Starting container too quickly → init scripts fail
- ❌ Forgetting to reinitialize schema → missing tables

**Automated by install.sh:**
The `install.sh` script automatically performs this procedure during password rotation.
See: `install.sh:335-399` for implementation.

### Remove Volumes (DESTRUCTIVE!)
```bash
# Use proper cleanup procedure above for ClickHouse!
# For other volumes:
docker volume rm vigil_n8n_data
docker volume rm vigil_grafana_data
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :8123

# Kill process (if needed)
kill -9 <PID>
```

### Service Won't Start
```bash
# Check logs
docker-compose logs service-name

# Check network
docker network inspect vigil-network

# Verify environment variables
docker-compose config
```

### Container Crashes
```bash
# View last logs before crash
docker logs --tail=100 vigil-clickhouse

# Check restart count
docker ps -a | grep vigil

# Inspect container
docker inspect vigil-clickhouse
```

### Network Issues
```bash
# Restart networking
docker-compose down
docker network rm vigil-network
docker network create vigil-network
docker-compose up -d
```

## Environment Variables

Loaded from `.env` file:
```bash
# ClickHouse
CLICKHOUSE_USER=admin
CLICKHOUSE_PASSWORD=<auto-generated>

# Grafana
GF_SECURITY_ADMIN_PASSWORD=<auto-generated>

# Backend
SESSION_SECRET=<auto-generated>
TARGET_DIR=/Users/tomaszbartel/Documents/n8n-data/config_sanitizer
```

## Development vs Production

### Development (individual services)
```bash
# Backend dev server
cd services/web-ui/backend && npm run dev

# Frontend dev server
cd services/web-ui/frontend && npm run dev
```

### Production (Docker)
```bash
# Build and start all
docker-compose up --build -d
```

## Monitoring Resources

### Container Stats
```bash
docker stats
```

### Disk Usage
```bash
docker system df
```

### Prune Unused Resources
```bash
# Remove unused containers, images, networks
docker system prune

# Remove volumes too (CAREFUL!)
docker system prune -a --volumes
```

## Related Skills
- `clickhouse-grafana-monitoring` - Database management
- `n8n-vigil-workflow` - Workflow service
- `react-tailwind-vigil-ui` - Frontend service

## References
- Docker Compose: `docker-compose.yml`
- Service configs: `services/*/docker-compose.yml`
- Environment: `.env`
