#!/usr/bin/env python3
"""Sample 100 prompts from the Hackaprompt dataset into a JSON file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

DEFAULT_SAMPLE_SIZE = 100
DEFAULT_SEED = 42


def default_dataset_path() -> Path:
    """Return the default path to hackaprompt.parquet living next to this repo."""
    repo_root = Path(__file__).resolve().parents[1]
    return repo_root.parent / "Vigil-Dataset" / "hackaprompt-dataset" / "hackaprompt.parquet"


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]

    parser = argparse.ArgumentParser(description="Build a JSON sample from the Hackaprompt dataset.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=default_dataset_path(),
        help="Path to hackaprompt.parquet (defaults to ../Vigil-Dataset/hackaprompt-dataset/hackaprompt.parquet).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=repo_root / "hackaprompt_sample.json",
        help="Where to write the JSON sample (defaults to repo root).",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=DEFAULT_SAMPLE_SIZE,
        help="How many rows to sample (capped at dataset length).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_SEED,
        help="Random seed for reproducible sampling.",
    )
    return parser.parse_args()


def load_dataset(dataset_path: Path) -> pd.DataFrame:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")
    return pd.read_parquet(dataset_path)


def sample_rows(df: pd.DataFrame, sample_size: int, seed: int) -> pd.DataFrame:
    if sample_size <= 0:
        raise ValueError("sample_size must be positive")
    actual_size = min(sample_size, len(df))
    return df.sample(n=actual_size, random_state=seed)


def save_json(rows: pd.DataFrame, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records = rows.to_dict(orient="records")
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def main() -> None:
    args = parse_args()
    df = load_dataset(args.dataset)
    sample = sample_rows(df, args.sample_size, args.seed)
    save_json(sample, args.output)
    print(f"Wrote {len(sample)} rows to {args.output}")


if __name__ == "__main__":
    main()
