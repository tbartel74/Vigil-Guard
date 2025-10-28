#!/bin/bash
set -euo pipefail  # Fail fast on errors

# Configuration
VG_ROOT="/Users/tomaszbartel/Documents/Projects/Vigil-Guard"
BACKUP_ROOT="/Users/tomaszbartel/Documents/Projects/vigil-misc"
BACKUP_DIR="$BACKUP_ROOT/vigil-guard-pii-rollback-v1.5"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Files to backup (explicit list - no wildcards)
declare -a FILES=(
  "services/workflow/config/pii.conf"
  "services/workflow/config/unified_config.json"
  "services/workflow/workflows/Vigil-Guard-v1.5.json"
  "docker-compose.yml"
  "docs/CONFIGURATION.md"
  "CLAUDE.md"
  "docs/USER_GUIDE.md"
  "README.md"
  "services/web-ui/frontend/src/spec/variables.json"
  "services/web-ui/backend/package.json"
  "services/web-ui/frontend/package.json"
  "package.json"
)

# Create backup structure
echo "📦 Creating backup in $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"/{config,n8n-workflow,web-ui/backend,web-ui/frontend,docs}

# Backup files
cd "$VG_ROOT"
for file in "${FILES[@]}"; do
  target_dir="$BACKUP_DIR/$(dirname "$file")"
  mkdir -p "$target_dir"
  cp -R "$file" "$target_dir/"
  echo "  ✓ Backed up: $file"
done

# Create rollback instructions
cat > "$BACKUP_DIR/README_ROLLBACK.md" << 'EOF'
# Rollback to v1.5 (Pre-PII Modernization)

## Quick Rollback (5 minutes)

1. Stop all services:
   ```bash
   VG_ROOT="/Users/tomaszbartel/Documents/Projects/Vigil-Guard"
   cd "$VG_ROOT"
   docker-compose down --remove-orphans
   ```

2. Restore files:
   ```bash
   BACKUP_DIR="/Users/tomaszbartel/Documents/Projects/vigil-misc/vigil-guard-pii-rollback-v1.5"
   cp -R "$BACKUP_DIR/services" "$VG_ROOT/"
   cp "$BACKUP_DIR/docker-compose.yml" "$VG_ROOT/"
   cp -R "$BACKUP_DIR/docs/"* "$VG_ROOT/docs/"
   cp "$BACKUP_DIR/package.json" "$VG_ROOT/"
   ```

3. Remove Presidio service and rebuild:
   ```bash
   docker compose rm -f presidio-pii-api
   docker-compose up -d
   ```

4. Reimport workflow:
   - Open n8n: http://localhost:5678
   - Import `$BACKUP_DIR/services/workflow/workflows/Vigil-Guard-v1.5.json`
   - Activate workflow

5. Verify (smoke test):
   ```bash
   ./scripts/status.sh
   curl http://localhost:8787/api/files  # Should work
   curl -X POST http://localhost:5678/webhook-test -d '{"chatInput": "test"}'
   ```

## Full Rollback (Git)
```bash
cd /Users/tomaszbartel/Documents/Projects/Vigil-Guard
git checkout v1.5.0-pre-pii-modernization
docker-compose down --remove-orphans
docker-compose up -d
```

## Smoke Test Checklist
- [ ] n8n workflow responds to webhook
- [ ] Web UI loads and shows v1.5.0
- [ ] PII detection uses old pii.conf rules
- [ ] Grafana dashboards load
- [ ] ClickHouse logging works
EOF

echo ""
echo "✅ Backup complete: $BACKUP_DIR"
echo "📝 Rollback instructions: $BACKUP_DIR/README_ROLLBACK.md"
echo ""
echo "Next steps:"
echo "  1. Test rollback on sandbox"
echo "  2. Create git tag: git tag v1.5.0-pre-pii-modernization"
echo "  3. Update .gitignore"
