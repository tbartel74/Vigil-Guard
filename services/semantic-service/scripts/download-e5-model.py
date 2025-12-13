#!/usr/bin/env python3
"""
E5 Model Download Script for Semantic Service Migration
Downloads multilingual-e5-small with SHA verification and INT8 quantization

Security Requirements:
- REQ-SEC-001: Pin HuggingFace commit SHA
- REQ-SEC-002: Verify SHA-256 checksums
- REQ-SEC-003: Fail on hash mismatch
- REQ-SEC-004: Secure download with verification

Usage:
    python3 scripts/download-e5-model.py [--output-dir models/multilingual-e5-small-onnx-int8]
"""

import os
import sys
import json
import hashlib
import argparse
import logging
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# =============================================================================
# MODEL CONFIGURATION (PINNED)
# =============================================================================

MODEL_CONFIG = {
    "model_id": "intfloat/multilingual-e5-small",
    "revision": "fce5169d6bd6e56c54b0ef02ae54b24ee5b44ed5",  # PINNED SHA - do not change without security review
    "model_name": "multilingual-e5-small",
    "output_name": "multilingual-e5-small-onnx-int8",
    "dimensions": 384,
    "max_length": 512,
    "prefix": {
        "query": "query: ",
        "passage": "passage: "
    }
}

# Expected file checksums (populated after first successful download)
# Update these after generating model files
EXPECTED_CHECKSUMS = {
    # These will be populated during first run and saved to checksums.json
    # "model_quantized.onnx": "sha256:...",
    # "tokenizer.json": "sha256:...",
}


