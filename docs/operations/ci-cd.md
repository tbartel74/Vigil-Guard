# CI/CD Pipeline

Last updated: 2025-12-01

## Overview

Vigil Guard uses GitHub Actions for continuous integration and deployment. The pipeline validates code quality, runs tests, performs security scans, and can deploy to production environments.

## Workflow Files

```
.github/workflows/
├── ci.yml              # Main CI pipeline
├── test-workflow.yml   # E2E workflow tests
└── security-scan.yml   # Security scanning
```

## Main CI Pipeline (ci.yml)

### Trigger Events

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
```

### Jobs

#### 1. Lint and Type Check

```yaml
lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npm run lint
    - run: npm run type-check
```

#### 2. Unit Tests

```yaml
test-unit:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      service: [heuristics-service, semantic-service, web-ui-backend]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: cd services/${{ matrix.service }} && npm ci
    - run: cd services/${{ matrix.service }} && npm test -- tests/unit/
```

#### 3. E2E Tests

```yaml
test-e2e:
  runs-on: ubuntu-latest
  services:
    clickhouse:
      image: clickhouse/clickhouse-server:24.1
      ports:
        - 8123:8123
      env:
        CLICKHOUSE_PASSWORD: ${{ secrets.CI_CLICKHOUSE_PASSWORD }}
  steps:
    - uses: actions/checkout@v4
    - run: cd services/workflow && npm ci
    - run: cd services/workflow && npm test -- tests/e2e/
```

#### 4. Security Scan

```yaml
security:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm audit --audit-level=high
    - uses: trufflesecurity/trufflehog@main
      with:
        path: ./
```

#### 5. Docker Build

```yaml
docker:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: docker-compose build
    - run: docker-compose config --quiet
```

### Job Dependencies

```yaml
all-checks:
  needs: [lint, test-unit, test-e2e, security, docker]
  runs-on: ubuntu-latest
  steps:
    - run: echo "All checks passed"
```

## Required Secrets

Configure in GitHub Settings → Secrets → Actions:

| Secret | Purpose | Min Length |
|--------|---------|------------|
| `CI_CLICKHOUSE_PASSWORD` | ClickHouse test database | 32 chars |
| `CI_GRAFANA_ADMIN_PASSWORD` | Grafana (unused in CI) | 32 chars |
| `CI_JWT_SECRET` | JWT signing for tests | 48 chars |
| `CI_SESSION_SECRET` | Session encryption | 64 chars |
| `CI_WEB_UI_ADMIN_PASSWORD` | Web UI test account | 32 chars |

### Generate Secrets

```bash
echo "CI_CLICKHOUSE_PASSWORD=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 32)"
echo "CI_GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 32)"
echo "CI_JWT_SECRET=$(openssl rand -base64 64 | tr -d '/+=\n' | head -c 48)"
echo "CI_SESSION_SECRET=$(openssl rand -base64 96 | tr -d '/+=\n' | head -c 64)"
echo "CI_WEB_UI_ADMIN_PASSWORD=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 32)"
```

## Local Testing

### Run CI Checks Locally

```bash
# Lint
cd services/web-ui/frontend && npm run lint
cd services/web-ui/backend && npm run lint

# Type check
cd services/web-ui/backend && npm run type-check

# Unit tests
cd services/heuristics-service && npm test -- tests/unit/
cd services/semantic-service && npm test -- tests/unit/

# E2E tests (requires running services)
cd services/workflow && npm test -- tests/e2e/
```

### Using act (GitHub Actions locally)

```bash
# Install act
brew install act  # macOS
# or download from https://github.com/nektos/act

# Run workflows
act -j lint
act -j test-unit
```

## Deployment

### Manual Deployment

```bash
# SSH to server
ssh user@production-server

# Pull latest changes
cd /opt/vigil-guard
git pull origin main

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d

# Verify health
./scripts/status.sh
```

### Automated Deployment (Optional)

```yaml
deploy:
  needs: all-checks
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - name: Deploy to production
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.DEPLOY_HOST }}
        username: ${{ secrets.DEPLOY_USER }}
        key: ${{ secrets.DEPLOY_KEY }}
        script: |
          cd /opt/vigil-guard
          git pull
          docker-compose up -d --build
```

## Status Badges

Add to README.md:

```markdown
[![CI](https://github.com/tbartel74/vigil-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/tbartel74/vigil-guard/actions/workflows/ci.yml)
[![Security](https://github.com/tbartel74/vigil-guard/actions/workflows/security-scan.yml/badge.svg)](https://github.com/tbartel74/vigil-guard/actions/workflows/security-scan.yml)
```

## Troubleshooting

### Workflow Failed

1. Check the Actions tab for error details
2. Review the failed job's logs
3. Run the same commands locally to reproduce

### Secret Not Found

```
Error: secrets.CI_CLICKHOUSE_PASSWORD is not set
```

**Solution:** Add the missing secret in repository settings

### Docker Build Timeout

```yaml
docker:
  timeout-minutes: 30  # Increase timeout
```

### Test Flakiness

```yaml
test-e2e:
  strategy:
    fail-fast: false  # Continue other tests on failure
```

## Best Practices

1. **Keep CI fast:** Target <10 minutes for full pipeline
2. **Cache dependencies:** Use `actions/cache` for node_modules
3. **Fail fast:** Stop on first error in development
4. **Branch protection:** Require CI to pass before merge
5. **Secret rotation:** Rotate CI secrets every 90 days

## Related Documentation

- [Docker Operations](docker.md) - Container management
- [CI Secrets Guide](../CI_SECRETS.md) - Detailed secret setup
- [Security Guide](../SECURITY.md) - Security practices
