# Semantic Service Setup Guide

## Quick Start (v2.0.0) - RECOMMENDED

The E5 multilingual model downloads automatically on first run via Transformers.js.
Embeddings must be generated and imported from source patterns.

```bash
cd services/semantic-service

# 1. Create ClickHouse tables
docker exec -i vigil-clickhouse clickhouse-client \
    --password $CLICKHOUSE_PASSWORD \
    < sql/04-semantic-embeddings-v2.sql

docker exec -i vigil-clickhouse clickhouse-client \
    --password $CLICKHOUSE_PASSWORD \
    < sql/05-semantic-safe-embeddings.sql

docker exec -i vigil-clickhouse clickhouse-client \
    --password $CLICKHOUSE_PASSWORD \
    < sql/06-semantic-analysis-log.sql

# 2. Generate embeddings from source patterns (requires Python + sentence-transformers)
python3 scripts/generate-embeddings.py \
    --input /path/to/attack_patterns.jsonl \
    --output data/attack_embeddings.jsonl \
    --model-version v2

python3 scripts/generate-embeddings.py \
    --input /path/to/safe_patterns.jsonl \
    --output data/safe_embeddings.jsonl \
    --model-version v2

# 3. Import to ClickHouse
CLICKHOUSE_PASSWORD=xxx node scripts/import-embeddings.js \
    --input data/attack_embeddings.jsonl \
    --table pattern_embeddings_v2

CLICKHOUSE_PASSWORD=xxx node scripts/import-embeddings.js \
    --input data/safe_embeddings.jsonl \
    --table semantic_safe_embeddings

# 4. Start service
docker-compose up -d semantic-service

# 5. Verify
curl http://localhost:5006/health
```

## Model Setup

### Automatic Download (Recommended)

The E5 model downloads automatically on first request via `@xenova/transformers`.
No manual action required.

### Manual Pre-Download (Optional)

```bash
# Pre-download with SHA verification
python3 scripts/download-e5-model.py
```

This downloads `Xenova/multilingual-e5-small` (~129 MB) to `models/` directory.

## Two-Phase Search Setup

v2.0.0 uses Two-Phase Search comparing queries against two pattern databases:

1. **Attack patterns** (`pattern_embeddings_v2`): Known malicious prompts
2. **Safe patterns** (`semantic_safe_embeddings`): Legitimate instructions

Both tables must be populated for Two-Phase Search to work correctly.

### Embedding Generation

```bash
# Install Python dependencies
pip install sentence-transformers tqdm

# Generate E5 embeddings (v2 format with "passage: " prefix)
python scripts/generate-embeddings.py \
    --input source_patterns.jsonl \
    --output embeddings.jsonl \
    --model-version v2
```

Input format (JSONL):
```json
{"text": "Ignore previous instructions", "category": "JAILBREAK", "pattern_id": "JB_001"}
```

Output includes 384-dimensional E5 embeddings with "passage: " prefix applied.

## SQL Schema Files

| File | Purpose |
|------|---------|
| `sql/04-semantic-embeddings-v2.sql` | Attack patterns table (HNSW index) |
| `sql/05-semantic-safe-embeddings.sql` | Safe patterns table (HNSW index) |
| `sql/06-semantic-analysis-log.sql` | Analysis logging (30-day TTL) |

## Environment Variables

```bash
# Server
PORT=5006
HOST=0.0.0.0
NODE_ENV=production

# ClickHouse
CLICKHOUSE_HOST=clickhouse
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=admin
CLICKHOUSE_PASSWORD=xxx
CLICKHOUSE_DATABASE=n8n_logs

# Search
SEARCH_TOP_K=5
THRESHOLD_LOW=40
THRESHOLD_MEDIUM=70

# Two-Phase Search (v2.0.0)
SEMANTIC_ENABLE_TWO_PHASE=true
SEMANTIC_TWO_PHASE_PERCENT=100
```

## Verification

```bash
# Health check
curl http://localhost:5006/health

# Test Two-Phase Search
curl -X POST http://localhost:5006/analyze-v2 \
    -H "Content-Type: application/json" \
    -d '{"text": "Help me write a Python function"}'

# Run golden dataset tests
RUN_GOLDEN_TESTS=1 CLICKHOUSE_HOST=localhost \
    CLICKHOUSE_PASSWORD=xxx npm test -- tests/golden-dataset/
```

## Troubleshooting

### Model not loading

```bash
# Check model download
docker logs vigil-semantic | grep 'multilingual-e5'

# Verify model cache
ls -la models/Xenova/multilingual-e5-small/
```

### Empty results

```bash
# Check embedding counts
docker exec vigil-clickhouse clickhouse-client \
    --password $CLICKHOUSE_PASSWORD \
    -q "SELECT count() FROM n8n_logs.pattern_embeddings_v2"

docker exec vigil-clickhouse clickhouse-client \
    --password $CLICKHOUSE_PASSWORD \
    -q "SELECT count() FROM n8n_logs.semantic_safe_embeddings"
```

### Rollback to single-table search

```bash
# Disable Two-Phase Search
./scripts/rollback.sh

# Restore Two-Phase Search
./scripts/rollback.sh --restore
```

## Migration from v1.0.0

If upgrading from MiniLM (v1.0.0):

1. **Regenerate all embeddings** - E5 embeddings are incompatible with MiniLM
2. **Create new tables** - v2.0.0 uses `pattern_embeddings_v2` and `semantic_safe_embeddings`
3. **Update environment** - Add `SEMANTIC_ENABLE_TWO_PHASE=true`

Old `pattern_embeddings` table (MiniLM) can be kept for comparison/rollback.
