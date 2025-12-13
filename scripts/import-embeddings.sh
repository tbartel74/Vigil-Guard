#!/bin/bash
#
# Import Semantic Embeddings to ClickHouse (v2.0.0)
# Standalone script for manual recovery (production-ready, idempotent)
#
# Usage:
#   ./scripts/import-embeddings.sh              # Import attack patterns
#   ./scripts/import-embeddings.sh --safe       # Import safe patterns
#   ./scripts/import-embeddings.sh --all        # Import both
#
# This script uses ClickHouse-native JSONEachRow format for atomic bulk import.
# Safe to run multiple times (idempotent via TRUNCATE).
#
# v2.0.0: Uses pattern_embeddings_v2 (E5 model) and semantic_safe_embeddings

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
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# Load environment
if [ ! -f .env ]; then
    log_error ".env file not found. Run ./install.sh first."
    exit 1
fi

source .env

# Configuration v2.0.0
ATTACK_EMBEDDINGS_FILE="services/semantic-service/data/datasets/enterprise_attack_embeddings.jsonl"
SAFE_EMBEDDINGS_FILE="services/semantic-service/data/datasets/safe_embeddings.jsonl"
SECURITY_EDUCATION_FILE="services/semantic-service/data/datasets/security_education_embeddings.jsonl"
CLICKHOUSE_CONTAINER="vigil-clickhouse"
CLICKHOUSE_USER="admin"
CLICKHOUSE_DB="n8n_logs"
MIN_ATTACK_EMBEDDINGS=4500
MIN_SAFE_EMBEDDINGS=1400

# Parse arguments
IMPORT_ATTACK=false
IMPORT_SAFE=false

if [ "$#" -eq 0 ]; then
    IMPORT_ATTACK=true
elif [ "$1" = "--safe" ]; then
    IMPORT_SAFE=true
elif [ "$1" = "--all" ]; then
    IMPORT_ATTACK=true
    IMPORT_SAFE=true
else
    log_error "Unknown argument: $1"
    echo "Usage: $0 [--safe|--all]"
    exit 1
fi

# Verify ClickHouse is running
if ! docker ps | grep -q "$CLICKHOUSE_CONTAINER"; then
    log_error "ClickHouse container not running. Start with: docker-compose up -d clickhouse"
    exit 1
fi

