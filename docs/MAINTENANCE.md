# Maintenance Guide

> **Procedures for updating Docker images, dependencies, and security patches**

## 🐳 Docker Image Updates

### Current Pinned Versions

All Docker images are pinned to specific versions with SHA256 digests for supply chain security:

| Service | Current Version | Digest (first 12 chars) |
|---------|----------------|-------------------------|
| **ClickHouse** | 24.1 | `44caeed7c81f` |
| **Grafana** | 11.4.0 | `d8ea37798ccc` |
| **n8n** | 1.72.0 | `f0182719d8b2` |
| **Caddy** | 2-alpine | `953131cfea8e` |
| **Presidio PII** | 1.6.10 | (local build) |
| **Prompt Guard** | (local build) | (local build) |

### Why Pin to Digests?

**Security Benefits:**
- **Immutable**: SHA256 digest never changes, preventing tag hijacking
- **Reproducible**: Same digest = exact same image across environments
- **Supply Chain**: Protection against compromised registry tags
- **Audit Trail**: Know exactly which image version is running

**Recommended Update Frequency:**
| Component | Frequency | Reason |
|-----------|-----------|--------|
| **ClickHouse** | Monthly | Security patches, performance improvements |
| **Grafana** | Monthly | Security patches, dashboard improvements |
| **n8n** | Quarterly | Major features, breaking changes possible |
| **Caddy** | Monthly | Security patches, TLS improvements |
| **Python Services** | Quarterly | Breaking changes in ML libraries |

---

## 📦 Updating Docker Images

### Step 1: Check for New Versions

```bash
# Check Grafana releases
docker pull grafana/grafana:latest
docker inspect grafana/grafana:latest --format='{{index .RepoTags 0}}'

# Check n8n releases
docker pull n8nio/n8n:latest
docker inspect n8nio/n8n:latest --format='{{index .RepoTags 0}}'

# Check ClickHouse releases
docker pull clickhouse/clickhouse-server:latest
docker inspect clickhouse/clickhouse-server:latest --format='{{index .RepoTags 0}}'
```

### Step 2: Pull Specific Version and Get Digest

```bash
# Example: Update Grafana to version 11.5.0
docker pull grafana/grafana:11.5.0

# Get the SHA256 digest
DIGEST=$(docker inspect grafana/grafana:11.5.0 --format='{{index .RepoDigests 0}}')
echo $DIGEST
# Output: grafana/grafana@sha256:abc123...
```

### Step 3: Update docker-compose.yml

Edit `docker-compose.yml` and replace the image line:

```yaml
# BEFORE:
  grafana:
    image: grafana/grafana:11.4.0@sha256:d8ea37798ccc41061a62ab080f2676dda6bf7815558499f901bdb0f533a456fb

# AFTER:
  grafana:
    image: grafana/grafana:11.5.0@sha256:abc123...  # New digest from Step 2
```

### Step 4: Test the Update

```bash
# Stop current container
docker-compose stop grafana

# Pull new image (should already be cached from Step 2)
docker-compose pull grafana

# Start with new image
docker-compose up -d grafana

# Check logs for errors
docker-compose logs -f grafana

# Verify service health
curl -I http://localhost:3001
```

### Step 5: Verify in Production

