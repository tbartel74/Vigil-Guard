# CI/CD Secrets Configuration

> **Required GitHub Actions secrets for automated testing and builds**

## ⚠️ IMPORTANT: Configure Before Merging

**The CI workflows in this repository depend on 5 GitHub Actions secrets being configured BEFORE any code changes are merged.** Failing to configure these secrets will cause all CI workflow runs to fail.

If you see errors like `secrets.CI_CLICKHOUSE_PASSWORD is not set`, follow the "Quick Setup" section below **immediately**.

## Overview

The Vigil Guard CI/CD pipeline requires 5 GitHub repository secrets to run automated tests and validation. These secrets are used **only** in the CI/CD environment and are separate from production credentials.

## Required Secrets

Configure these in **Settings → Secrets and variables → Actions → New repository secret**:

| Secret Name | Purpose | Min Length | Example Generation |
|-------------|---------|------------|-------------------|
| `CI_CLICKHOUSE_PASSWORD` | ClickHouse test database | 32 chars | `openssl rand -base64 48 \| tr -d '/+=\n' \| head -c 32` |
| `CI_GRAFANA_ADMIN_PASSWORD` | Grafana admin (unused in CI) | 32 chars | `openssl rand -base64 48 \| tr -d '/+=\n' \| head -c 32` |
| `CI_JWT_SECRET` | Web UI JWT signing | 48 chars | `openssl rand -base64 64 \| tr -d '/+=\n' \| head -c 48` |
| `CI_SESSION_SECRET` | Web UI session encryption | 64 chars | `openssl rand -base64 96 \| tr -d '/+=\n' \| head -c 64` |
| `CI_WEB_UI_ADMIN_PASSWORD` | Web UI admin test account | 32 chars | `openssl rand -base64 48 \| tr -d '/+=\n' \| head -c 32` |

## Quick Setup

```bash
# Generate all secrets at once
echo "CI_CLICKHOUSE_PASSWORD=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 32)"
echo "CI_GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 32)"
echo "CI_JWT_SECRET=$(openssl rand -base64 64 | tr -d '/+=\n' | head -c 48)"
echo "CI_SESSION_SECRET=$(openssl rand -base64 96 | tr -d '/+=\n' | head -c 64)"
echo "CI_WEB_UI_ADMIN_PASSWORD=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 32)"
```

Then copy each value to GitHub:
1. Go to: `https://github.com/[USERNAME]/Vigil-Guard/settings/secrets/actions`
2. Click **"New repository secret"**
3. Paste name and value
4. Click **"Add secret"**

## Workflow Usage

### test-workflow.yml

Uses `CI_CLICKHOUSE_PASSWORD` for:
- Starting ClickHouse service container
- Health check verification
- Database initialization
- Table creation verification

### ci.yml

Uses all 5 secrets for:
- **Docker build smoke tests**: Starting Web UI backend with test credentials
- **Docker Compose validation**: Validating syntax with required environment variables
- **Service dependency checks**: Ensuring all services can be configured

## Security Notes

### ✅ Good Practices

1. **Separate from production**: CI secrets ≠ production secrets
2. **Minimum length enforcement**: All secrets meet OWASP recommendations
3. **Cryptographically random**: Generated with `openssl rand`
4. **Scope limitation**: Used only in CI/CD, never exposed in logs
5. **No default values**: Workflows fail if secrets missing

### ⚠️ Important

- **DO NOT** reuse production passwords in CI
- **DO NOT** commit secrets to repository
- **DO NOT** share secrets between environments
- **DO** rotate secrets every 90 days
- **DO** use GitHub's secret masking (automatic)

## Verification

After adding secrets, trigger a workflow run:

```bash
# Push a commit to main branch
git commit --allow-empty -m "test: Verify CI secrets configuration"
git push origin main

# Or manually trigger workflow
# Go to Actions → Select workflow → Run workflow
```

Check the workflow logs - secrets should appear as `***` when referenced.

## Troubleshooting

### Error: "secrets.CI_CLICKHOUSE_PASSWORD is not set"

**Cause**: Secret not configured in GitHub repository settings

**Fix**:
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add missing secret from table above

### Error: "docker-compose config failed"

**Cause**: Missing one or more required secrets for validation

**Fix**: Ensure all 5 secrets are configured:
```bash
# Check which secrets are configured
gh secret list
```

### Error: "Container failed health check"

**Cause**: Secret value doesn't meet minimum length requirement

**Fix**: Regenerate secret with correct length:
```bash
# Example for JWT_SECRET (48 chars minimum)
openssl rand -base64 64 | tr -d '/+=\n' | head -c 48
```

## Rotation Schedule

**Recommended**: Rotate CI secrets every 90 days

1. Generate new secrets (use commands above)
2. Update in GitHub Settings → Secrets
3. Trigger test workflow to verify
4. Old secrets automatically invalidated

---

**Last Updated**: 2025-12-01
**Related**: [SECURITY.md](SECURITY.md), [Installation Guide](operations/installation.md)