# Function to import embeddings
import_embeddings() {
    local FILE="$1"
    local TABLE="$2"
    local MIN_COUNT="$3"
    local DESC="$4"

    log_info "Importing $DESC to $TABLE..."

    # Verify file exists
    if [ ! -f "$FILE" ]; then
        log_error "File not found: $FILE"
        return 1
    fi

    TOTAL_LINES=$(wc -l < "$FILE" | tr -d ' ')
    log_info "Found $TOTAL_LINES embeddings in JSONL file"

    # Verify table exists
    TABLE_EXISTS=$(docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
        --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
        --database "$CLICKHOUSE_DB" \
        -q "EXISTS TABLE $TABLE" 2>/dev/null | tr -d ' ')

    if [ "$TABLE_EXISTS" != "1" ]; then
        log_error "Table $TABLE does not exist in database $CLICKHOUSE_DB"
        log_error "Run the SQL schema files first"
        return 1
    fi

    log_success "Table $TABLE exists"

    # Truncate existing embeddings for idempotency
    log_info "Truncating existing embeddings (idempotency)..."
    docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
        --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
        --database "$CLICKHOUSE_DB" \
        -q "TRUNCATE TABLE $TABLE" 2>/dev/null

    log_success "Table truncated"

    # Bulk import via JSONEachRow HTTP interface
    log_info "Importing $TOTAL_LINES embeddings via ClickHouse JSONEachRow format..."
    log_info "This may take 10-30 seconds..."

    IMPORT_HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/clickhouse_import_result.txt \
        --user "admin:$CLICKHOUSE_PASSWORD" \
        --data-binary "@$FILE" \
        --max-time 120 \
        "http://localhost:8123/?query=INSERT%20INTO%20${CLICKHOUSE_DB}.${TABLE}%20FORMAT%20JSONEachRow&input_format_skip_unknown_fields=1")

    if [ "$IMPORT_HTTP_CODE" = "200" ]; then
        log_success "JSONEachRow bulk import completed (HTTP 200)"
    else
        log_error "ClickHouse import failed (HTTP $IMPORT_HTTP_CODE)"
        log_error "Response: $(cat /tmp/clickhouse_import_result.txt)"
        rm -f /tmp/clickhouse_import_result.txt
        return 1
    fi
    rm -f /tmp/clickhouse_import_result.txt

    # Verify import count
    IMPORTED_COUNT=$(docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
        --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
        --database "$CLICKHOUSE_DB" \
        -q "SELECT COUNT(*) FROM $TABLE" 2>/dev/null | tr -d ' ')

    if [ "$IMPORTED_COUNT" -ge "$MIN_COUNT" ]; then
        log_success "Imported $IMPORTED_COUNT embeddings (verified: >= $MIN_COUNT)"
    else
        log_warning "Embedding import incomplete: $IMPORTED_COUNT < $MIN_COUNT expected"
    fi

    # Show category distribution
    echo ""
    log_info "Embedding distribution by category:"
    if [ "$TABLE" = "pattern_embeddings_v2" ]; then
        docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
            --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
            --database "$CLICKHOUSE_DB" \
            -q "SELECT category, COUNT(*) as count FROM $TABLE GROUP BY category ORDER BY count DESC LIMIT 10" \
            2>/dev/null
    else
        docker exec "$CLICKHOUSE_CONTAINER" clickhouse-client \
            --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
            --database "$CLICKHOUSE_DB" \
            -q "SELECT subcategory, COUNT(*) as count FROM $TABLE GROUP BY subcategory ORDER BY count DESC LIMIT 10" \
            2>/dev/null
    fi

    log_success "$DESC import completed successfully!"
    echo ""
}

# Import attack patterns
if [ "$IMPORT_ATTACK" = true ]; then
    import_embeddings "$ATTACK_EMBEDDINGS_FILE" "pattern_embeddings_v2" "$MIN_ATTACK_EMBEDDINGS" "Attack patterns (E5)"
fi

# Import safe patterns
if [ "$IMPORT_SAFE" = true ]; then
    # First import main safe patterns
    if [ -f "$SAFE_EMBEDDINGS_FILE" ]; then
        import_embeddings "$SAFE_EMBEDDINGS_FILE" "semantic_safe_embeddings" "$MIN_SAFE_EMBEDDINGS" "Safe patterns (E5)"
    fi

    # Then append security education patterns (don't truncate)
    if [ -f "$SECURITY_EDUCATION_FILE" ]; then
        log_info "Appending security education patterns..."
        SEC_LINES=$(wc -l < "$SECURITY_EDUCATION_FILE" | tr -d ' ')

        IMPORT_HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/clickhouse_import_result.txt \
            --user "admin:$CLICKHOUSE_PASSWORD" \
            --data-binary "@$SECURITY_EDUCATION_FILE" \
            --max-time 120 \
            "http://localhost:8123/?query=INSERT%20INTO%20${CLICKHOUSE_DB}.semantic_safe_embeddings%20FORMAT%20JSONEachRow&input_format_skip_unknown_fields=1")

        if [ "$IMPORT_HTTP_CODE" = "200" ]; then
            log_success "Appended $SEC_LINES security education patterns"
        else
            log_warning "Security education import failed (HTTP $IMPORT_HTTP_CODE)"
        fi
        rm -f /tmp/clickhouse_import_result.txt
    fi
fi

echo ""
log_success "Semantic embeddings import completed!"
log_info "Two-Phase Search service can now use vector similarity search"
