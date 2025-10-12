# Network Aliases Fix - Analysis Report

## Problem Identification

During installation testing, Caddy reverse proxy was returning **HTTP 503 Service Unavailable** errors when trying to access `/ui/` route. The root cause was a mismatch between container names and network aliases.

### Root Cause

**Container Naming Convention:**
- All containers use `vigil-` prefix: `vigil-clickhouse`, `vigil-grafana`, `vigil-n8n`, `vigil-web-ui-frontend`, `vigil-web-ui-backend`

**Caddyfile References (without prefix):**
- `web-ui-frontend:80`
- `web-ui-backend:8787`
- `n8n:5678`
- `grafana:3000`
- `clickhouse:8123`

**Issue:** Docker DNS could not resolve these short names because containers only had their full names (`vigil-*`) registered in the network.

### Error Messages

```
{"level":"error","msg":"no upstreams available"}
{"level":"info","msg":"HTTP request failed","host":"web-ui-frontend:80",
 "error":"Get \"http://web-ui-frontend:80/\": dial tcp: lookup web-ui-frontend on 127.0.0.11:53: no such host"}
```

## Solutions Applied

### 1. Main docker-compose.yml

Added network aliases for all services to match Caddyfile expectations:

```yaml
services:
  clickhouse:
    container_name: vigil-clickhouse
    networks:
      vigil-net:
        aliases:
          - clickhouse  # ✅ Added

  grafana:
    container_name: vigil-grafana
    networks:
      vigil-net:
        aliases:
          - grafana  # ✅ Added

  n8n:
    container_name: vigil-n8n
    networks:
      vigil-net:
        aliases:
          - n8n  # ✅ Added

  web-ui-backend:
    container_name: vigil-web-ui-backend
    networks:
      vigil-net:
        aliases:
          - web-ui-backend  # ✅ Added

  web-ui-frontend:
    container_name: vigil-web-ui-frontend
    networks:
      vigil-net:
        aliases:
          - web-ui-frontend  # ✅ Added
```

### 2. services/web-ui/docker-compose.yml

Added matching aliases for standalone web-ui development:

```yaml
services:
  vigil-web-ui-frontend:
    networks:
      vigil-net:
        aliases:
          - web-ui-frontend  # ✅ Added
```

## Verification

After applying fixes:

```bash
# Test DNS resolution from within Caddy container
docker exec vigil-caddy wget -O- http://web-ui-frontend:80/
# ✅ Success: HTTP 200 OK

# Test from frontend container
docker exec vigil-web-ui-frontend wget -O- http://web-ui-backend:8787/health
# ✅ Success: {"status":"ok"}

# Test main route through Caddy
curl -I http://localhost/ui/
# ✅ Success: HTTP/1.1 200 OK
```

## Impact on Installation

### Before Fix
- ❌ Fresh installations would fail at Caddy routing
- ❌ GUI inaccessible via `http://localhost/ui/`
- ❌ Only direct port access worked (`http://localhost:5173`)

### After Fix
- ✅ Clean installation with proper routing
- ✅ All services accessible via Caddy reverse proxy
- ✅ Consistent naming across all configurations

## Files Modified

1. `/docker-compose.yml` - Added 5 network aliases
2. `/services/web-ui/docker-compose.yml` - Added 1 network alias

## Recommendations

### For Future Development

1. **Consistent Naming Pattern:**
   - Container names: `vigil-[service]` (for uniqueness)
   - Network aliases: `[service]` (for internal routing)
   - This allows both external identification and clean internal DNS

2. **Documentation Updates Needed:**
   - Update `DOCKER.md` to explain network alias strategy
   - Add troubleshooting section for DNS resolution issues
   - Document the naming convention in `CLAUDE.md`

3. **Testing Checklist:**
   ```bash
   # Add to install.sh verification step
   docker exec vigil-caddy wget -q --spider http://web-ui-frontend:80/ || \
     log_error "DNS resolution failed for web-ui-frontend"
   ```

4. **Health Check Enhancement:**
   Update Caddy healthcheck to verify upstream resolution:
   ```yaml
   healthcheck:
     test: ["CMD", "sh", "-c", "wget -q --spider http://localhost:80/ui/ && wget -q --spider http://web-ui-frontend:80/"]
   ```

## Backward Compatibility

✅ **No breaking changes** - These additions are additive only:
- Existing container names remain unchanged
- New aliases add alternative DNS names
- Both `vigil-clickhouse` and `clickhouse` now resolve correctly

## Testing Results

| Service | Container Name | Network Alias | Caddy Route | Status |
|---------|---------------|---------------|-------------|--------|
| ClickHouse | vigil-clickhouse | clickhouse | /clickhouse/* | ✅ |
| Grafana | vigil-grafana | grafana | /grafana/* | ✅ |
| n8n | vigil-n8n | n8n | /n8n/* | ✅ |
| Backend | vigil-web-ui-backend | web-ui-backend | /ui/api/* | ✅ |
| Frontend | vigil-web-ui-frontend | web-ui-frontend | /ui/* | ✅ |

## Conclusion

The network alias fix resolves the Caddy 503 errors and ensures smooth installation. All services are now accessible via their intended routes, and the system is ready for production deployment.

**Status:** ✅ **FIXED AND VERIFIED**

---
*Date: 2025-10-12*
*Fixed by: Claude Code Analysis*
