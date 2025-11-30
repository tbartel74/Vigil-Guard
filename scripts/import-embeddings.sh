#!/bin/bash
#
# Import Semantic Embeddings to ClickHouse
# Standalone script for manual recovery (production-ready, idempotent)
#
# Usage:
#   ./scripts/import-embeddings.sh
#
# This script uses ClickHouse-native JSONEachRow format for atomic bulk import.
# Safe to run multiple times (idempotent via TRUNCATE).

set -euo pipefail
IFS=$'\n\t'

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Load environment
if [ ! -f .env ]; then
    log_error ".env file not found. Run ./install.sh first."
    exit 1
fi

source .env

# Configuration
EMBEDDINGS_FILE="services/semantic-service/data/embeddings_categorized.jsonl"
CLICKHOUSE_CONTAINER="vigil-clickhouse"
CLICKHOUSE_USER="admin"
CLICKHOUSE_DB="n8n_logs"
MIN_EMBEDDINGS=3000

# Verify embeddings file exists
if [ ! -f "$EMBEDDINGS_FILE" ]; then
    log_error "Embeddings file not found: $EMBEDDINGS_FILE"
    exit 1
fi

TOTAL_LINES=$(wc -l < "$EMBEDDINGS_FILE" | tr -d ' ')
log_info "Found $TOTAL_LINES embeddings in JSONL file (3300 expected)"

# Verify ClickHouse is running
if ! docker ps | grep -q "$CLICKHOUSE_CONTAINER"; then
    log_error "ClickHouse container not running. Start with: docker-compose up -d clickhouse"
    exit 1
fi

# Verify table exists
TABLE_EXISTS=$(docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
    --database "$CLICKHOUSE_DB" \
    -q "EXISTS TABLE pattern_embeddings" 2>/dev/null | tr -d ' ')

if [ "$TABLE_EXISTS" != "1" ]; then
    log_error "Table pattern_embeddings does not exist in database $CLICKHOUSE_DB"
    log_error "This table should be created by Docker entrypoint: services/monitoring/clickhouse/docker-entrypoint-initdb.d/02-semantic-embeddings-v2.sql"
    exit 1
fi

log_success "Table pattern_embeddings exists"

# Step 1: Truncate existing embeddings for idempotency
log_info "Truncating existing embeddings (idempotency)..."
docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
    --database "$CLICKHOUSE_DB" \
    -q "TRUNCATE TABLE pattern_embeddings" 2>/dev/null

log_success "Table truncated"

# Step 2: Bulk import via JSONEachRow HTTP interface
log_info "Importing $TOTAL_LINES embeddings via ClickHouse JSONEachRow format..."
log_info "This may take 10-30 seconds..."

IMPORT_HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/clickhouse_import_result.txt \
    --user "admin:$CLICKHOUSE_PASSWORD" \
    --data-binary "@$EMBEDDINGS_FILE" \
    --max-time 120 \
    "http://localhost:8123/?query=INSERT%20INTO%20${CLICKHOUSE_DB}.pattern_embeddings%20FORMAT%20JSONEachRow&input_format_skip_unknown_fields=1")

if [ "$IMPORT_HTTP_CODE" = "200" ]; then
    log_success "JSONEachRow bulk import completed (HTTP 200)"
else
    log_error "ClickHouse import failed (HTTP $IMPORT_HTTP_CODE)"
    log_error "Response: $(cat /tmp/clickhouse_import_result.txt)"
    rm -f /tmp/clickhouse_import_result.txt
    exit 1
fi
rm -f /tmp/clickhouse_import_result.txt

# Step 3: Verify import count
IMPORTED_COUNT=$(docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
    --database "$CLICKHOUSE_DB" \
    -q "SELECT COUNT(*) FROM pattern_embeddings" 2>/dev/null | tr -d ' ')

if [ "$IMPORTED_COUNT" -ge "$MIN_EMBEDDINGS" ]; then
    log_success "Imported $IMPORTED_COUNT embeddings (verified: >= $MIN_EMBEDDINGS)"
else
    log_error "Embedding import incomplete: $IMPORTED_COUNT < $MIN_EMBEDDINGS required"
    exit 1
fi

# Step 4: Verify HNSW index
log_info "Verifying HNSW vector similarity index..."
INDEX_EXISTS=$(docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
    --database "$CLICKHOUSE_DB" \
    -q "SELECT COUNT(*) FROM system.data_skipping_indices WHERE table = 'pattern_embeddings' AND name = 'embedding_idx'" \
    2>/dev/null | tr -d ' ')

if [ "$INDEX_EXISTS" = "1" ]; then
    log_success "HNSW index ready (usearch cosine similarity)"
else
    log_error "HNSW index not found - semantic search may be slow"
fi

# Step 5: Show category distribution
echo ""
log_info "Embedding distribution by category:"
docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
    --database "$CLICKHOUSE_DB" \
    -q "SELECT category, COUNT(*) as count FROM pattern_embeddings GROUP BY category ORDER BY count DESC LIMIT 10" \
    2>/dev/null

echo ""
log_success "Semantic embeddings import completed successfully!"
log_info "Semantic detection service can now use vector similarity search"
