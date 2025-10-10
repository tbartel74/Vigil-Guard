# Docker Deployment Guide

## Quick Start

### 1. Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum, 8GB recommended
- 10GB free disk space

### 2. Setup Environment

```bash
# Copy environment template
cp config/.env.example .env

# Edit .env and set your values (especially JWT_SECRET!)
nano .env
```

**⚠️ IMPORTANT**: Change these values in `.env`:
- `JWT_SECRET` - Set to a long random string
- `CLICKHOUSE_PASSWORD` - Change default password
- `GF_SECURITY_ADMIN_PASSWORD` - Change Grafana password
- `GROQ_API_KEY` - Add your Groq API key (if using LLM Guard)

### 3. Start All Services

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 4. Access Services

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| **Web UI** | http://localhost:5173/ui | admin / admin123 |
| **n8n Workflow** | http://localhost:5678 | - |
| **Grafana** | http://localhost:3001 | admin / admin (from .env) |
| **Backend API** | http://localhost:8787/api | - |

**⚠️ SECURITY**: Change default Web UI password immediately after first login!

## Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    vigil-network                         │
│                                                           │
│  ┌──────────────┐    ┌──────────────┐   ┌────────────┐ │
│  │  Frontend    │◄───┤  Backend     │◄──┤ SQLite DB  │ │
│  │  (Nginx)     │    │  (Node.js)   │   │ (Volume)   │ │
│  │  Port: 5173  │    │  Port: 8787  │   └────────────┘ │
│  └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                            │
│         │                   ├───► Config Files (RW)     │
│         │                   │                            │
│  ┌──────▼────────────────────▼──────────────────────┐   │
│  │            Caddy Reverse Proxy (Optional)         │   │
│  │            Ports: 80, 443                         │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────┐    ┌──────────────┐   ┌────────────┐  │
│  │    n8n      │───►│ ClickHouse   │◄──┤  Grafana   │  │
│  │ Port: 5678  │    │ Port: 8123   │   │ Port: 3001 │  │
│  └─────────────┘    └──────────────┘   └────────────┘  │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Docker Volumes

Persistent data is stored in named volumes:

| Volume | Purpose | Location |
|--------|---------|----------|
| `web-ui-data` | SQLite user database | `/app/data/users.db` |
| `n8n-data` | n8n workflows & settings | `/home/node/.n8n` |
| `clickhouse-data` | ClickHouse logs | `/var/lib/clickhouse` |
| `grafana-data` | Grafana dashboards | `/var/lib/grafana` |
| `caddy-data` | SSL certificates | `/data` |
| `caddy-config` | Caddy configuration | `/config` |

### Backup Volumes

```bash
# Backup all volumes
docker-compose down
docker run --rm -v vigil-guard_web-ui-data:/data -v $(pwd):/backup alpine tar czf /backup/web-ui-data.tar.gz -C /data .
docker run --rm -v vigil-guard_n8n-data:/data -v $(pwd):/backup alpine tar czf /backup/n8n-data.tar.gz -C /data .
docker run --rm -v vigil-guard_clickhouse-data:/data -v $(pwd):/backup alpine tar czf /backup/clickhouse-data.tar.gz -C /data .
docker run --rm -v vigil-guard_grafana-data:/data -v $(pwd):/backup alpine tar czf /backup/grafana-data.tar.gz -C /data .
```

### Restore Volumes

```bash
# Restore volumes
docker run --rm -v vigil-guard_web-ui-data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/web-ui-data.tar.gz"
docker run --rm -v vigil-guard_n8n-data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/n8n-data.tar.gz"
# ... repeat for other volumes
```

## Development Mode

For development with hot-reload:

```bash
# Create Dockerfile.dev for backend
cat > services/web-ui/backend/Dockerfile.dev << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 8787
CMD ["npm", "run", "dev"]
EOF

# Create Dockerfile.dev for frontend
cat > services/web-ui/frontend/Dockerfile.dev << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
EOF

# Create docker-compose.dev.yml
cat > docker-compose.dev.yml << 'EOF'
version: '3.8'
services:
  web-ui-backend:
    build:
      context: ./services/web-ui/backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./services/web-ui/backend/src:/app/src
      - web-ui-data:/app/data

  web-ui-frontend:
    build:
      context: ./services/web-ui/frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./services/web-ui/frontend/src:/app/src
EOF

# Start with dev overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Useful Commands

### Service Management

```bash
# Start specific services
docker-compose up -d clickhouse grafana

