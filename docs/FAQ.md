# Frequently Asked Questions

Common questions and answers about Vigil Guard.

## Installation

### What are the system requirements?

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB | 50 GB |
| Docker | 20.10+ | Latest |
| Node.js | 18.0+ | 20 LTS |

### The installer fails with "permission denied"

Make the install script executable:
```bash
chmod +x install.sh
./install.sh
```

### How long does installation take?

- **First run:** 10-15 minutes (downloads Docker images, models)
- **Subsequent runs:** 2-3 minutes (uses cached images)

### Can I run Vigil Guard without Docker?

No. The architecture requires Docker for container orchestration. All 9 services run in isolated containers for security and reproducibility.

### Port 80 is already in use

Stop conflicting services or change the Caddy port in `docker-compose.yml`:
```yaml
caddy:
  ports:
    - "8080:80"  # Change 80 to 8080
```

---

## Configuration

### Where are detection rules stored?

Detection rules are in `services/workflow/config/`:
- `rules.config.json` - Pattern definitions (993 keywords)
- `unified_config.json` - Thresholds and settings

**Important:** Never edit these files directly. Use the Web UI at http://localhost/ui/config/

### How do I add a custom detection pattern?

1. Navigate to Configuration → Detection Tuning
2. Select the target category
3. Add your pattern (keyword or regex)
4. Save changes
5. Test with the Investigation Panel

### What's the difference between Light and Heavy sanitization?

| Mode | Score Range | Actions |
|------|-------------|---------|
| Light | 30-64 | Remove suspicious keywords, basic cleanup |
| Heavy | 65-84 | Aggressive pattern removal, placeholder insertion |

### How do I change detection thresholds?

In Web UI → Configuration → Detection & Sensitivity:
- `block_threshold`: Score to block content (default: 50)
- `sanitize_light_threshold`: Light sanitization (default: 30)
- `sanitize_heavy_threshold`: Heavy sanitization (default: 65)

---

## Detection

### What are the three detection branches?

| Branch | Service | Function |
|--------|---------|----------|
| **A** (Heuristics) | Port 5005 | Pattern matching, keywords, regex |
| **B** (Semantic) | Port 5006 | Embedding similarity, category matching |
| **C** (LLM Safety Engine) | Port 8000 | ML classification via Llama Guard 2 |

### How does the Arbiter combine scores?

The Arbiter uses weighted fusion:
```
Final = (A × 0.30) + (B × 0.35) + (C × 0.35)
```

With boost policies for high-confidence detections (when any branch exceeds 80).

### Why was my prompt blocked?

Use the Investigation Panel (http://localhost/ui/investigation) to see:
- Individual branch scores
- Matched categories
- Detection reasons
- Score breakdown

### What are "boost policies"?

Boost policies increase the final score when high-confidence matches occur:
- If Branch A > 80 → Final score +15
- If Branch C detects jailbreak → Final score ×1.5

---

## PII Detection

### What PII types are detected?

50+ entity types including:
- **Universal:** EMAIL, PHONE_NUMBER, CREDIT_CARD, IP_ADDRESS
- **Polish:** PESEL, NIP, REGON, Polish ID numbers
- **English:** SSN, US addresses, UK NHS numbers

### How does dual-language detection work?

1. Language detector identifies text language (PL/EN)
2. Presidio runs with both Polish and English models
3. Results are deduplicated (overlapping entities removed)
4. Highest-confidence matches are kept

### How do I disable PII detection for specific entity types?

In Web UI → PII Detection → Entity Types, toggle off unwanted types.

### PII detection is missing some entities

Check these settings:
- Confidence threshold (default: 0.7, lower = more detections)
- Context enhancement (improves accuracy for ambiguous text)
- Language detection (ensure correct language model is used)

---

## Troubleshooting

### Services won't start

```bash
# Check service status
./scripts/status.sh

# View logs
./scripts/logs.sh

# Restart all services
docker-compose restart
```

### "Connection refused" errors

1. Wait 30-60 seconds after startup (services initializing)
2. Check Docker networks: `docker network inspect vigil-net`
3. Verify port availability: `lsof -i :5678`

### Tests are failing

```bash
# Ensure workflow is active
curl http://localhost:5678/healthz

# Run tests with verbose output
cd services/workflow
npm test -- --reporter=verbose
```

### ClickHouse errors

```bash
# Check ClickHouse health
curl http://localhost:8123/ping

# Verify credentials match .env
docker exec vigil-clickhouse clickhouse-client \
  --user admin --password $CLICKHOUSE_PASSWORD \
  -q "SELECT 1"
```

### Web UI shows blank page

1. Clear browser cache
2. Check browser console for errors
3. Verify Caddy is running: `docker logs vigil-caddy`
4. Check frontend build: `docker logs vigil-web-ui-frontend`

---

## Performance

### How fast is detection?

| Metric | Value |
|--------|-------|
| Heuristics (Branch A) | <5ms |
| Semantic (Branch B) | <15ms |
| LLM Safety Engine (Branch C) | <100ms |
| PII Detection | <50ms |
| **Total pipeline** | <200ms |

### Can I disable Branch C to improve speed?

Yes, but it reduces detection accuracy for novel attacks. In unified_config.json:
```json
"branch_c_enabled": false
```

### High memory usage

Check which service is consuming memory:
```bash
docker stats
```

Common solutions:
- Limit ClickHouse memory in docker-compose.yml
- Reduce Grafana retention period
- Clear old partitions: `ALTER TABLE events_v2 DROP PARTITION '202409'`

---

## Security

### How are secrets managed?

- Auto-generated by install.sh (64+ character tokens)
- Stored in `.env` file (never committed to git)
- Backend fails fast if secrets are missing

### What OWASP categories are covered?

- **APP-01:** Direct Prompt Injection (96% detection)
- **APP-02:** Indirect Prompt Injection (82.5% detection)
- **APP-07:** Prompt Extraction (95% detection)

### How do I report a security vulnerability?

See [SECURITY.md](../SECURITY.md) for our vulnerability disclosure policy.

---

## Integration

### How do I integrate with my LLM application?

Send POST requests to the webhook:
```bash
curl -X POST http://localhost:5678/webhook/vigil-guard-2 \
  -H "Content-Type: application/json" \
  -d '{"chatInput": "your prompt", "sessionId": "user123"}'
```

### Is there a Python SDK?

Not currently. Use the REST API directly or the browser extension for ChatGPT/Claude integration.

### Can I use Vigil Guard as a proxy?

Yes. Configure your LLM client to route through Vigil Guard, then forward to your LLM provider if content is ALLOWED.

---

## Related Documentation

- [Installation Guide](operations/installation.md)
- [Configuration Guide](guides/configuration.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [API Reference](API.md)
