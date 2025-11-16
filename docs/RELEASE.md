# Release Process

## Overview

This document describes the comprehensive release process for Vigil Guard, including version updates, testing, documentation, and deployment.

## Version Numbering

Vigil Guard follows [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., 1.8.1)
  - **MAJOR**: Breaking changes (backward incompatible)
  - **MINOR**: New features (backward compatible)
  - **PATCH**: Bug fixes (backward compatible)

### Version Increment Guidelines

| Change Type | Version Increment | Example |
|-------------|-------------------|---------|
| Breaking API changes | MAJOR (x.0.0) | 1.8.1 → 2.0.0 |
| New workflow nodes | MINOR (x.y.0) | 1.8.1 → 1.9.0 |
| New detection categories | MINOR (x.y.0) | 1.8.1 → 1.9.0 |
| New PII entity types | MINOR (x.y.0) | 1.8.1 → 1.9.0 |
| Bug fixes | PATCH (x.y.z) | 1.8.1 → 1.8.2 |
| Security patches | PATCH (x.y.z) | 1.8.1 → 1.8.2 |
| Documentation updates | PATCH (x.y.z) | 1.8.1 → 1.8.2 |

## Pre-Release Checklist

### 1. Code Freeze

- [ ] All features merged to `main` branch
- [ ] All tests passing (`npm test` in `services/workflow/`)
- [ ] No critical bugs in issue tracker
- [ ] Security audit completed (if MINOR/MAJOR release)

### 2. Version Sweep

Run the automated version sweep script:

```bash
# Dry run first (preview changes)
./scripts/version-sweep.sh 1.8.1 --dry-run

# Apply changes
./scripts/version-sweep.sh 1.8.1

# Verify no old versions remain
rg -n "v1\.[67]\." --type md | wc -l  # Should be 0
```

**Files Updated Automatically:**
- All `docs/*.md` files
- `README.md` (version badge)
- `CLAUDE.md` (current version)
- `services/web-ui/frontend/src/config.ts` (DOC_VERSION)
- Service READMEs

**Manual Updates Required:**
- `CHANGELOG.md` (add new version section)
- Workflow JSON filename (if workflow changed)
- Docker Compose service versions (if images changed)

### 3. Update CHANGELOG.md

Add new version section at the top:

```markdown
## [1.8.1] - 2025-11-16

### Added
- SmartPersonRecognizer for PERSON entity false positive prevention
- Hybrid language detection with entity-based hints
- PII flags preservation in workflow v1.8.1

### Fixed
- PERSON entity false positives (AI models, pronouns, jailbreak personas)
- Language detection fallback to 'pl' when service unavailable
- `_pii_sanitized` flag missing in Finale Decision node

### Changed
- Language detector rate limit increased to 1000 req/min

### Security
- N/A

### Breaking Changes
- None (backward compatible with v1.7.9)

### Migration Notes
- Workflow import required: `Vigil Guard v1.8.1.json`
- No database changes
- No configuration changes
```

### 4. Documentation Review

**Critical Documentation Files:**

1. **CLAUDE.md** - Update:
   - Current version header
   - Version history section
   - Recent changes summary

2. **README.md** - Verify:
   - Version badge matches
   - Feature list current
   - Installation instructions work
   - Links not broken

3. **QUICKSTART.md** - Test:
   - All commands execute without errors
   - Examples use correct version numbers
   - Screenshots up-to-date (if workflow UI changed)

4. **USER_GUIDE.md** - Review:
   - New features documented
   - Examples tested
   - Configuration options current

5. **ARCHITECTURE.md** - Update if:
   - New services added
   - Data flow changed
   - New integrations added

### 5. Testing Checklist

**Automated Tests:**

```bash
# Unit tests (if any)
cd services/web-ui/backend && npm test

# E2E tests (critical)
cd services/workflow
npm test  # All tests

# Specific test suites
npm test -- smoke.test.js                      # 3 tests (must pass)
npm test -- bypass-scenarios.test.js           # Attack detection
npm test -- false-positives.test.js            # Clean input handling
npm test -- pii-detection-comprehensive.test.js # PII detection
npm test -- pii-person-allow-list.test.js      # SmartPersonRecognizer
npm test -- pii-detection-fallback.test.js     # Language detection fallback
```

