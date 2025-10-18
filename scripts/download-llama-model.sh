#!/bin/bash

# Download Llama Prompt Guard Model Script
# This script helps download the Llama Prompt Guard 2 model from Hugging Face

set -euo pipefail
IFS=$'\n\t'

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

print_header "Llama Prompt Guard 2 Model Downloader"

echo "This script will help you download the Llama Prompt Guard 2 model from Hugging Face."
echo ""
log_warning "IMPORTANT: Due to Meta's Llama 4 Community License:"
log_warning "  - You must accept the license agreement on Hugging Face"
log_warning "  - The model cannot be included in the repository"
log_warning "  - You must download it separately"
echo ""

# Determine target directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$(dirname "$PROJECT_ROOT")/vigil-llm-models"
MODEL_PATH="$MODELS_DIR/Llama-Prompt-Guard-2-86M"

log_info "Target location: $MODEL_PATH"
echo ""

# Check if model already exists
if [ -d "$MODEL_PATH" ] && [ -f "$MODEL_PATH/config.json" ]; then
    log_success "Model already exists at $MODEL_PATH"
    echo ""
    read -p "Do you want to re-download? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping download. Exiting."
        exit 0
    fi
    log_info "Removing existing model..."
    rm -rf "$MODEL_PATH"
fi

# Check for Python and pip
if ! command_exists python3 && ! command_exists python; then
    log_error "Python is not installed!"
    log_info "Install Python from: https://www.python.org/"
    exit 1
fi

PYTHON_CMD=$(command_exists python3 && echo "python3" || echo "python")
log_success "Python found: $($PYTHON_CMD --version)"

# Check for pip
if ! $PYTHON_CMD -m pip --version >/dev/null 2>&1; then
    log_error "pip is not installed!"
    log_info "Install pip: $PYTHON_CMD -m ensurepip --upgrade"
    exit 1
fi

log_success "pip found: $($PYTHON_CMD -m pip --version | cut -d' ' -f2)"
echo ""

# Install huggingface-hub if not present
log_info "Checking for huggingface-hub..."
if ! $PYTHON_CMD -c "import huggingface_hub" 2>/dev/null; then
    log_warning "huggingface-hub not found. Installing..."
    $PYTHON_CMD -m pip install --user huggingface-hub
    log_success "huggingface-hub installed"
else
    log_success "huggingface-hub is already installed"
fi
echo ""

# Check if logged in
log_info "Checking Hugging Face authentication..."
AUTH_OUTPUT=$($PYTHON_CMD -c "from huggingface_hub import whoami; whoami()" 2>&1)
AUTH_STATUS=$?

if [ $AUTH_STATUS -ne 0 ]; then
    # Parse error to determine the cause
    if echo "$AUTH_OUTPUT" | grep -qi "ModuleNotFoundError\|ImportError"; then
        log_error "Failed to import huggingface_hub module"
        log_error "Error output:"
        echo "$AUTH_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Troubleshooting:"
        log_info "  Try reinstalling: $PYTHON_CMD -m pip install --user --upgrade huggingface-hub"
        exit 1
    elif echo "$AUTH_OUTPUT" | grep -qi "URLError\|ConnectionError\|NetworkError\|Failed to connect\|Connection refused"; then
        log_error "Cannot connect to Hugging Face (network issue)"
        log_error "Error output:"
        echo "$AUTH_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Troubleshooting:"
        log_info "  1. Check your internet connection"
        log_info "  2. Verify firewall/proxy settings"
        log_info "  3. Try accessing: https://huggingface.co"
        exit 1
    elif echo "$AUTH_OUTPUT" | grep -qi "401\|403\|unauthorized\|token.*invalid\|token.*expired"; then
        log_error "Hugging Face token is invalid or expired"
        log_error "Error output:"
        echo "$AUTH_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Steps to fix:"
        log_info "  1. Get a new token: https://huggingface.co/settings/tokens"
        log_info "  2. Run: huggingface-cli login"
        log_info "  3. Or set: export HF_TOKEN=your_new_token"
        exit 1
    elif echo "$AUTH_OUTPUT" | grep -qi "500\|502\|503\|504\|service unavailable\|server error"; then
        log_error "Hugging Face API is experiencing issues"
        log_error "Error output:"
        echo "$AUTH_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Please try again later or check: https://status.huggingface.co"
        exit 1
    else
        # Generic not logged in message
        log_warning "Not logged in to Hugging Face"
        if [ -n "$AUTH_OUTPUT" ]; then
            echo ""
            log_info "Error details:"
            echo "$AUTH_OUTPUT" | sed 's/^/    /'
        fi
        echo ""
        log_info "Please login to Hugging Face:"
        echo ""
        echo "  1. Get your token from: https://huggingface.co/settings/tokens"
        echo "  2. Run: huggingface-cli login"
        echo "  3. Or set environment variable: export HF_TOKEN=your_token_here"
        echo ""
        log_info "After logging in, run this script again."
        exit 1
    fi
else
    HF_USER=$($PYTHON_CMD -c "from huggingface_hub import whoami; print(whoami()['name'])" 2>/dev/null || echo "unknown")
    log_success "Logged in as: $HF_USER"
fi
echo ""

# Check license acceptance
log_info "Checking license acceptance..."
log_warning "You must accept the license at:"
log_warning "  https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M"
echo ""
read -p "Have you accepted the license? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_error "License must be accepted before downloading."
    log_info "Visit: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M"
    log_info "Click 'Agree and access repository' button"
    exit 1
fi
echo ""

# Create target directory
log_info "Creating target directory..."
mkdir -p "$MODELS_DIR"
cd "$MODELS_DIR"
log_success "Directory created: $MODELS_DIR"
echo ""

# Download model
print_header "Downloading Model (this may take 5-10 minutes)"
echo ""
log_info "Downloading to: $MODEL_PATH"
log_info "Model size: ~1.1 GB"
echo ""

if command_exists huggingface-cli; then
    # Use CLI if available
    huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M --local-dir Llama-Prompt-Guard-2-86M
else
    # Use Python API
    $PYTHON_CMD -c "
from huggingface_hub import snapshot_download
import os

print('Downloading model...')
snapshot_download(
    repo_id='meta-llama/Llama-Prompt-Guard-2-86M',
    local_dir='$MODEL_PATH',
    local_dir_use_symlinks=False
)
print('Download complete!')
"
fi

echo ""
log_success "Model downloaded successfully!"
echo ""

# Verify download
log_info "Verifying download..."
REQUIRED_FILES=("config.json" "model.safetensors" "tokenizer.json" "tokenizer_config.json")
ALL_PRESENT=true

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$MODEL_PATH/$file" ]; then
        log_success "$file"
    else
        log_error "$file - NOT FOUND"
        ALL_PRESENT=false
    fi
done

echo ""
if [ "$ALL_PRESENT" = true ]; then
    log_success "✅ All required files are present!"
    log_success "Model is ready to use at: $MODEL_PATH"
    echo ""
    log_info "You can now run the installation script: ./install.sh"
else
    log_error "❌ Some files are missing. Download may be incomplete."
    log_info "Try running this script again."
    exit 1
fi

echo ""
log_info "Attribution: Built with Llama"
log_info "License: Llama 4 Community License, Copyright © Meta Platforms, Inc."
echo ""
