#!/bin/bash

# Download Llama Prompt Guard 2 model to THIS directory
# This script downloads the model directly to the repository location

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Llama Prompt Guard 2 - Local Download${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}⚠${NC}  This will download ~1.1 GB to THIS directory"
echo -e "${YELLOW}⚠${NC}  Download location: $(pwd)"
echo ""

# Check if model already exists
if [ -f "config.json" ] && [ -f "model.safetensors" ]; then
    echo -e "${GREEN}✓${NC} Model already exists in this directory"
    echo ""
    echo "Files found:"
    ls -lh config.json model.safetensors tokenizer.json 2>/dev/null || true
    echo ""
    read -p "Re-download? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Download cancelled."
        exit 0
    fi
fi

# Check for huggingface-cli
if ! command -v huggingface-cli &> /dev/null; then
    echo -e "${RED}✗${NC} huggingface-cli not found"
    echo ""
    echo "Install Hugging Face CLI:"
    echo "  pip install huggingface-hub"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓${NC} Hugging Face CLI found"

# Check authentication
if ! huggingface-cli whoami &> /dev/null; then
    echo -e "${RED}✗${NC} Not logged in to Hugging Face"
    echo ""
    echo "Please login first:"
    echo "  huggingface-cli login"
    echo ""
    echo "You'll need a Hugging Face account (free):"
    echo "  https://huggingface.co/join"
    echo ""
    exit 1
fi

USERNAME=$(huggingface-cli whoami | head -n 1)
echo -e "${GREEN}✓${NC} Logged in as: ${USERNAME}"
echo ""

# License warning
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}LICENSE AGREEMENT REQUIRED${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Before downloading, you must accept Meta's license at:"
echo ""
echo "  https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M"
echo ""
echo "Steps:"
echo "  1. Visit the URL above"
echo "  2. Click 'Agree and access repository'"
echo "  3. Return here and continue"
echo ""
read -p "Have you accepted the license? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please accept the license first, then run this script again."
    exit 1
fi

# Download model
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Downloading Model (~1.1 GB)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Download location: $(pwd)"
echo "Model: meta-llama/Llama-Prompt-Guard-2-86M"
echo ""

huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M \
    --local-dir . \
    --local-dir-use-symlinks False

# Verify download
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Verifying Download${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

REQUIRED_FILES=(
    "config.json"
    "model.safetensors"
    "tokenizer.json"
    "tokenizer_config.json"
)

ALL_PRESENT=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        SIZE=$(ls -lh "$file" | awk '{print $5}')
        echo -e "${GREEN}✓${NC} $file ($SIZE)"
    else
        echo -e "${RED}✗${NC} $file (missing)"
        ALL_PRESENT=false
    fi
done

echo ""
if [ "$ALL_PRESENT" = true ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ Download Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Model downloaded successfully to:"
    echo "  $(pwd)"
    echo ""
    echo "Total size:"
    du -sh . | awk '{print "  " $1}'
    echo ""
    echo "Next steps:"
    echo "  1. Return to project root: cd .."
    echo "  2. Run installation: ./install.sh"
    echo ""
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}✗ Download Incomplete${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Some required files are missing."
    echo "Try running the script again."
    echo ""
    exit 1
fi
