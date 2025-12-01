# Proxy Service

Caddy reverse proxy for Vigil Guard services.

## Architecture

```
services/proxy/
├── Caddyfile           # Routing configuration
└── docker-compose.yml  # Service definition
```

## Traffic Flow

```
Client Request (port 80)
        │
        ▼
     Caddy
        │
        ├─ /ui/*     → web-ui-frontend:80
        ├─ /n8n/*    → n8n:5678
        ├─ /grafana/* → grafana:3000
        └─ /api/*    → web-ui-backend:8787
```

## Caddyfile Configuration

```caddyfile
:80 {
    # Web UI Frontend
    handle /ui/* {
        uri strip_prefix /ui
        reverse_proxy web-ui-frontend:80
    }

    # n8n Workflow Engine
    handle /n8n/* {
        uri strip_prefix /n8n
        reverse_proxy n8n:5678
    }

    # Grafana Dashboards
    handle /grafana/* {
        uri strip_prefix /grafana
        reverse_proxy grafana:3000
    }

    # API Backend
    handle /api/* {
        reverse_proxy web-ui-backend:8787
    }

    # Health check
    handle /health {
        respond "OK" 200
    }
}
```

## Quick Start

### Check Status

```bash
# Health check
curl http://localhost/health

# Service routing
curl http://localhost/ui        # Web UI
curl http://localhost/n8n       # n8n
curl http://localhost/grafana   # Grafana
```

### View Logs

```bash
docker logs vigil-caddy --tail 100 -f
```

## HTTPS Configuration

For production, enable automatic HTTPS:

```caddyfile
yourdomain.com {
    # Automatic HTTPS from Let's Encrypt

    handle /ui/* {
        uri strip_prefix /ui
        reverse_proxy web-ui-frontend:80
    }

    # ... other routes
}
```

### With Custom Certificate

```caddyfile
yourdomain.com {
    tls /path/to/cert.pem /path/to/key.pem

    # ... routes
}
```

## Headers and Security

Add security headers:

```caddyfile
:80 {
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # ... routes
}
```

## Load Balancing

For high availability:

```caddyfile
:80 {
    handle /api/* {
        reverse_proxy {
            to backend1:8787 backend2:8787
            lb_policy round_robin
            health_uri /health
            health_interval 30s
        }
    }
}
```

## Docker Configuration

```yaml
# docker-compose.yml
services:
  caddy:
    image: caddy:2-alpine
    container_name: vigil-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./services/proxy/Caddyfile:/etc/caddy/Caddyfile
      - ./vigil_data/caddy:/data
    networks:
      - vigil-network
    restart: unless-stopped
```

## Troubleshooting

### 502 Bad Gateway

Service is not reachable:

```bash
# Check if service is running
docker ps | grep web-ui

# Test internal connectivity
docker exec vigil-caddy wget -qO- http://web-ui-frontend:80/health
```

### 404 Not Found

Path stripping issue:

1. Check Caddyfile `uri strip_prefix` directives
2. Verify service expects paths without prefix
3. Check nginx configuration in frontend

### Certificate Issues

```bash
# View certificate info
docker exec vigil-caddy caddy list-modules

# Force certificate renewal
docker exec vigil-caddy caddy reload
```

## Performance Tuning

```caddyfile
{
    # Global options
    servers {
        timeouts {
            read_body 30s
            read_header 10s
            write 60s
            idle 5m
        }
    }
}
```

## Related Documentation

- [Installation Guide](../../docs/operations/installation.md)
- [Docker Operations](../../docs/operations/docker.md)
- [Security Guide](../../docs/SECURITY.md)
