#!/usr/bin/env python3
"""
Generate Embeddings for Semantic Service
Supports both V1 (MiniLM) and V2 (E5) models

PRD Reference: VG-SEM-PRD-001 v1.1.1
Migration: all-MiniLM-L6-v2 → multilingual-e5-small

Usage:
    # V1 (legacy - MiniLM)
    python generate-embeddings.py --model v1 --input data/patterns.jsonl

    # V2 (E5 - multilingual)
    python generate-embeddings.py --model v2 --input data/enterprise_patterns.jsonl

Requirements:
    pip install sentence-transformers tqdm

IMPORTANT: E5 model requires 'passage: ' prefix for database patterns!
This script automatically applies the prefix for V2 embeddings.

Input format (JSONL):
    {"prompt": "...", "category": "CATEGORY", "source_index": 123}

Output format (JSONL):
    {"pattern_id": "CATEGORY_00001_abc12345", "category": "CATEGORY", "pattern_text": "...",
     "embedding": [...384 floats...], "source_index": 123, "embedding_model": "...",
     "prefix_type": "passage"}
"""

import argparse
import json
import hashlib
from pathlib import Path
from datetime import datetime
from tqdm import tqdm

# =============================================================================
# Model Configuration
# =============================================================================

MODEL_CONFIG = {
    'v1': {
        'id': 'all-MiniLM-L6-v2',
        'name': 'all-MiniLM-L6-v2',
        'dimension': 384,
        'prefix': None,  # No prefix for MiniLM
    },
    'v2': {
        'id': 'intfloat/multilingual-e5-small',
        'name': 'multilingual-e5-small-int8',
        'dimension': 384,
        'revision': 'fce5169d6bd6e56c54b0ef02ae54b24ee5b44ed5',  # PINNED SHA (REQ-SEC-001)
        'prefix': {
            'query': 'query: ',      # For user input (runtime)
            'passage': 'passage: '   # For database patterns (this script)
        }
    }
}

# Paths
SCRIPT_DIR = Path(__file__).parent
SERVICE_DIR = SCRIPT_DIR.parent
DATA_DIR = SERVICE_DIR / "data"

# Default paths
DEFAULT_INPUT_V1 = DATA_DIR / "patterns.jsonl"
DEFAULT_INPUT_V2 = DATA_DIR / "enterprise_patterns.jsonl"
DEFAULT_OUTPUT_V1 = DATA_DIR / "embeddings.jsonl"
DEFAULT_OUTPUT_V2 = DATA_DIR / "embeddings_v2.jsonl"


def generate_pattern_id(category: str, index: int, text: str) -> str:
    """Generate unique pattern ID."""
    text_hash = hashlib.md5(text.encode()).hexdigest()[:8]
    return f"{category}_{index:05d}_{text_hash}"


