#!/bin/bash

# ClickHouse Database Initialization Script
# This script manually initializes the ClickHouse database structure
# Use this if the automatic initialization during install.sh failed

set -e

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

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}    ClickHouse Database Initialization${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    log_error ".env file not found. Please run install.sh first."
    exit 1
fi

# Load ClickHouse credentials from .env
CLICKHOUSE_USER=$(grep "^CLICKHOUSE_USER=" .env | cut -d'=' -f2)
CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
CLICKHOUSE_USER=${CLICKHOUSE_USER:-admin}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-admin123}

# Check if ClickHouse container is running
if ! docker ps | grep -q vigil-clickhouse; then
    log_error "ClickHouse container (vigil-clickhouse) is not running"
    log_info "Start it with: docker-compose up -d clickhouse"
    exit 1
fi

log_success "ClickHouse container is running"

# Fix permissions for ClickHouse volume
log_info "Fixing permissions for ClickHouse volume..."
chmod -R 777 vigil_data/clickhouse 2>/dev/null || true
log_success "Permissions configured"

# Wait for ClickHouse to be ready
log_info "Waiting for ClickHouse to be ready..."
RETRY_COUNT=0
MAX_RETRIES=30
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -u ${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD} "http://localhost:8123/ping" >/dev/null 2>&1; then
        log_success "ClickHouse is responding"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        sleep 2
    else
        log_error "ClickHouse failed to respond within expected time"
        exit 1
    fi
done

# Create database
log_info "Creating n8n_logs database..."
if docker exec vigil-clickhouse clickhouse-client \
    --user $CLICKHOUSE_USER \
    --password "$CLICKHOUSE_PASSWORD" \
    -q "CREATE DATABASE IF NOT EXISTS n8n_logs" 2>&1; then
    log_success "Database created"
else
    log_error "Failed to create database"
    exit 1
fi

# Execute table creation script
log_info "Creating tables..."
if cat services/monitoring/sql/01-create-tables.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user $CLICKHOUSE_USER \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1; then
    log_success "Tables created"
else
    log_error "Failed to create tables"
    exit 1
fi

# Execute views creation script
log_info "Creating views..."
if cat services/monitoring/sql/02-create-views.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user $CLICKHOUSE_USER \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1; then
    log_success "Views created"
else
    log_error "Failed to create views"
    exit 1
fi

# Execute false positive reports schema
log_info "Creating false positive reports table..."
if cat services/monitoring/sql/03-false-positives.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user $CLICKHOUSE_USER \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1; then
    log_success "False positive reports table created"
else
    log_error "Failed to create false positive reports table"
    exit 1
fi

# Verify installation
log_info "Verifying database structure..."
TABLE_COUNT=$(docker exec vigil-clickhouse clickhouse-client \
    --user $CLICKHOUSE_USER \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    -q "SHOW TABLES" 2>/dev/null | wc -l)

if [ "$TABLE_COUNT" -ge 6 ]; then
    log_success "ClickHouse initialized successfully!"
    echo ""
    echo -e "${GREEN}Tables and views created:${NC}"
    docker exec vigil-clickhouse clickhouse-client \
        --user $CLICKHOUSE_USER \
        --password "$CLICKHOUSE_PASSWORD" \
        --database n8n_logs \
        -q "SHOW TABLES" | sed 's/^/  • /'
    echo ""
else
    log_warning "Database created but table count is unexpected: $TABLE_COUNT (expected ≥6)"
    exit 1
fi

echo ""
log_success "Done! ClickHouse is ready to receive logs from n8n."
echo ""