- [ ] Login to Web UI (http://localhost/ui)
- [ ] Check Monitoring page (Grafana dashboards load correctly)
- [ ] Verify data from last 24h is visible
- [ ] Test Configuration page (panels render)

### Step 6: Commit Changes

```bash
git add docker-compose.yml
git commit -m "chore(docker): Update Grafana from 11.4.0 to 11.5.0

Updated Grafana image with security patches and new features.

- Version: 11.4.0 → 11.5.0
- Digest: d8ea37798ccc → abc123...
- Tested: All dashboards loading correctly

Changelog: https://github.com/grafana/grafana/releases/tag/v11.5.0"
```

---

## 🔒 Security Patch Process

### Critical Vulnerabilities (CVE with CVSS ≥ 7.0)

**Timeline**: Apply within 7 days

1. Check affected services:
   ```bash
   # Scan all images
   docker images --format "{{.Repository}}:{{.Tag}}" | \
     grep -E "grafana|n8n|clickhouse|caddy" | \
     xargs -I {} docker scan {}
   ```

2. Follow "Updating Docker Images" procedure above
3. Deploy to staging first (if available)
4. Monitor for 24h before production deploy

### Regular Updates (Monthly)

**Timeline**: First week of each month

1. Create maintenance branch:
   ```bash
   git checkout -b maintenance/docker-updates-2025-11
   ```

2. Update all images following procedure above
3. Run full test suite:
   ```bash
   cd services/workflow
   npm test
   ```

4. Create PR with changelog
5. Merge after review

---

## 🐍 Python Dependencies Updates

See service-specific guides:
- [prompt-guard-api/README.requirements.md](../prompt-guard-api/README.requirements.md)
- [services/presidio-pii-api/README.requirements.md](../services/presidio-pii-api/README.requirements.md)

**Quick Update:**
```bash
# Rebuild container with new dependencies
docker-compose build vigil-prompt-guard-api

# Generate new lock file
docker exec vigil-prompt-guard-api pip freeze > prompt-guard-api/requirements.lock

# Commit both requirements.txt and requirements.lock
git add prompt-guard-api/requirements.*
git commit -m "chore(deps): Update prompt-guard-api Python dependencies"
```

---

## 📊 n8n Workflow Updates

**Location**: `services/workflow/workflows/Vigil-Guard-v*.json`

### Backup Before Updates

```bash
# Backup current workflow
cp services/workflow/workflows/Vigil-Guard-v1.8.1.json \
   services/workflow/workflows/backup/Vigil-Guard-v1.8.1-$(date +%Y%m%d).json
```

### Export from n8n UI

1. Open http://localhost:5678
2. Open workflow in editor
3. Click "..." → "Download"
4. Save to `services/workflow/workflows/`
5. Commit with version bump:
   ```bash
   git add services/workflow/workflows/Vigil-Guard-v1.8.1.json
   git commit -m "feat(workflow): Update to v1.8.1 with new sanitization rules"
   ```

---

## 🔐 Security Scanning

### Weekly Scans (Automated in CI/CD)

```bash
# Scan Python dependencies
pip-audit -r prompt-guard-api/requirements.lock
pip-audit -r services/presidio-pii-api/requirements.lock

# Scan Docker images
docker scan grafana/grafana:11.4.0@sha256:d8ea37798ccc...
docker scan n8nio/n8n:1.72.0@sha256:f0182719d8b2...
```

### Trivy Scan (Container Vulnerabilities)

```bash
# Install Trivy (if not already installed)
brew install trivy  # macOS
# OR: apt-get install trivy  # Linux

# Scan all images
trivy image grafana/grafana:11.4.0@sha256:d8ea37798ccc...
trivy image n8nio/n8n:1.72.0@sha256:f0182719d8b2...
trivy image clickhouse/clickhouse-server:24.1@sha256:44caeed7c81f...
```

---

## 📝 Update Checklist

Before deploying updates:

- [ ] Backup current configuration (`.env`, workflow files)
- [ ] Review release notes for breaking changes
- [ ] Update docker-compose.yml with new digest
- [ ] Test in local environment
- [ ] Check logs for errors (`docker-compose logs`)
- [ ] Verify Web UI functionality
- [ ] Run security scan (`trivy image ...`)
- [ ] Update this MAINTENANCE.md with new versions
- [ ] Commit changes with detailed message
- [ ] Monitor production for 24h after deploy

---

## 🆘 Rollback Procedure

If update causes issues:

```bash
# Stop all services
docker-compose down

# Revert docker-compose.yml
git checkout HEAD~1 -- docker-compose.yml

# Pull old images (should be cached)
docker-compose pull

# Start with old configuration
docker-compose up -d

# Verify services are healthy
docker-compose ps
```

---

## 📞 Support

For issues during updates:
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Review Docker logs: `docker-compose logs -f [service]`
- GitHub Issues: https://github.com/tbartel74/Vigil-Guard/issues
