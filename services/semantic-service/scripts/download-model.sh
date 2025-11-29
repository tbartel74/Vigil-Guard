#!/bin/bash
# ============================================================================
# Download MiniLM L6 v2 INT8 ONNX Model
# Semantic Service - Branch B
# Version: 1.0.0
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="${SERVICE_DIR}/models"

MODEL_NAME="all-MiniLM-L6-v2"
MODEL_ONNX_DIR="${MODELS_DIR}/${MODEL_NAME}-onnx"
MODEL_INT8_DIR="${MODELS_DIR}/${MODEL_NAME}-onnx-int8"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Check dependencies
# ============================================================================

check_dependencies() {
    log_info "Checking dependencies..."

    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is required but not installed"
        exit 1
    fi

    # Check pip packages
    local missing_packages=()

    if ! python3 -c "import transformers" 2>/dev/null; then
        missing_packages+=("transformers")
    fi

    if ! python3 -c "import optimum.onnxruntime" 2>/dev/null; then
        missing_packages+=("optimum[onnxruntime]")
    fi

    if ! python3 -c "import onnxruntime" 2>/dev/null; then
        missing_packages+=("onnxruntime")
    fi

    if [ ${#missing_packages[@]} -gt 0 ]; then
        log_warning "Missing Python packages: ${missing_packages[*]}"
        log_info "Installing missing packages..."
        pip3 install --user "${missing_packages[@]}"
    fi

    log_success "All dependencies available"
}

# ============================================================================
# Download and convert model
# ============================================================================

download_model() {
    log_info "Downloading ${MODEL_NAME} from Hugging Face..."

    mkdir -p "${MODELS_DIR}"

    # Check if ONNX model already exists
    if [ -f "${MODEL_ONNX_DIR}/model.onnx" ]; then
        log_warning "ONNX model already exists at ${MODEL_ONNX_DIR}"
        read -p "Do you want to re-download? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping ONNX download"
            return 0
        fi
        rm -rf "${MODEL_ONNX_DIR}"
    fi

    # Export to ONNX using optimum
    python3 << EOF
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer

MODEL_ID = "sentence-transformers/${MODEL_NAME}"
ONNX_DIR = "${MODEL_ONNX_DIR}"

print(f"Exporting {MODEL_ID} to ONNX...")

# Load and export model
model = ORTModelForFeatureExtraction.from_pretrained(MODEL_ID, export=True)
model.save_pretrained(ONNX_DIR)

# Save tokenizer
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
tokenizer.save_pretrained(ONNX_DIR)

print(f"Model exported to {ONNX_DIR}")
EOF

    if [ $? -eq 0 ]; then
        log_success "ONNX model downloaded to ${MODEL_ONNX_DIR}"
    else
        log_error "Failed to download ONNX model"
        exit 1
    fi
}

# ============================================================================
# Quantize to INT8
# ============================================================================

quantize_model() {
    log_info "Quantizing model to INT8..."

    # Check if INT8 model already exists
    if [ -f "${MODEL_INT8_DIR}/model_quantized.onnx" ]; then
        log_warning "INT8 model already exists at ${MODEL_INT8_DIR}"
        read -p "Do you want to re-quantize? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping INT8 quantization"
            return 0
        fi
        rm -rf "${MODEL_INT8_DIR}"
    fi

    # Check if ONNX model exists
    if [ ! -f "${MODEL_ONNX_DIR}/model.onnx" ]; then
        log_error "ONNX model not found. Run download first."
        exit 1
    fi

    # Quantize using optimum
    python3 << EOF
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
import shutil

ONNX_DIR = "${MODEL_ONNX_DIR}"
INT8_DIR = "${MODEL_INT8_DIR}"

print(f"Quantizing {ONNX_DIR} to INT8...")

# Configure quantization (dynamic quantization for best compatibility)
qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False)

# Create quantizer and quantize
quantizer = ORTQuantizer.from_pretrained(ONNX_DIR)
quantizer.quantize(save_dir=INT8_DIR, quantization_config=qconfig)

# Copy tokenizer files
for file in ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt']:
    src = f"{ONNX_DIR}/{file}"
    dst = f"{INT8_DIR}/{file}"
    try:
        shutil.copy(src, dst)
        print(f"Copied {file}")
    except FileNotFoundError:
        pass

print(f"INT8 model saved to {INT8_DIR}")
EOF

    if [ $? -eq 0 ]; then
        log_success "INT8 model saved to ${MODEL_INT8_DIR}"
    else
        log_error "Failed to quantize model"
        exit 1
    fi
}

# ============================================================================
# Verify model
# ============================================================================

verify_model() {
    log_info "Verifying INT8 model..."

    python3 << EOF
import onnxruntime as ort
import numpy as np
from transformers import AutoTokenizer
import time

INT8_DIR = "${MODEL_INT8_DIR}"

print(f"Loading model from {INT8_DIR}...")

# Load tokenizer
tokenizer = AutoTokenizer.from_pretrained(INT8_DIR)

# Load ONNX model
model_path = f"{INT8_DIR}/model_quantized.onnx"
session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

# Test inference
test_text = "This is a test sentence for embedding generation."
inputs = tokenizer(test_text, return_tensors="np", padding=True, truncation=True, max_length=512)

# Run inference
start = time.time()
outputs = session.run(None, {
    'input_ids': inputs['input_ids'],
    'attention_mask': inputs['attention_mask']
})
elapsed = (time.time() - start) * 1000

# Mean pooling
embeddings = outputs[0]
attention_mask = inputs['attention_mask']
mask_expanded = np.expand_dims(attention_mask, -1).astype(np.float32)
sum_embeddings = np.sum(embeddings * mask_expanded, axis=1)
sum_mask = np.clip(mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
embedding = (sum_embeddings / sum_mask)[0]

print(f"✓ Model loaded successfully")
print(f"✓ Embedding dimension: {len(embedding)}")
print(f"✓ Inference time: {elapsed:.2f}ms")
print(f"✓ Embedding sample: [{embedding[0]:.4f}, {embedding[1]:.4f}, ..., {embedding[-1]:.4f}]")

# Validate dimension
assert len(embedding) == 384, f"Expected 384 dimensions, got {len(embedding)}"
print(f"✓ Dimension validation passed (384)")
EOF

    if [ $? -eq 0 ]; then
        log_success "Model verification passed"
    else
        log_error "Model verification failed"
        exit 1
    fi
}

# ============================================================================
# Print model info
# ============================================================================

print_model_info() {
    echo ""
    echo "============================================"
    echo "Model Information"
    echo "============================================"
    echo "Model: sentence-transformers/${MODEL_NAME}"
    echo "Format: ONNX INT8 (dynamic quantization)"
    echo "Dimensions: 384"
    echo ""
    echo "Directories:"
    echo "  ONNX (FP32): ${MODEL_ONNX_DIR}"
    echo "  INT8:        ${MODEL_INT8_DIR}"
    echo ""

    if [ -d "${MODEL_INT8_DIR}" ]; then
        local size=$(du -sh "${MODEL_INT8_DIR}" | cut -f1)
        echo "INT8 Model Size: ${size}"
    fi

    if [ -d "${MODEL_ONNX_DIR}" ]; then
        local size=$(du -sh "${MODEL_ONNX_DIR}" | cut -f1)
        echo "ONNX Model Size: ${size}"
    fi

    echo "============================================"
}

# ============================================================================
# Main
# ============================================================================

main() {
    echo ""
    echo "============================================"
    echo "MiniLM L6 v2 INT8 Model Downloader"
    echo "Semantic Service - Branch B"
    echo "============================================"
    echo ""

    case "${1:-all}" in
        download)
            check_dependencies
            download_model
            ;;
        quantize)
            check_dependencies
            quantize_model
            ;;
        verify)
            verify_model
            ;;
        info)
            print_model_info
            ;;
        all)
            check_dependencies
            download_model
            quantize_model
            verify_model
            print_model_info
            ;;
        *)
            echo "Usage: $0 {download|quantize|verify|info|all}"
            echo ""
            echo "Commands:"
            echo "  download  - Download and export to ONNX"
            echo "  quantize  - Quantize ONNX to INT8"
            echo "  verify    - Verify INT8 model works"
            echo "  info      - Print model information"
            echo "  all       - Run all steps (default)"
            exit 1
            ;;
    esac

    log_success "Done!"
}

main "$@"
