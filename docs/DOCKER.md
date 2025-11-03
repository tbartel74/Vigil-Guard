# Docker Guide

> **Complete reference for Docker deployment and management**

## Table of Contents

- [Container Architecture](#container-architecture)
- [Service Configuration](#service-configuration)
- [Network Setup](#network-setup)
- [Volume Management](#volume-management)
- [Image Updates](#image-updates)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)

## Container Architecture

Vigil Guard runs 9 Docker containers orchestrated by Docker Compose:

| Container | Image | Purpose | Ports | Dependencies |
|-----------|-------|---------|-------|--------------|
| **vigil-caddy** | caddy:2-alpine | Reverse proxy, TLS termination | 80, 443 | All services |
| **vigil-web-ui-frontend** | (local build) | React SPA, nginx | 5173→80 | backend |
| **vigil-web-ui-backend** | (local build) | Express API, JWT auth | 8787 | clickhouse |
| **vigil-n8n** | n8nio/n8n:1.72.0 | Workflow automation | 5678 | clickhouse |
| **vigil-grafana** | grafana/grafana:11.4.0 | Dashboards, analytics | 3001 | clickhouse |
| **vigil-clickhouse** | clickhouse/clickhouse-server:24.1 | Event logging, analytics | 8123, 9000 | - |
| **vigil-prompt-guard-api** | (local build) | Llama Prompt Guard 2 | 8000 | - |
| **vigil-presidio-pii** | (local build) | PII detection (Presidio) | 5001 | - |
| **vigil-language-detector** | (local build) | Language detection | 5002 | - |

### Image Pinning Strategy

All external images use **SHA256 digest pinning** for supply chain security:

```yaml
# Example: Grafana with version + digest
image: grafana/grafana:11.4.0@sha256:d8ea37798ccc41061a62ab080f2676dda6bf7815558499f901bdb0f533a456fb
```

**Benefits**:
- Immutable images (SHA256 never changes)
- Protection against tag hijacking
- Reproducible deployments
- Audit trail for security reviews

## Service Configuration

### Caddy (Reverse Proxy)

**Purpose**: Main entry point, routes all traffic

**Configuration**: `services/proxy/Caddyfile`

```caddyfile
:80 {
    # Web UI (React SPA)
    handle_path /ui/* {
        reverse_proxy vigil-web-ui-frontend:80
    }

    # Web UI API
    handle_path /ui/api/* {
        reverse_proxy vigil-web-ui-backend:8787
    }

    # n8n Workflow Engine
    handle_path /n8n/* {
        reverse_proxy vigil-n8n:5678
    }

    # Grafana Dashboards
    handle_path /grafana/* {
        reverse_proxy vigil-grafana:3000
    }
}
```

**Volumes**:
- `./vigil_data/caddy-data:/data` - TLS certificates
- `./vigil_data/caddy-config:/config` - Runtime config

### Web UI Frontend

**Purpose**: React SPA with routing, authentication UI

**Build Context**: Root directory (for docs sync)

**Dockerfile**: `services/web-ui/frontend/Dockerfile`

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY services/web-ui/frontend/package*.json ./
RUN npm ci
COPY services/web-ui/frontend ./
COPY docs /app/public/docs
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

**Environment Variables**: None (static build)

### Web UI Backend

**Purpose**: Express API, configuration management, user auth

**Build Context**: `services/web-ui/backend/`

**Required Environment Variables**:
```bash
NODE_ENV=production
PORT=8787
TARGET_DIR=/config                     # Config files location
JWT_SECRET=[48+ chars]                 # JWT signing key
SESSION_SECRET=[64+ chars]             # Session encryption
WEB_UI_ADMIN_PASSWORD=[32+ chars]      # Admin password hash
CLICKHOUSE_HOST=vigil-clickhouse
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=admin
CLICKHOUSE_PASSWORD=[32+ chars]
CLICKHOUSE_DATABASE=n8n_logs
```

**Volumes**:
- `./services/workflow/config:/config:rw` - Shared config with n8n
- `./vigil_data/web-ui:/app/data` - SQLite database

### n8n Workflow Engine

**Purpose**: 40-node detection pipeline, webhook processing

**Image**: `n8nio/n8n:1.72.0@sha256:f0182719d8b2...`

**Environment Variables**:
```bash
TZ=UTC
N8N_HOST=localhost
NODE_ENV=production
NODE_FUNCTION_ALLOW_EXTERNAL=axios     # Allow axios in code nodes
```

**Volumes**:
- `./vigil_data/n8n:/home/node/.n8n` - Workflows, credentials
- `./services/workflow/config:/home/node/config:ro` - Config files (read-only)
- `./services/workflow/workflows:/home/node/workflows:ro` - Workflow templates

**First-Time Setup**: http://localhost:5678 opens account creation wizard

### Grafana

**Purpose**: Real-time dashboards, threat analytics

**Image**: `grafana/grafana:11.4.0@sha256:d8ea37798ccc...`

**User**: `501:20` (runs as local user to fix permissions)

**Environment Variables**:
```bash
GF_INSTALL_PLUGINS=vertamedia-clickhouse-datasource
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=[32+ chars]
GF_SECURITY_ALLOW_EMBEDDING=true       # For Web UI iframe
GF_SECURITY_COOKIE_SAMESITE=none
GF_SECURITY_CONTENT_SECURITY_POLICY=false
GF_AUTH_ANONYMOUS_ENABLED=true         # Read-only for iframes
GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
GF_SERVER_ROOT_URL=http://localhost/grafana
```

**Volumes**:
- `./services/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro`
- `./vigil_data/grafana:/var/lib/grafana`

**Security Architecture**:
```
User → Web UI (JWT Auth) → Grafana iframe (anonymous read-only)
```

### ClickHouse

**Purpose**: Event logging, analytics database

**Image**: `clickhouse/clickhouse-server:24.1@sha256:44caeed7c81f...`

**Environment Variables**:
```bash
CLICKHOUSE_DB=n8n_logs
CLICKHOUSE_USER=admin
CLICKHOUSE_PASSWORD=[32+ chars]
CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1
```

**Volumes**:
- `./vigil_data/clickhouse:/var/lib/clickhouse` - Database files
- `./services/monitoring/sql/*.sql:/docker-entrypoint-initdb.d/` - Init scripts

**Init Scripts** (run on first start):
1. `01-create-tables.sql` - Create events_raw, events_processed
2. `02-create-views.sql` - Create analytics views
3. `03-false-positives.sql` - Create false_positives table

**Data Retention**:
- `events_raw`: 90 days (TTL enforced)
- `events_processed`: 365 days (TTL enforced)

### Prompt Guard API

**Purpose**: Meta's Llama Prompt Guard 2 for injection detection

**Build Context**: `prompt-guard-api/`

**Required Files**:
- Model: `Llama-Prompt-Guard-2-86M/` (download separately)

**Environment Variables**: None

**Volumes**:
- `./vigil_data/prompt-guard-cache:/root/.cache/huggingface`
- `./Llama-Prompt-Guard-2-86M:/app/model:ro`

**Health Check**: `GET /health`

### Presidio PII API

**Purpose**: Microsoft Presidio for PII detection (50+ entity types)

**Build Context**: `services/presidio-pii-api/`

**Image Tag**: `vigil-presidio-pii:1.6.10`

**Environment Variables**: None (offline model)

**Health Check**: `GET /health`

## Network Setup

### Docker Network

All services communicate via `vigil-net` bridge network:

```yaml
networks:
  vigil-net:
    driver: bridge
    name: vigil-net
```

**Aliases** (for service discovery):
- `clickhouse` → vigil-clickhouse:8123, 9000
- `grafana` → vigil-grafana:3000
- `n8n` → vigil-n8n:5678
- `web-ui-backend` → vigil-web-ui-backend:8787
- `web-ui-frontend` → vigil-web-ui-frontend:80
- `presidio-pii-api` → vigil-presidio-pii:5001

**Internal vs External Access**:

| Service | Internal (Docker) | External (Host) |
|---------|------------------|-----------------|
| ClickHouse | clickhouse:8123 | localhost:8123 |
| Grafana | grafana:3000 | localhost:3001 |
| n8n | n8n:5678 | localhost:5678 |
| Backend API | web-ui-backend:8787 | localhost:8787 |
| Frontend | web-ui-frontend:80 | localhost:5173 (dev) |
| **Caddy** | proxy:80 | **localhost:80** (main entry point) |

**Note:** In production, Caddy proxies requests:
- `http://localhost/ui/*` → Frontend container (:80 internal)
- `http://localhost/n8n/*` → n8n container (:5678)
- `http://localhost/grafana/*` → Grafana container (:3000)

**Production**: Only expose port 443 (HTTPS), block all other ports with firewall.

## Volume Management

### Persistent Volumes

All data stored in `vigil_data/` directory:

```
vigil_data/
├── caddy-config/        # Caddy runtime config
├── caddy-data/          # TLS certificates (auto-renewed)
├── clickhouse/          # Database files (partitioned by month)
├── grafana/             # Dashboards, datasources
├── n8n/                 # Workflows, credentials, logs
├── web-ui/              # SQLite database (users.db)
└── prompt-guard-cache/  # Hugging Face model cache
```

### Backup Strategy

**Critical data**:
1. **Configuration files**: `services/workflow/config/*.{json,conf}`
2. **User database**: `vigil_data/web-ui/users.db`
3. **n8n credentials**: `vigil_data/n8n/`
4. **ClickHouse data**: `vigil_data/clickhouse/` (optional, can recreate)

**Backup command**:
```bash
# Create backup archive
tar -czf vigil-backup-$(date +%Y%m%d).tar.gz \
  services/workflow/config/ \
  vigil_data/web-ui/ \
  vigil_data/n8n/ \
  .env

# Exclude logs and ClickHouse (large, recreatable)
```

**Restore command**:
```bash
# Stop services
docker compose down

# Extract backup
tar -xzf vigil-backup-20250131.tar.gz

# Start services
docker compose up -d
```

### Volume Cleanup

**⚠️ Warning**: This deletes all data!

```bash
# Stop all containers
docker compose down

# Remove volumes
docker volume rm $(docker volume ls -q | grep vigil)

# Remove data directory
rm -rf vigil_data/

# Fresh installation
./install.sh
```

## Image Updates

See [MAINTENANCE.md](MAINTENANCE.md) for comprehensive update procedures.

### Quick Update Process

1. **Check for new versions**:
```bash
# Example: Check Grafana
docker pull grafana/grafana:latest
docker inspect grafana/grafana:latest --format='{{index .RepoTags 0}}'
```

2. **Pull specific version and get digest**:
```bash
docker pull grafana/grafana:11.5.0
DIGEST=$(docker inspect grafana/grafana:11.5.0 --format='{{index .RepoDigests 0}}')
echo $DIGEST
# Output: grafana/grafana@sha256:abc123...
```

3. **Update docker-compose.yml**:
```yaml
grafana:
  image: grafana/grafana:11.5.0@sha256:abc123...
```

4. **Test update**:
```bash
docker compose stop grafana
docker compose pull grafana
docker compose up -d grafana
docker compose logs -f grafana
```

5. **Verify health**:
```bash
curl -I http://localhost:3001
docker compose ps grafana  # Should show "healthy"
```

## Health Checks

All services include health checks with 30s intervals:

### ClickHouse
```yaml
test: ["CMD", "wget", "--spider", "-q", "localhost:8123/ping"]
interval: 30s
timeout: 10s
retries: 3
```

### Grafana
```yaml
test: ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"]
interval: 30s
timeout: 10s
retries: 3
```

### n8n
```yaml
test: ["CMD", "wget", "--spider", "-q", "localhost:5678/healthz"]
interval: 30s
timeout: 10s
retries: 3
```

### Web UI Backend
```yaml
test: ["CMD", "wget", "--spider", "-q", "http://localhost:8787/health"]
interval: 30s
timeout: 10s
retries: 3
```

### Web UI Frontend
```yaml
test: ["CMD", "wget", "--spider", "-q", "127.0.0.1:80"]
interval: 30s
timeout: 10s
retries: 3
```

### Prompt Guard API
```yaml
test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
interval: 30s
timeout: 10s
retries: 3
```

### Presidio PII API
```yaml
test: ["CMD", "curl", "-f", "http://localhost:5001/health"]
interval: 30s
timeout: 10s
retries: 3
start_period: 15s  # Longer startup time for model loading
```

**Check health status**:
```bash
docker compose ps  # Shows health status for all services
docker inspect vigil-grafana --format='{{.State.Health.Status}}'
```

## Troubleshooting

### Container Won't Start

**Check logs**:
```bash
docker compose logs -f [service-name]
```

**Common causes**:
1. **Missing environment variable**: Check `.env` file
2. **Port conflict**: Another service using the port
3. **Volume permission issue**: Check file ownership
4. **Dependency not ready**: Wait for health checks

### Service Unhealthy

**Check health status**:
```bash
docker inspect vigil-clickhouse --format='{{json .State.Health}}' | jq
```

**Force restart with health check**:
```bash
docker compose restart clickhouse
docker compose logs -f clickhouse
# Wait for "healthy" status
docker compose ps clickhouse
```

### Network Issues

**Check network exists**:
```bash
docker network ls | grep vigil-net
```

**Recreate network**:
```bash
docker compose down
docker network rm vigil-net
docker network create vigil-net
docker compose up -d
```

**Test inter-container connectivity**:
```bash
# From web-ui-backend to clickhouse
docker exec vigil-web-ui-backend ping -c 3 clickhouse

# From n8n to clickhouse
docker exec vigil-n8n wget -qO- http://clickhouse:8123/ping
```

### Volume Permission Issues

**Grafana permission denied**:
```bash
# Check ownership
ls -la vigil_data/grafana/

# Fix permissions (macOS/Linux)
sudo chown -R 501:20 vigil_data/grafana/

# Restart Grafana
docker compose restart grafana
```

**ClickHouse permission denied**:
```bash
# ClickHouse runs as user 101
sudo chown -R 101:101 vigil_data/clickhouse/
docker compose restart clickhouse
```

### Clean Rebuild

**Rebuild single service**:
```bash
docker compose build --no-cache web-ui-backend
docker compose up -d web-ui-backend
```

**Rebuild all local images**:
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Resource Limits

**Check resource usage**:
```bash
docker stats --no-stream
```

**Set resource limits** (docker-compose.yml):
```yaml
services:
  clickhouse:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Production Deployment

### Security Checklist

- [ ] Change all default passwords
- [ ] Enable HTTPS in Caddy (add certificates)
- [ ] Configure firewall (only 443 open)
- [ ] Set `NODE_ENV=production`
- [ ] Disable anonymous Grafana access
- [ ] Enable audit logging
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Enable Docker security scanning
- [ ] Set resource limits

### Performance Tuning

**ClickHouse**:
```xml
<!-- /etc/clickhouse-server/config.xml -->
<max_concurrent_queries>100</max_concurrent_queries>
<max_memory_usage>8000000000</max_memory_usage>
```

**n8n**:
```yaml
environment:
  EXECUTIONS_MODE: queue  # For high throughput
  EXECUTIONS_PROCESS: main
```

**Grafana**:
```yaml
environment:
  GF_DATABASE_TYPE: postgres  # Instead of SQLite
  GF_DATABASE_HOST: postgres:5432
```

---

**Related Documentation**:
- [INSTALLATION.md](INSTALLATION.md) - Initial setup
- [MAINTENANCE.md](MAINTENANCE.md) - Update procedures
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [SECURITY.md](SECURITY.md) - Security guidelines
