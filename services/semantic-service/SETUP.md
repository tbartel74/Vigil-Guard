# Semantic Service Setup Guide

## Quick Start (Production) - RECOMMENDED

The production-ready embeddings are already in `data/embeddings_categorized.jsonl` (32 MB, 3000 patterns, 29 categories). Just import them:

```bash
cd services/semantic-service

# Create tables (if first time)
docker exec -i vigil-clickhouse clickhouse-client \
    --password $CLICKHOUSE_PASSWORD \
    < sql/01-create-tables.sql

# Import to ClickHouse
CLICKHOUSE_PASSWORD=xxx node scripts/import-embeddings.js \
    --input data/embeddings_categorized.jsonl \
    --truncate
```

**This is the recommended method.** The embeddings were categorized by LLM with 29 proper threat categories.

## Full Regeneration (From Scratch)

### Step 1: Download Model

```bash
./scripts/download-model.sh
```

This downloads `all-MiniLM-L6-v2-onnx-int8` (~23 MB) for runtime inference.

### Step 2: Generate Embeddings

Requires Python with sentence-transformers:

```bash
# Install dependencies
pip install sentence-transformers tqdm

# Generate embeddings from source data
python scripts/generate-embeddings.py \
    --input ../../Roadmap/semantic-similarity/malicious_3k.jsonl \
    --output data/embeddings.jsonl
```

This creates `embeddings.jsonl` with 3000 embeddings (~32 MB).

### Step 3: (Optional) Categorize with LLM

The raw embeddings have poor categories (`MODEL_INCORRECT`). For better results,
use an LLM to categorize them:

```bash
# See Roadmap/semantic-similarity/ for categorization prompts
# Output: data/embeddings_categorized.jsonl with proper threat categories
```

### Step 4: Import to ClickHouse

```bash
# Ensure ClickHouse is running
docker-compose up -d clickhouse

# Create tables (if not exists)
docker exec -i vigil-clickhouse clickhouse-client \
    --password $CLICKHOUSE_PASSWORD \
    < sql/01-create-tables.sql

# Import embeddings
CLICKHOUSE_PASSWORD=xxx node scripts/import-embeddings.js \
    --input data/embeddings_categorized.jsonl \
    --truncate
```

### Step 5: Start Service

```bash
docker-compose up -d semantic-service

# Verify
curl http://localhost:5006/health
```

## Data Files

| File | Size | Description |
|------|------|-------------|
| `data/embeddings_categorized.jsonl` | 32 MB | Production embeddings with 29 categories |
| `Roadmap/semantic-similarity/malicious_3k.jsonl` | 7 MB | Source malicious prompts |
| `models/all-MiniLM-L6-v2-onnx-int8/` | 23 MB | INT8 quantized model |

## Category Distribution (3000 embeddings)

```
MILD_SUSPICIOUS          1089 (36.3%)
FORMAT_COERCION           826 (27.5%)
GODMODE_JAILBREAK         228 (7.6%)
CREDENTIAL_HARVESTING     189 (6.3%)
ENCODING_SUSPICIOUS       182 (6.1%)
CRITICAL_INJECTION        108 (3.6%)
NESTED_COMMANDS           103 (3.4%)
... (29 categories total)
```

## API Endpoints

- `GET /health` - Health check
- `POST /analyze` - Analyze text, returns branch_result v2.1
- `GET /stats` - Database statistics

## Environment Variables

```bash
PORT=5006
CLICKHOUSE_HOST=clickhouse
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=admin
CLICKHOUSE_PASSWORD=xxx
CLICKHOUSE_DATABASE=n8n_logs
CLICKHOUSE_TABLE=pattern_embeddings
```
