#!/bin/bash
set -euo pipefail

# Configuration
MODELS_DIR="services/presidio-pii-api/models"
VENV_DIR="/tmp/presidio-model-download-venv"

# spaCy model URLs (GitHub releases)
EN_MODEL_URL="https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl"
PL_MODEL_URL="https://github.com/explosion/spacy-models/releases/download/pl_core_news_sm-3.7.0/pl_core_news_sm-3.7.0-py3-none-any.whl"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📥 Downloading spaCy models for Presidio PII detection..."
echo ""

# Create models directory if not exists
mkdir -p "$MODELS_DIR"

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "❌ Error: curl not found. Please install curl."
    exit 1
fi

# Download models directly from GitHub releases
echo "📦 Downloading en_core_web_sm-3.7.1..."
curl -L -o "$MODELS_DIR/en_core_web_sm-3.7.1-py3-none-any.whl" "$EN_MODEL_URL"

echo ""
echo "📦 Downloading pl_core_news_sm-3.7.0..."
curl -L -o "$MODELS_DIR/pl_core_news_sm-3.7.0-py3-none-any.whl" "$PL_MODEL_URL"

# Generate checksums
echo ""
echo "🔐 Generating SHA-256 checksums..."
cd "$MODELS_DIR"
shasum -a 256 *.whl > checksums.sha256
echo ""
echo -e "${GREEN}Checksums generated:${NC}"
cat checksums.sha256

# Calculate total size
echo ""
TOTAL_SIZE=$(du -sh . | cut -f1)
echo -e "${GREEN}✅ Models downloaded to $MODELS_DIR${NC}"
echo -e "${GREEN}📦 Total size: $TOTAL_SIZE${NC}"
echo ""
echo "Files:"
ls -lh *.whl

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Verify checksums: cd $MODELS_DIR && shasum -a 256 -c checksums.sha256"
echo "  2. Commit checksums: git add $MODELS_DIR/checksums.sha256"
echo "  3. Model files (.whl) are gitignored automatically"
