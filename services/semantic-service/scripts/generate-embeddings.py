#!/usr/bin/env python3
"""
Generate Embeddings for Semantic Service
Uses sentence-transformers to generate 384-dim embeddings from malicious prompts

Usage:
    python generate-embeddings.py
    python generate-embeddings.py --input /path/to/malicious.jsonl --output /path/to/embeddings.jsonl

Requirements:
    pip install sentence-transformers tqdm

Input format (JSONL):
    {"prompt": "...", "source_index": 123, ...}

Output format (JSONL):
    {"pattern_id": "CATEGORY_00001_abc12345", "category": "CATEGORY", "pattern_text": "...",
     "embedding": [...384 floats...], "source_index": 123}
"""

import argparse
import json
import hashlib
from pathlib import Path
from tqdm import tqdm

# Paths
SCRIPT_DIR = Path(__file__).parent
SERVICE_DIR = SCRIPT_DIR.parent
DATA_DIR = SERVICE_DIR / "data"
ROADMAP_DIR = SERVICE_DIR.parent.parent / "Roadmap" / "semantic-similarity"

DEFAULT_INPUT = ROADMAP_DIR / "malicious_3k.jsonl"
DEFAULT_OUTPUT = DATA_DIR / "embeddings.jsonl"


def generate_pattern_id(category: str, index: int, text: str) -> str:
    """Generate unique pattern ID."""
    text_hash = hashlib.md5(text.encode()).hexdigest()[:8]
    return f"{category}_{index:05d}_{text_hash}"


def load_model():
    """Load sentence-transformers model."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("ERROR: sentence-transformers not installed")
        print("Run: pip install sentence-transformers tqdm")
        exit(1)

    print("Loading model: all-MiniLM-L6-v2...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    print(f"Model loaded. Embedding dimension: {model.get_sentence_embedding_dimension()}")
    return model


def main():
    parser = argparse.ArgumentParser(description='Generate embeddings for semantic search')
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT,
                        help=f'Input JSONL file with malicious prompts (default: {DEFAULT_INPUT})')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT,
                        help=f'Output JSONL file with embeddings (default: {DEFAULT_OUTPUT})')
    parser.add_argument('--batch-size', type=int, default=32,
                        help='Batch size for embedding generation (default: 32)')
    parser.add_argument('--category', type=str, default='UNCATEGORIZED',
                        help='Default category for prompts without category field')
    args = parser.parse_args()

    print("=" * 60)
    print("Generate Embeddings for Semantic Service")
    print("=" * 60)
    print(f"Input:  {args.input}")
    print(f"Output: {args.output}")
    print(f"Batch:  {args.batch_size}")
    print("=" * 60)

    # Check input file
    if not args.input.exists():
        print(f"ERROR: Input file not found: {args.input}")
        exit(1)

    # Load model
    model = load_model()

    # Load prompts
    print(f"\nLoading prompts from {args.input}...")
    prompts = []
    with open(args.input, 'r', encoding='utf-8') as f:
        for line in f:
            data = json.loads(line.strip())
            prompts.append(data)
    print(f"Loaded {len(prompts)} prompts")

    # Generate embeddings in batches
    print(f"\nGenerating embeddings (batch size: {args.batch_size})...")

    # Ensure output directory exists
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with open(args.output, 'w', encoding='utf-8') as out_f:
        for i in tqdm(range(0, len(prompts), args.batch_size), desc="Batches"):
            batch = prompts[i:i + args.batch_size]

            # Extract text for embedding
            texts = [p.get('prompt', p.get('text', '')) for p in batch]

            # Generate embeddings
            embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)

            # Write results
            for j, (prompt_data, embedding) in enumerate(zip(batch, embeddings)):
                idx = i + j
                text = prompt_data.get('prompt', prompt_data.get('text', ''))
                category = prompt_data.get('category', prompt_data.get('reason', args.category)).upper()
                source_index = prompt_data.get('source_index', idx)

                record = {
                    'pattern_id': generate_pattern_id(category, idx, text),
                    'category': category,
                    'pattern_text': text,
                    'embedding': embedding.tolist(),
                    'source_index': source_index,
                    'embedding_model': 'all-MiniLM-L6-v2'
                }

                out_f.write(json.dumps(record, ensure_ascii=False) + '\n')

    print(f"\nDone! Written {len(prompts)} embeddings to {args.output}")
    print("\nNext steps:")
    print("1. Optionally categorize with LLM (see Roadmap/semantic-similarity/)")
    print("2. Import to ClickHouse:")
    print(f"   node scripts/import-embeddings.js --input {args.output}")


if __name__ == '__main__':
    main()