**Manual Tests:**

1. **Clean Install:**
   ```bash
   # On fresh VM/container
   git clone https://github.com/yourusername/vigil-guard.git
   cd vigil-guard
   git checkout v1.8.1  # Tag after release
   ./install.sh
   # Verify all services start
   ./scripts/status.sh
   ```

2. **Upgrade Test:**
   ```bash
   # From previous version
   git pull
   git checkout v1.8.1
   docker-compose down
   docker-compose up -d --build
   # Import new workflow JSON manually
   # Test webhook: curl -X POST http://localhost:5678/webhook/test -d '{"chatInput":"test"}'
   ```

3. **Critical Functionality:**
   - [ ] Web UI login works (http://localhost/ui)
   - [ ] n8n workflow active (http://localhost:5678)
   - [ ] Webhook responds (test via chat)
   - [ ] PII detection working (send "My PESEL is 12345678901")
   - [ ] Grafana dashboards load (http://localhost:3001)
   - [ ] ClickHouse queries work (test retention endpoint)

### 6. Security Audit (MINOR/MAJOR releases)

```bash
# Run security scanners
npm audit                       # NPM vulnerabilities
docker scan vigil-web-ui-backend  # Container vulnerabilities
./scripts/check-secrets.sh       # Secret leaks (create if needed)

# Check OWASP Top 10 compliance
- [ ] SQL Injection prevention (parameterized queries)
- [ ] XSS prevention (DOMPurify, React escaping)
- [ ] CSRF protection (JWT + SameSite cookies)
- [ ] Authentication (bcrypt, JWT expiry)
- [ ] Secrets management (.env not committed)
- [ ] Rate limiting (5 login attempts / 15 min)
- [ ] Input validation (no path traversal)
- [ ] ReDoS protection (regex timeout)
```

## Release Execution

### 1. Create Release Branch

```bash
git checkout main
git pull
git checkout -b release/v1.8.1
```

### 2. Final Commits

```bash
# Version sweep
./scripts/version-sweep.sh 1.8.1
git add -A
git commit -m "docs: update version references to v1.8.1"

# CHANGELOG.md update
vim CHANGELOG.md
git add CHANGELOG.md
git commit -m "docs: add v1.8.1 CHANGELOG entry"

# Workflow JSON (if changed)
git add services/workflow/workflows/"Vigil Guard v1.8.1.json"
git commit -m "feat(workflow): release v1.8.1 with SmartPersonRecognizer"
```

### 3. Create Git Tag

```bash
# Annotated tag (preferred)
git tag -a v1.8.1 -m "Release v1.8.1: SmartPersonRecognizer + Language Detection Improvements

Added:
- SmartPersonRecognizer (PERSON entity false positive prevention)
- Hybrid language detection (entity hints + statistical)
- PII flags preservation in workflow

Fixed:
- PERSON entity false positives (AI models, pronouns)
- Language detection fallback behavior
- _pii_sanitized flag missing in Finale Decision

See CHANGELOG.md for full details."

# Verify tag
git tag -v v1.8.1
git show v1.8.1
```

### 4. Push Release

```bash
# Push branch
git push origin release/v1.8.1

# Create PR for review
gh pr create --title "Release v1.8.1" --body "See CHANGELOG.md for details"

# After PR approval, merge to main
gh pr merge release/v1.8.1

# Push tag
git push origin v1.8.1
```

### 5. Create GitHub Release

```bash
# Via GitHub CLI
gh release create v1.8.1 \
  --title "v1.8.1: SmartPersonRecognizer + Language Detection" \
  --notes-file docs/RELEASE_NOTES_v1.8.1.md \
  --verify-tag

# OR manually via GitHub UI:
# https://github.com/yourusername/vigil-guard/releases/new
# - Tag: v1.8.1
# - Title: v1.8.1: SmartPersonRecognizer + Language Detection
# - Description: Paste from CHANGELOG.md
# - Attachments: Workflow JSON (optional)
```

## Post-Release Tasks

### 1. Update Documentation Website (if applicable)

```bash
# Deploy to GitHub Pages / ReadTheDocs
# (Implementation depends on docs hosting)
```

### 2. Notify Users

- [ ] Post release announcement (GitHub Discussions, Discord, Slack)
- [ ] Update project README shields/badges
- [ ] Send notification to stakeholders

### 3. Monitor Deployment

**First 24 Hours:**
- Monitor error logs: `docker-compose logs -f --tail=100`
- Check ClickHouse for anomalies: `SELECT COUNT(*) FROM events_processed WHERE timestamp > now() - INTERVAL 1 HOUR`
- Verify Grafana dashboards show healthy metrics

**First Week:**
- Review GitHub Issues for new bugs
- Monitor test suite pass rate (should stay >85%)
- Check production metrics (response time, error rate)

### 4. Backport Critical Fixes

If critical bugs found after release:

```bash
# Create hotfix branch from tag
git checkout -b hotfix/v1.8.2 v1.8.1

# Fix bug
git add .
git commit -m "fix(pii): critical regex pattern error"

# Update version (patch increment)
./scripts/version-sweep.sh 1.8.2

# Tag and release
git tag -a v1.8.2 -m "Hotfix v1.8.2: Critical regex pattern error"
git push origin hotfix/v1.8.2
git push origin v1.8.2
```

## Rollback Procedure

If critical issues found after release:

### 1. Immediate Rollback (Production)

```bash
# Stop current version
docker-compose down

# Checkout previous stable version
git checkout v1.7.9

# Rebuild and restart
docker-compose up -d --build

# Import previous workflow JSON
# Manual step: n8n GUI → Import → Vigil Guard v1.7.9.json
```

### 2. Revert Git Tag (if not yet published)

```bash
# Delete local tag
git tag -d v1.8.1

# Delete remote tag (DANGEROUS - avoid if users already pulled)
git push origin :refs/tags/v1.8.1
```

### 3. Create Rollback Release Notes

```markdown
## [1.8.1-REVOKED] - 2025-11-16

**This release has been revoked due to critical bug.**

Please use v1.7.9 instead: https://github.com/yourusername/vigil-guard/releases/tag/v1.7.9

Affected versions: v1.8.1
Issue: [Link to GitHub issue]
Fixed in: v1.8.2 (planned)
```

## Version Sweep Automation

### Automated Checks (CI/CD)

```yaml
# .github/workflows/version-check.yml
name: Version Consistency Check

on:
  pull_request:
    branches: [main]

jobs:
  version-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check version consistency
        run: |
          # Extract version from package.json
          VERSION=$(jq -r '.version' services/web-ui/backend/package.json)

          # Check all version references
          if rg -q "v1\.[0-7]\." --type md; then
            echo "❌ Old version references found"
            rg -n "v1\.[0-7]\." --type md
            exit 1
          fi

          echo "✅ Version consistency verified"
```

### Pre-Commit Hook (Optional)

```bash
# .git/hooks/pre-commit
#!/bin/bash
# Prevent commits with version inconsistencies

# Check if version sweep needed
if git diff --cached --name-only | grep -q "workflow/workflows/.*\.json"; then
  echo "⚠️  Workflow JSON changed - did you run version sweep?"
  echo "Run: ./scripts/version-sweep.sh <new_version>"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
```

## Release Checklist Summary

Print this checklist for each release:

```
## Pre-Release
- [ ] All tests passing
- [ ] Code freeze
- [ ] Version sweep executed (./scripts/version-sweep.sh X.Y.Z)
- [ ] CHANGELOG.md updated
- [ ] Documentation reviewed
- [ ] Security audit (if MINOR/MAJOR)

## Release
- [ ] Release branch created (release/vX.Y.Z)
- [ ] Git tag created (vX.Y.Z)
- [ ] PR merged to main
- [ ] Tag pushed
- [ ] GitHub release created

## Post-Release
- [ ] Docs website updated
- [ ] Users notified
- [ ] Monitoring active
- [ ] No critical issues (24h)

## Rollback Ready
- [ ] Previous version tagged
- [ ] Rollback procedure tested
- [ ] Downgrade path documented
```

---

**Last Updated:** 2025-11-16
**Current Version:** v1.8.1
**Maintained By:** Vigil Guard Release Team