# Restart a service
docker-compose restart web-ui-backend

# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data!)
docker-compose down -v

# View logs for specific service
docker-compose logs -f web-ui-backend

# Execute command in running container
docker-compose exec web-ui-backend sh
```

### Monitoring

```bash
# Check resource usage
docker stats

# View service health
docker-compose ps

# Inspect network
docker network inspect vigil-network

# Check volume usage
docker volume ls
docker system df
```

### Troubleshooting

```bash
# Rebuild containers without cache
docker-compose build --no-cache

# Remove all stopped containers
docker-compose rm -f

# Clean up unused resources
docker system prune -a

# View detailed logs
docker-compose logs --tail=100 -f web-ui-backend
```

## Production Deployment

### 1. Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Set strong `JWT_SECRET` (minimum 32 characters)
- [ ] Configure firewall rules
- [ ] Enable SSL/TLS with Caddy or reverse proxy
- [ ] Restrict network access to required ports only
- [ ] Enable Docker security features (AppArmor, Seccomp)
- [ ] Regular security updates: `docker-compose pull && docker-compose up -d`

### 2. Enable Caddy Reverse Proxy

```bash
# Start with Caddy profile
docker-compose --profile proxy up -d

# Configure SSL in services/proxy/Caddyfile
# Set CADDY_DOMAIN and CADDY_EMAIL in .env
```

### 3. Performance Tuning

Update `.env` for production:

```bash
NODE_ENV=production
LOG_LEVEL=warn
CACHE_TTL_SECONDS=3600
MAX_INPUT_LENGTH=50000
REQUEST_TIMEOUT_MS=30000
```

### 4. Monitoring Setup

```bash
# Enable Grafana dashboards
# Import dashboard from docs/Grafana_dashboard.JSON
# Configure ClickHouse datasource
# Set up alerts for critical metrics
```

## Port Conflicts

If you have port conflicts, change ports in `.env`:

```bash
FRONTEND_PORT=8080      # Instead of 5173
BACKEND_PORT=8788       # Instead of 8787
N8N_PORT=5679           # Instead of 5678
GF_SERVER_HTTP_PORT=3002 # Instead of 3001
```

## Environment Variables Reference

See `config/.env.example` for complete list of configuration options.

**Critical Variables:**
- `JWT_SECRET` - Authentication token secret
- `DATABASE_PATH` - SQLite database location
- `TARGET_DIR` - Configuration files directory
- `CORS_ORIGIN` - Allowed CORS origins
- `CLICKHOUSE_PASSWORD` - Database password
- `GF_SECURITY_ADMIN_PASSWORD` - Grafana admin password

## Troubleshooting

### Web UI Not Loading

```bash
# Check backend logs
docker-compose logs web-ui-backend

# Check if backend is responding
curl http://localhost:8787/api/files

# Check database file
docker-compose exec web-ui-backend ls -la /app/data/
```

### Authentication Issues

```bash
# Check JWT_SECRET is set
docker-compose exec web-ui-backend env | grep JWT

# Reset database (⚠️ deletes all users!)
docker volume rm vigil-guard_web-ui-data
docker-compose up -d web-ui-backend
```

### Permission Errors

```bash
# Fix volume permissions
docker-compose exec web-ui-backend chown -R node:node /app/data
docker-compose restart web-ui-backend
```

### Database Connection Errors

```bash
# Verify database file exists
docker-compose exec web-ui-backend ls -la /app/data/users.db

# Check database is writable
docker-compose exec web-ui-backend sh -c 'touch /app/data/test && rm /app/data/test'
```

## Support

For issues and questions:
- Documentation: [docs/](./docs/)
- GitHub Issues: [Report Issue](https://github.com/tbartel74/Vigil-Guard/issues)
- Authentication Guide: [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md)