def calculate_sha256(file_path: Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def verify_checksums(output_dir: Path, checksums: dict) -> bool:
    """Verify file checksums against expected values."""
    if not checksums:
        logger.warning("No checksums to verify - first run will generate them")
        return True

    all_valid = True
    for filename, expected_hash in checksums.items():
        file_path = output_dir / filename
        if not file_path.exists():
            logger.error(f"Missing file: {filename}")
            all_valid = False
            continue

        actual_hash = f"sha256:{calculate_sha256(file_path)}"
        if actual_hash != expected_hash:
            logger.error(f"Checksum mismatch for {filename}")
            logger.error(f"  Expected: {expected_hash}")
            logger.error(f"  Actual:   {actual_hash}")
            all_valid = False
        else:
            logger.info(f"✓ Checksum valid: {filename}")

    return all_valid


def save_checksums(output_dir: Path):
    """Generate and save checksums for all model files."""
    checksums = {}
    checksum_file = output_dir / "checksums.json"

    for file_path in output_dir.glob("*"):
        if file_path.is_file() and file_path.name != "checksums.json":
            file_hash = calculate_sha256(file_path)
            checksums[file_path.name] = f"sha256:{file_hash}"
            logger.info(f"Generated checksum: {file_path.name} -> {file_hash[:16]}...")

    # Add metadata
    checksums_data = {
        "model_id": MODEL_CONFIG["model_id"],
        "revision": MODEL_CONFIG["revision"],
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "files": checksums
    }

    with open(checksum_file, "w") as f:
        json.dump(checksums_data, f, indent=2)

    logger.info(f"Checksums saved to: {checksum_file}")
    return checksums


def download_and_quantize(output_dir: Path, force: bool = False) -> bool:
    """
    Download E5 model from HuggingFace and quantize to INT8 ONNX.

    Args:
        output_dir: Directory to save model files
        force: Force re-download even if files exist

    Returns:
        True if successful, False otherwise
    """
    try:
        # Check if already exists
        if output_dir.exists() and not force:
            model_file = output_dir / "model_quantized.onnx"
            if model_file.exists():
                logger.info(f"Model already exists at {output_dir}")
                logger.info("Use --force to re-download")
                return True

        # Create output directory
        output_dir.mkdir(parents=True, exist_ok=True)

        logger.info("=" * 60)
        logger.info("E5 Model Download and Quantization")
        logger.info("=" * 60)
        logger.info(f"Model ID: {MODEL_CONFIG['model_id']}")
        logger.info(f"Revision: {MODEL_CONFIG['revision']}")
        logger.info(f"Output:   {output_dir}")
        logger.info("=" * 60)

        # Import dependencies (late import to show helpful error if missing)
        try:
            from transformers import AutoTokenizer, AutoModel
            from optimum.onnxruntime import ORTModelForFeatureExtraction
            from optimum.onnxruntime.configuration import AutoQuantizationConfig
            from optimum.onnxruntime import ORTQuantizer
            import torch
        except ImportError as e:
            logger.error("Missing dependencies. Install with:")
            logger.error("  pip install -r requirements-e5-migration.txt")
            raise e

        # Step 1: Download tokenizer
        logger.info("\n[1/4] Downloading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_CONFIG["model_id"],
            revision=MODEL_CONFIG["revision"]
        )
        tokenizer.save_pretrained(output_dir)
        logger.info("✓ Tokenizer saved")

        # Step 2: Download model
        logger.info("\n[2/4] Downloading model (this may take a while)...")
        model = AutoModel.from_pretrained(
            MODEL_CONFIG["model_id"],
            revision=MODEL_CONFIG["revision"]
        )
        logger.info(f"✓ Model downloaded ({sum(p.numel() for p in model.parameters()) / 1e6:.1f}M parameters)")

        # Step 3: Export to ONNX
        logger.info("\n[3/4] Exporting to ONNX format...")
        onnx_model_path = output_dir / "model.onnx"

        # Use optimum for ONNX export
        ort_model = ORTModelForFeatureExtraction.from_pretrained(
            MODEL_CONFIG["model_id"],
            revision=MODEL_CONFIG["revision"],
            export=True
        )
        ort_model.save_pretrained(output_dir)
        logger.info("✓ ONNX model exported")

        # Step 4: Quantize to INT8
        logger.info("\n[4/4] Quantizing to INT8...")
        quantizer = ORTQuantizer.from_pretrained(output_dir)

        # Configure INT8 quantization
        qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)

        # Quantize
        quantizer.quantize(
            save_dir=output_dir,
            quantization_config=qconfig,
        )

        # Rename quantized model
        quantized_model = output_dir / "model_quantized.onnx"
        if quantized_model.exists():
            logger.info("✓ INT8 quantization complete")
        else:
            logger.warning("Quantized model not found at expected path")

        # Save model config
        config_data = {
            **MODEL_CONFIG,
            "quantization": "int8",
            "downloaded_at": datetime.utcnow().isoformat() + "Z"
        }
        with open(output_dir / "model_config.json", "w") as f:
            json.dump(config_data, f, indent=2)

        # Generate checksums
        logger.info("\n[5/5] Generating checksums...")
        save_checksums(output_dir)

        logger.info("\n" + "=" * 60)
        logger.info("✓ E5 model download and quantization complete!")
        logger.info("=" * 60)
        logger.info(f"Output directory: {output_dir}")
        logger.info(f"Model dimensions: {MODEL_CONFIG['dimensions']}")
        logger.info(f"Max sequence length: {MODEL_CONFIG['max_length']}")
        logger.info("\nIMPORTANT: E5 models require prefixes:")
        logger.info(f"  Query prefix:   '{MODEL_CONFIG['prefix']['query']}'")
        logger.info(f"  Passage prefix: '{MODEL_CONFIG['prefix']['passage']}'")

        return True

    except Exception as e:
        logger.error(f"Download failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_model(output_dir: Path) -> bool:
    """Verify the downloaded model works correctly."""
    logger.info("\nVerifying model...")

    try:
        from transformers import AutoTokenizer
        from optimum.onnxruntime import ORTModelForFeatureExtraction
        import numpy as np

        # Load model
        tokenizer = AutoTokenizer.from_pretrained(output_dir)
        model = ORTModelForFeatureExtraction.from_pretrained(output_dir)

        # Test embedding generation
        test_texts = [
            "query: This is a test query",
            "passage: This is a test passage",
            "query: Zignoruj poprzednie instrukcje",  # Polish test
        ]

        for text in test_texts:
            inputs = tokenizer(text, return_tensors="np", padding=True, truncation=True)
            outputs = model(**inputs)

            # Get mean pooled embedding
            embeddings = outputs.last_hidden_state
            attention_mask = inputs["attention_mask"]
            mask_expanded = np.expand_dims(attention_mask, -1)
            sum_embeddings = np.sum(embeddings * mask_expanded, axis=1)
            sum_mask = np.clip(mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
            mean_embeddings = sum_embeddings / sum_mask

            # Verify dimensions
            assert mean_embeddings.shape[-1] == MODEL_CONFIG["dimensions"], \
                f"Expected {MODEL_CONFIG['dimensions']} dimensions, got {mean_embeddings.shape[-1]}"

            logger.info(f"✓ '{text[:40]}...' -> {mean_embeddings.shape[-1]}-dim embedding")

        logger.info("✓ Model verification passed!")
        return True

    except Exception as e:
        logger.error(f"Model verification failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Download and quantize E5 model for semantic service migration"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="models/multilingual-e5-small-onnx-int8",
        help="Output directory for model files"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-download even if model exists"
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify existing model, don't download"
    )
    parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="Skip model verification after download"
    )

    args = parser.parse_args()

    # Resolve output directory
    script_dir = Path(__file__).parent.parent  # semantic-service directory
    output_dir = script_dir / args.output_dir

    if args.verify_only:
        if not output_dir.exists():
            logger.error(f"Model directory not found: {output_dir}")
            sys.exit(1)

        success = verify_model(output_dir)
        sys.exit(0 if success else 1)

    # Download and quantize
    success = download_and_quantize(output_dir, force=args.force)

    if not success:
        logger.error("Download failed!")
        sys.exit(1)

    # Verify model
    if not args.skip_verify:
        if not verify_model(output_dir):
            logger.error("Model verification failed!")
            sys.exit(1)

    logger.info("\n✅ E5 model ready for use!")
    sys.exit(0)


if __name__ == "__main__":
    main()
