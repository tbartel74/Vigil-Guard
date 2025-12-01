# Docker Operations

Last updated: 2025-12-01

## Overview

Vigil Guard runs as a set of Docker containers orchestrated by Docker Compose. This guide covers common operations, troubleshooting, and best practices.

## Quick Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f web-ui-backend

# Restart a service
docker-compose restart n8n

# Rebuild and restart
docker-compose up -d --build web-ui-frontend
```

## Services and Ports

| Service | Container Name | Internal Port | External Port | Description |
|---------|---------------|---------------|---------------|-------------|
| Caddy | vigil-caddy | 80 | 80 | Reverse proxy |
| Web UI Frontend | vigil-web-ui-frontend | 80 | - | React SPA |
| Web UI Backend | vigil-web-ui-backend | 8787 | 8787 | Express API |
| n8n | vigil-n8n | 5678 | 5678 | Workflow engine |
| Heuristics | vigil-heuristics | 5005 | 5005 | Branch A |
| Semantic | vigil-semantic | 5006 | 5006 | Branch B |
| Prompt Guard | vigil-prompt-guard | 8000 | 8000 | Branch C (LLM) |
| Presidio PII | vigil-presidio-pii | 5001 | 5001 | PII detection |
| Language Detector | vigil-language-detector | 5002 | 5002 | Language detection |
| ClickHouse | vigil-clickhouse | 8123, 9000 | 8123, 9000 | Analytics DB |
| Grafana | vigil-grafana | 3000 | 3001 | Monitoring |

## Volumes

### Persistent Data

```yaml
volumes:
  - ./vigil_data/config:/app/config
  - ./vigil_data/web-ui:/data
  - ./vigil_data/clickhouse:/var/lib/clickhouse
  - ./vigil_data/grafana:/var/lib/grafana
  - ./vigil_data/n8n:/home/node/.n8n
```

### Llama Model (External)

```yaml
volumes:
  - ../vigil-llm-models:/models:ro
```

**Note:** The Llama Guard model is stored outside the repository to avoid git bloat. Download with:
```bash
./scripts/download-llama-model.sh
```

## Network Configuration

All containers share the `vigil-network`:

```yaml
networks:
  vigil-network:
    driver: bridge
```

### Inter-Service Communication

Services communicate using container names:
- `http://vigil-clickhouse:8123` - ClickHouse HTTP
- `http://vigil-presidio-pii:5001` - Presidio API
- `http://vigil-n8n:5678` - n8n webhooks

## Health Checks

### Manual Health Checks

```bash
# Caddy
curl http://localhost/health

# Web UI Backend
curl http://localhost:8787/health

# Heuristics
curl http://localhost:5005/health

# Semantic
curl http://localhost:5006/health

# Presidio
curl http://localhost:5001/health

# Language Detector
curl http://localhost:5002/health

# ClickHouse
curl http://localhost:8123/ping

# Grafana
curl http://localhost:3001/api/health
```

### Docker Health Status

```bash
# Check all container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# Detailed health info
docker inspect --format='{{.State.Health.Status}}' vigil-clickhouse
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs for errors
docker-compose logs service-name

# Check container exit code
docker inspect service-name --format='{{.State.ExitCode}}'

# Force recreate container
docker-compose up -d --force-recreate service-name
```

### Network Issues

```bash
# Verify network exists
docker network ls | grep vigil

# Check container network membership
docker network inspect vigil-network

# Test inter-container connectivity
docker exec vigil-web-ui-backend ping vigil-clickhouse
```

### Volume Permission Issues

```bash
# Fix ownership (Linux/macOS)
sudo chown -R $(id -u):$(id -g) vigil_data/

# For Grafana (specific UID/GID)
sudo chown -R 472:472 vigil_data/grafana/
```

### Out of Disk Space

```bash
# Check Docker disk usage
docker system df

# Clean unused resources
docker system prune -a --volumes

# Remove old images
docker image prune -a
```

### Container Memory Issues

```bash
# Check container resource usage
docker stats

# Set memory limits in docker-compose.yml
services:
  semantic-service:
    deploy:
      resources:
        limits:
          memory: 2G
```

## Updating Services

### Pull Latest Changes

```bash
# Stop services
docker-compose down

# Pull changes
git pull

# Rebuild specific service
docker-compose build --no-cache web-ui-backend

# Start services
docker-compose up -d
```

### Update Dependencies

```bash
# For Node.js services
docker-compose exec web-ui-backend npm ci

# For Python services
docker-compose exec presidio-pii-api pip install -r requirements.txt
```

### Database Migrations

```bash
# Run ClickHouse migrations
docker exec -i vigil-clickhouse clickhouse-client < services/monitoring/sql/migration.sql
```

## Backup and Restore

### Backup Data

```bash
# Stop services
docker-compose down

# Backup volumes
tar -czvf vigil-backup-$(date +%Y%m%d).tar.gz vigil_data/

# Start services
docker-compose up -d
```

### Restore Data

```bash
# Stop services
docker-compose down

# Restore volumes
tar -xzvf vigil-backup-20251201.tar.gz

# Start services
docker-compose up -d
```

### ClickHouse Backup

```bash
# Backup specific table
docker exec vigil-clickhouse clickhouse-client \
  --query="SELECT * FROM n8n_logs.events_processed FORMAT Native" \
  > events_backup.native

# Restore
docker exec -i vigil-clickhouse clickhouse-client \
  --query="INSERT INTO n8n_logs.events_processed FORMAT Native" \
  < events_backup.native
```

## Production Considerations

### Resource Recommendations

| Service | CPU | Memory | Disk |
|---------|-----|--------|------|
| Caddy | 0.5 | 256MB | 1GB |
| Web UI | 1 | 512MB | 5GB |
| n8n | 1 | 1GB | 10GB |
| Heuristics | 1 | 512MB | 1GB |
| Semantic | 2 | 2GB | 5GB |
| Prompt Guard | 4 (GPU) | 8GB | 20GB |
| Presidio | 2 | 1GB | 5GB |
| ClickHouse | 2 | 4GB | 50GB+ |
| Grafana | 0.5 | 512MB | 5GB |

### Logging

```yaml
services:
  web-ui-backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Restart Policy

```yaml
services:
  n8n:
    restart: unless-stopped
```

## Related Documentation

- [Installation Guide](installation.md) - Initial setup
- [CI/CD](ci-cd.md) - Automated deployments
- [Troubleshooting](../TROUBLESHOOTING.md) - Common issues
