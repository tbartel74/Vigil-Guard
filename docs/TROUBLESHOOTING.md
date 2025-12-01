# Troubleshooting Guide

This guide helps resolve common issues with Vigil Guard deployment and operation.

## Table of Contents

- [Service Port Reference](#service-port-reference)
- [ClickHouse Issues](#clickhouse-issues)
- [Grafana Issues](#grafana-issues)
- [n8n Workflow Issues](#n8n-workflow-issues)
- [Web UI Issues](#web-ui-issues)
- [Docker Network Issues](#docker-network-issues)
- [Configuration Issues](#configuration-issues)
- [Authentication Issues](#authentication-issues)

---

## Service Port Reference

### Production (via Caddy reverse proxy)
- Web UI: http://localhost/ui/
- n8n: http://localhost/n8n/
- Grafana: http://localhost/grafana/
- ClickHouse: http://localhost/clickhouse/

### Development (direct access)
- Web UI Frontend: http://localhost/ui (production) or http://localhost:5173 (dev mode)
- Web UI Backend: http://localhost:8787/api/
- n8n: http://localhost:5678/
- Grafana: http://localhost:3001/
- ClickHouse: http://localhost:8123/ (HTTP), 9000 (native)
- Prompt Guard API: http://localhost:8000/

---

## ClickHouse Issues

### Cannot connect to ClickHouse

**Symptoms:**
- Web UI shows "Database connection failed"
- n8n workflow fails at logging stage
- Grafana shows no data

**Solutions:**

1. **Check if ClickHouse container is running**
   ```bash
   docker ps | grep clickhouse
   ```

2. **Verify credentials in .env file**
   ```bash
   cat .env | grep CLICKHOUSE_PASSWORD
   ```

   Ensure password matches in:
   - `.env` file
   - n8n workflow ClickHouse credentials
   - Grafana datasource configuration

3. **Check ClickHouse health**
   ```bash
   curl http://localhost:8123/ping
   # Should return: Ok.
   ```

4. **Verify database and tables exist**
   ```bash
   docker exec vigil-clickhouse clickhouse-client -q "SHOW DATABASES"
   docker exec vigil-clickhouse clickhouse-client -q "SHOW TABLES FROM n8n_logs"
   ```

   Expected tables: `events_raw`, `events_processed`, `false_positive_reports`, `retention_config`

5. **Check ClickHouse logs**
   ```bash
   docker logs vigil-clickhouse --tail 100
   ```

### ClickHouse queries return empty results

**Symptoms:**
- Dashboard shows 0 events
- Investigation Panel returns no results

**Solutions:**

1. **Verify data is being written**
   ```bash
   docker exec vigil-clickhouse clickhouse-client -q \
     "SELECT count() FROM n8n_logs.events_processed"
   ```

2. **Check n8n workflow is active**
   - Visit http://localhost:5678
   - Ensure "Vigil Guard v1.5" workflow is **Active** (toggle in top-right)

3. **Test workflow with sample request**
   ```bash
   curl -X POST http://localhost:5678/webhook/chat \
     -H "Content-Type: application/json" \
     -d '{"text": "test prompt"}'
   ```

### Type conversion errors in Web UI

**Symptoms:**
- Dashboard shows `NaN` values
- Statistics API returns strings instead of numbers

**Solutions:**

1. **Convert ClickHouse results to numbers in frontend**
   ```javascript
   // In React components
   const count = parseInt(data.total_requests, 10);
   const percentage = parseFloat(data.block_rate);
   ```

2. **Verify ClickHouse column types**
   ```sql
   DESCRIBE TABLE n8n_logs.events_processed
   ```

---

## Grafana Issues

### Grafana shows "Cannot connect to datasource"

**Symptoms:**
- Panels show "No data" or connection errors
- Datasource test fails

**Solutions:**

1. **Verify Grafana embedding is enabled**
   ```bash
   docker exec vigil-grafana grep GF_SECURITY_ALLOW_EMBEDDING /etc/grafana/grafana.ini
   # Should show: allow_embedding = true
   ```

2. **Check ClickHouse datasource configuration**
   - Visit http://localhost:3001/datasources
   - Verify:
     - Host: `vigil-clickhouse:8123`
     - Database: `n8n_logs`
     - Username: `admin`
     - Password: (from `.env` file)

3. **Test datasource connectivity**
   ```bash
   docker exec vigil-grafana curl http://vigil-clickhouse:8123/ping
   ```

### Grafana dashboard shows old data

**Solutions:**

1. **Refresh dashboard** (auto-refresh is 30s)
2. **Clear Grafana cache**
   ```bash
   docker restart vigil-grafana
   ```

---

## n8n Workflow Issues

### Workflow not executing

**Symptoms:**
- Webhook calls return errors
- No events logged in ClickHouse

**Solutions:**

1. **Check workflow is active**
   - Visit http://localhost:5678
   - Click workflow name in list
   - Ensure toggle switch is **ON** (blue)

2. **Verify webhook URL**
   ```bash
   # Test webhook
   curl -X POST http://localhost:5678/webhook/chat \
     -H "Content-Type: application/json" \
     -d '{"text": "test"}'
   ```

3. **Check n8n logs for errors**
   ```bash
   docker logs vigil-n8n --tail 100 -f
   ```

### Config files not loading

**Symptoms:**
- Workflow shows "File not found" errors
- Pattern matching fails

**Solutions:**

1. **Verify config files are mounted**
   ```bash
   docker exec vigil-n8n ls -la /data/config_sanitizer/
   ```

   Expected files:
   - `unified_config.json`
   - `thresholds.config.json`
   - `rules.config.json`
   - `allowlist.schema.json`
   - `normalize.conf`
   - `pii.conf`

2. **Check file permissions**
   ```bash
   docker exec vigil-n8n cat /data/config_sanitizer/unified_config.json
   ```

---

## Web UI Issues

### Cannot login to Web UI

**Symptoms:**
- Login form shows "Invalid credentials"
- Backend returns 401 errors

**Solutions:**

1. **Use correct initial password**
   - Check backend console output during first startup
   - Password is displayed **once** in docker logs:
     ```bash
     docker logs vigil-web-ui-backend 2>&1 | grep "Initial admin password"
     ```

2. **Reset admin password** (if forgotten)
   ```bash
   docker exec vigil-web-ui-backend node -e "
   const db = require('better-sqlite3')('./data/vigil.db');
   const bcrypt = require('bcrypt');
   const newPassword = 'NewSecurePassword123!';
   const hash = bcrypt.hashSync(newPassword, 12);
   db.prepare('UPDATE users SET password_hash = ? WHERE username = ?')
     .run(hash, 'admin');
   console.log('Password reset successfully');
   "
   ```

3. **Check JWT_SECRET is set**
   ```bash
   cat .env | grep JWT_SECRET
   ```

   If missing, add to `.env`:
   ```
   JWT_SECRET=$(openssl rand -base64 48)
   ```

   Then restart backend:
   ```bash
   docker restart vigil-web-ui-backend
   ```

### Web UI assets not loading (404 errors)

**Symptoms:**
- Blank page after login
- Browser console shows 404 for JS/CSS files
- Files requested at wrong paths (e.g., `/assets/` instead of `/ui/assets/`)

**Solutions:**

1. **Verify Vite build base path**
   ```bash
   grep '"base"' services/web-ui/frontend/vite.config.ts
   # Should show: base: "/ui/",
   ```

2. **Rebuild frontend**
   ```bash
   cd services/web-ui/frontend
   npm run build
   docker restart vigil-web-ui-frontend
   ```

### Configuration changes not saving

**Symptoms:**
- Save button shows success but changes revert
- ETag conflict errors

**Solutions:**

1. **Clear browser cache and reload**
   - Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)

2. **Check backend logs for errors**
   ```bash
   docker logs vigil-web-ui-backend --tail 50
   ```

3. **Verify file write permissions**
   ```bash
   docker exec vigil-web-ui-backend ls -la /app/config/
   ```

---

## Docker Network Issues

### Services cannot communicate

**Symptoms:**
- n8n cannot reach ClickHouse
- Web UI backend cannot query database
- Grafana datasource test fails

**Solutions:**

1. **Verify vigil-network exists**
   ```bash
   docker network ls | grep vigil-network
   ```

   If missing:
   ```bash
   docker network create vigil-network
   ```

2. **Check all containers are on same network**
   ```bash
   docker inspect vigil-clickhouse --format='{{json .NetworkSettings.Networks}}' | jq
   ```

   Should show `vigil-network`.

3. **Restart all services**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

---

## Configuration Issues

### Config file locations

**Workflow config files:**
```
services/workflow/config/
├── unified_config.json      # Main detection settings
├── thresholds.config.json   # Score thresholds
├── rules.config.json        # Detection patterns
├── allowlist.schema.json    # Whitelisted patterns
├── normalize.conf           # Text normalization
└── pii.conf                 # PII redaction patterns
```

**Variable mapping specs:**
```
services/web-ui/frontend/src/spec/variables.json
```

**Documentation:**
```
docs/config/env.md           # Environment variables (quick reference)
docs/config/unified-config.md # unified_config.json guide
```

### Changes to config files not reflected in workflow

**Solutions:**

1. **Reload workflow in n8n**
   - Visit workflow in n8n UI
   - Click "Execute Workflow" button
   - Or restart n8n container:
     ```bash
     docker restart vigil-n8n
     ```

2. **Verify config files are mounted correctly**
   ```bash
   docker-compose config | grep -A 5 "config_sanitizer"
   ```

---

## Authentication Issues

### Rate limiting (HTTP 429)

**Symptoms:**
- Login fails with "Too many requests"
- Password change blocked

**Solutions:**

1. **Wait for rate limit window to expire**
   - Login: 15 minutes
   - Password change: 15 minutes

2. **Check rate limit settings** (if you need to adjust)
   ```javascript
   // services/web-ui/backend/src/auth.js
   const loginLimiter = {
     windowMs: 15 * 60 * 1000,  // 15 minutes
     maxRequests: 5
   };
   ```

### Session expired errors

**Solutions:**

1. **Check JWT token expiration** (default: 24 hours)
2. **Re-login to get new token**
3. **Verify browser accepts cookies**

---

## Language Detection Issues (v1.8.1+)

### Issue: Polish text detected as wrong language

**Symptoms:**
- Logs show `language: id` (Indonesian) instead of `pl` (Polish)
- Short text like "Karta i PESEL" misclassified

**Diagnosis:**
```bash
curl -X POST http://localhost:5002/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"Karta 5555555555554444 i PESEL 44051401359","detailed":true}'
```

**Solution:**
Verify hybrid detection is active:
- Expected: `"method": "entity_based"` (not "statistical")
- Expected: `"language": "pl"`

If showing wrong method, rebuild language-detector:
```bash
cd services/language-detector
docker build --no-cache -t vigil-language-detector:1.0.1 .
docker-compose restart language-detector
```

### Issue: CREDIT_CARD not detected in Polish text

**Symptoms:**
- Credit cards detected in English but not Polish
- Logs show correct language (`pl`)
- Example: "Karta 4111111111111111" → no CREDIT_CARD entity

**Root Cause:** Outdated recognizers.yaml (v1.8.1 had `supported_language: en`)

**Solution:**
```bash
# 1. Verify recognizer configuration
docker exec vigil-presidio-pii python3 -c "
from presidio_analyzer import AnalyzerEngine
analyzer = AnalyzerEngine()
print('CREDIT_CARD in PL:', 'CREDIT_CARD' in analyzer.get_supported_entities(language='pl'))
"
# Expected: CREDIT_CARD in PL: True

# 2. If False, rebuild Presidio
cd services/presidio-pii-api
docker build --no-cache -t vigil-presidio-pii:1.6.11 .
docker-compose restart presidio-pii-api
```

### Issue: Valid credit card number marked as [PHONE]

**Symptoms:**
- Number like "666666666666" detected as PHONE_NUMBER
- Expected: CREDIT_CARD detection

**Root Cause:** Number fails Luhn checksum validation

**Solution:**
Use valid test credit card numbers:
- `4111111111111111` (Visa test card)
- `5555555555554444` (Mastercard test card)
- `4532015112830366` (Visa test card)

Invalid numbers (like "666666666666") are correctly rejected by CREDIT_CARD recognizer.

---

## Getting Help

If you cannot resolve the issue:

1. **Check logs for all services**
   ```bash
   docker-compose logs --tail=100
   ```

2. **Review documentation**
   - [Installation Guide](./INSTALLATION.md)
   - [Configuration Guide](./CONFIGURATION.md)
   - [API Reference](./API.md)
   - [Security Guide](./SECURITY.md)

3. **File an issue** (if bug found)
   - Include: logs, config files, steps to reproduce
   - Redact: passwords, secrets, sensitive data

---

**Last Updated:** 2025-10-28
**Version:** 1.5.0