def load_model(model_version: str):
    """Load sentence-transformers model."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("ERROR: sentence-transformers not installed")
        print("Run: pip install sentence-transformers tqdm")
        exit(1)

    config = MODEL_CONFIG[model_version]
    model_id = config['id']

    print(f"Loading model: {model_id}...")

    # For V2, we could add revision pinning here if sentence-transformers supports it
    model = SentenceTransformer(model_id)

    actual_dim = model.get_sentence_embedding_dimension()
    expected_dim = config['dimension']

    if actual_dim != expected_dim:
        print(f"WARNING: Expected {expected_dim} dimensions, got {actual_dim}")

    print(f"Model loaded. Embedding dimension: {actual_dim}")

    if config.get('prefix'):
        print(f"E5 prefix mode enabled - using 'passage: ' prefix for all patterns")

    return model, config


def apply_prefix(text: str, config: dict, prefix_type: str = 'passage') -> str:
    """Apply E5 prefix if required by model."""
    prefix_config = config.get('prefix')
    if prefix_config is None:
        return text

    prefix = prefix_config.get(prefix_type, '')
    return prefix + text


def main():
    parser = argparse.ArgumentParser(
        description='Generate embeddings for semantic search (V1/V2 models)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate V1 embeddings (MiniLM - legacy)
  python generate-embeddings.py --model v1 --input data/patterns.jsonl

  # Generate V2 embeddings (E5 - multilingual)
  python generate-embeddings.py --model v2 --input data/enterprise_patterns.jsonl

  # V2 with custom output
  python generate-embeddings.py --model v2 \\
      --input data/enterprise_patterns.jsonl \\
      --output data/embeddings_v2_custom.jsonl

IMPORTANT: V2 (E5) automatically applies 'passage: ' prefix to all patterns.
This is required for correct semantic similarity with E5 models.
        """
    )

    parser.add_argument('--model', type=str, choices=['v1', 'v2'], default='v2',
                        help='Model version: v1 (MiniLM) or v2 (E5 multilingual). Default: v2')
    parser.add_argument('--input', type=Path, default=None,
                        help='Input JSONL file with prompts (auto-detected based on model)')
    parser.add_argument('--output', type=Path, default=None,
                        help='Output JSONL file with embeddings (auto-detected based on model)')
    parser.add_argument('--batch-size', type=int, default=32,
                        help='Batch size for embedding generation (default: 32)')
    parser.add_argument('--category', type=str, default='UNCATEGORIZED',
                        help='Default category for prompts without category field')
    parser.add_argument('--source-dataset', type=str, default=None,
                        help='Dataset name for provenance tracking (auto-detected from input filename)')

    args = parser.parse_args()

    # Auto-detect paths based on model version
    if args.input is None:
        args.input = DEFAULT_INPUT_V2 if args.model == 'v2' else DEFAULT_INPUT_V1
    if args.output is None:
        args.output = DEFAULT_OUTPUT_V2 if args.model == 'v2' else DEFAULT_OUTPUT_V1
    if args.source_dataset is None:
        args.source_dataset = args.input.stem  # filename without extension

    print("=" * 70)
    print(f"Generate Embeddings for Semantic Service - Model {args.model.upper()}")
    print("=" * 70)
    print(f"Model:   {MODEL_CONFIG[args.model]['id']}")
    print(f"Input:   {args.input}")
    print(f"Output:  {args.output}")
    print(f"Batch:   {args.batch_size}")
    print(f"Dataset: {args.source_dataset}")

    if args.model == 'v2':
        print(f"Prefix:  'passage: ' (E5 requirement)")

    print("=" * 70)

    # Check input file
    if not args.input.exists():
        print(f"ERROR: Input file not found: {args.input}")
        print(f"\nFor V2, expected file: {DEFAULT_INPUT_V2}")
        print("Copy enterprise dataset:")
        print(f"  cp /path/to/enterprise_prompt_dataset_small_reclassified.jsonl {DEFAULT_INPUT_V2}")
        exit(1)

    # Load model
    model, model_config = load_model(args.model)

    # Load prompts
    print(f"\nLoading prompts from {args.input}...")
    prompts = []
    with open(args.input, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                prompts.append(data)
            except json.JSONDecodeError as e:
                print(f"WARNING: Skipping invalid JSON at line {line_num}: {e}")

    print(f"Loaded {len(prompts)} prompts")

    if len(prompts) == 0:
        print("ERROR: No prompts loaded!")
        exit(1)

    # Generate embeddings in batches
    print(f"\nGenerating embeddings (batch size: {args.batch_size})...")

    # Ensure output directory exists
    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Statistics
    stats = {
        'total': len(prompts),
        'processed': 0,
        'categories': {}
    }

    with open(args.output, 'w', encoding='utf-8') as out_f:
        for i in tqdm(range(0, len(prompts), args.batch_size), desc="Batches"):
            batch = prompts[i:i + args.batch_size]

            # Extract text and apply prefix if needed
            texts = []
            for p in batch:
                text = p.get('prompt', p.get('text', ''))
                # Apply E5 prefix for V2 model
                prefixed_text = apply_prefix(text, model_config, 'passage')
                texts.append(prefixed_text)

            # Generate embeddings
            embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)

            # Write results
            for j, (prompt_data, embedding) in enumerate(zip(batch, embeddings)):
                idx = i + j
                text = prompt_data.get('prompt', prompt_data.get('text', ''))
                category = prompt_data.get('category', prompt_data.get('reason', args.category)).upper()
                source_index = prompt_data.get('source_index', idx)

                # Track category stats
                stats['categories'][category] = stats['categories'].get(category, 0) + 1

                record = {
                    'pattern_id': generate_pattern_id(category, idx, text),
                    'category': category,
                    'pattern_text': text,
                    'embedding': embedding.tolist(),
                    'source_index': source_index,
                    'embedding_model': model_config['name'],
                    'source_dataset': args.source_dataset
                }

                # Add E5-specific metadata
                if args.model == 'v2':
                    record['prefix_type'] = 'passage'
                    record['model_revision'] = model_config.get('revision', '')

                # Preserve additional fields from input (for SAFE patterns)
                for field in ['subcategory', 'source', 'language']:
                    if field in prompt_data:
                        record[field] = prompt_data[field]

                out_f.write(json.dumps(record, ensure_ascii=False) + '\n')
                stats['processed'] += 1

    # Print summary
    print("\n" + "=" * 70)
    print("GENERATION COMPLETE")
    print("=" * 70)
    print(f"Total processed:  {stats['processed']}")
    print(f"Output file:      {args.output}")
    print(f"Embedding model:  {model_config['name']}")
    print(f"Dimensions:       {model_config['dimension']}")

    print(f"\nCategory distribution (top 10):")
    sorted_cats = sorted(stats['categories'].items(), key=lambda x: -x[1])[:10]
    for cat, count in sorted_cats:
        print(f"  {cat}: {count}")

    if len(stats['categories']) > 10:
        print(f"  ... and {len(stats['categories']) - 10} more categories")

    print("\n" + "=" * 70)
    print("NEXT STEPS")
    print("=" * 70)

    if args.model == 'v2':
        print("1. Verify embedding count:")
        print(f"   wc -l {args.output}")
        print(f"\n2. Create shadow table (if not exists):")
        print(f"   clickhouse-client < sql/04-semantic-embeddings-v2.sql")
        print(f"\n3. Import to ClickHouse V2 table:")
        print(f"   node scripts/import-embeddings.js --input {args.output} --table pattern_embeddings_v2")
    else:
        print("1. Import to ClickHouse:")
        print(f"   node scripts/import-embeddings.js --input {args.output}")


if __name__ == '__main__':
    main()
