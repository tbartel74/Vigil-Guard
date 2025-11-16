#!/bin/bash
# Version Sweep Script - Update all version references across the codebase
#
# Usage: ./scripts/version-sweep.sh <new_version>
# Example: ./scripts/version-sweep.sh 1.8.1
#
# This script updates version numbers in:
# - Documentation (docs/*.md)
# - README.md
# - Service READMEs
# - Frontend config
# - Package files
# - Workflow JSON references (comments only, not actual workflow files)

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if version argument provided
if [ -z "$1" ]; then
  echo -e "${RED}❌ Error: Version number required${NC}"
  echo "Usage: $0 <new_version>"
  echo "Example: $0 1.8.1"
  exit 1
fi

NEW_VERSION="$1"

# Validate version format (x.y.z)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}❌ Error: Invalid version format${NC}"
  echo "Version must be in format: x.y.z (e.g., 1.8.1)"
  exit 1
fi

echo -e "${GREEN}🚀 Version Sweep: Updating to v${NEW_VERSION}${NC}"
echo ""

# Function to find old versions
find_old_versions() {
  echo -e "${YELLOW}📋 Finding old version references...${NC}"
  echo ""

  # Search for common version patterns
  echo "Searching for v1.7.x references:"
  rg -n "v1\.7\." --type md | head -20 || true
  echo ""

  echo "Searching for v1.6.x references:"
  rg -n "v1\.6\." --type md | head -20 || true
  echo ""

  echo "Searching for 1.7.x references (no 'v' prefix):"
  rg -n "1\.7\.[0-9]" --type md | head -20 || true
  echo ""
}

# Function to update version in files
update_versions() {
  local old_pattern="$1"
  local new_version="$2"
  local description="$3"

  echo -e "${YELLOW}📝 Updating: ${description}${NC}"

  # Find all markdown files
  find . -name "*.md" -type f \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -not -path "./vigil_data/*" \
    -not -path "./.claude-code/*" \
    -exec sed -i '' "s/${old_pattern}/${new_version}/g" {} \;

  echo -e "${GREEN}✅ Updated ${description}${NC}"
}

# Dry run first - show what will be changed
if [ "$2" == "--dry-run" ]; then
  find_old_versions
  echo -e "${YELLOW}ℹ️  Dry run complete. Run without --dry-run to apply changes.${NC}"
  exit 0
fi

# Backup important files
echo -e "${YELLOW}💾 Creating backups...${NC}"
BACKUP_DIR=".version-sweep-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp README.md "$BACKUP_DIR/" 2>/dev/null || true
cp CLAUDE.md "$BACKUP_DIR/" 2>/dev/null || true
cp -r docs/ "$BACKUP_DIR/" 2>/dev/null || true
echo -e "${GREEN}✅ Backups created in $BACKUP_DIR${NC}"
echo ""

# Update version references
update_versions "v1\.7\.9" "v${NEW_VERSION}" "v1.7.9 → v${NEW_VERSION}"
update_versions "v1\.7\.8" "v${NEW_VERSION}" "v1.7.8 → v${NEW_VERSION}"
update_versions "v1\.7\.7" "v${NEW_VERSION}" "v1.7.7 → v${NEW_VERSION}"
update_versions "v1\.7\.0" "v${NEW_VERSION}" "v1.7.0 → v${NEW_VERSION}"
update_versions "v1\.6\.11" "v${NEW_VERSION}" "v1.6.11 → v${NEW_VERSION}"
update_versions "v1\.6\.10" "v${NEW_VERSION}" "v1.6.10 → v${NEW_VERSION}"

# Update version references without 'v' prefix
update_versions "Version.*:.*1\.7\.9" "Version: ${NEW_VERSION}" "Version headers (1.7.9)"
update_versions "Version.*:.*1\.6\.[0-9]+" "Version: ${NEW_VERSION}" "Version headers (1.6.x)"
update_versions "version.*1\.7\.9" "version ${NEW_VERSION}" "Version mentions (1.7.9)"
update_versions "version.*1\.6\.[0-9]+" "version ${NEW_VERSION}" "Version mentions (1.6.x)"

# Update specific patterns
echo -e "${YELLOW}📝 Updating specific patterns...${NC}"

# README.md - version badge
if [ -f "README.md" ]; then
  sed -i '' "s/Current Version.*v[0-9]\+\.[0-9]\+\.[0-9]\+/Current Version: v${NEW_VERSION}/g" README.md
  echo -e "${GREEN}✅ Updated README.md version badge${NC}"
fi

# CLAUDE.md - current version
if [ -f "CLAUDE.md" ]; then
  sed -i '' "s/Current Version:.*v[0-9]\+\.[0-9]\+\.[0-9]\+/Current Version: v${NEW_VERSION}/g" CLAUDE.md
  sed -i '' "s/\*\*Vigil Guard v[0-9]\+\.[0-9]\+\.[0-9]\+\*\*/\*\*Vigil Guard v${NEW_VERSION}\*\*/g" CLAUDE.md
  echo -e "${GREEN}✅ Updated CLAUDE.md current version${NC}"
fi

# Update frontend config if exists
FRONTEND_CONFIG="services/web-ui/frontend/src/config.ts"
if [ -f "$FRONTEND_CONFIG" ]; then
  sed -i '' "s/DOC_VERSION.*=.*['\"][0-9]\+\.[0-9]\+\.[0-9]\+['\"]/DOC_VERSION = '${NEW_VERSION}'/g" "$FRONTEND_CONFIG"
  echo -e "${GREEN}✅ Updated frontend DOC_VERSION${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Version Sweep Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Updated to: v${NEW_VERSION}"
echo "Backups in: $BACKUP_DIR"
echo ""

# Verification
echo -e "${YELLOW}🔍 Verification (should be minimal old references):${NC}"
echo ""
echo "Remaining v1.7.x references:"
rg -n "v1\.7\." --type md 2>/dev/null | wc -l || echo "0"
echo ""
echo "Remaining v1.6.x references:"
rg -n "v1\.6\." --type md 2>/dev/null | wc -l || echo "0"
echo ""

# Suggest next steps
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Review changes: git diff"
echo "2. Update CHANGELOG.md manually (add v${NEW_VERSION} section)"
echo "3. Verify no critical references missed: rg -n \"v1\\.[67]\\.\" --type md"
echo "4. Commit changes: git add -A && git commit -m \"docs: update version references to v${NEW_VERSION}\""
echo ""
echo -e "${GREEN}Done! 🎉${NC}"
