#!/bin/bash

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safe word splitting

# ClickHouse Database Initialization Script
# This script manually initializes the ClickHouse database structure
# Use this if the automatic initialization during install.sh failed

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

# Load ClickHouse credentials from .env (with proper quoting)
CLICKHOUSE_USER="$(grep "^CLICKHOUSE_USER=" .env | cut -d'=' -f2- | head -1)"
CLICKHOUSE_PASSWORD="$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2- | head -1)"
CLICKHOUSE_USER=${CLICKHOUSE_USER:-admin}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-admin123}

# Validate credentials are non-empty (proper quoting prevents injection)
if [[ -z "$CLICKHOUSE_USER" ]]; then
    log_error "CLICKHOUSE_USER is empty in .env"
    exit 1
fi

if [[ -z "$CLICKHOUSE_PASSWORD" ]]; then
    log_error "CLICKHOUSE_PASSWORD is empty in .env"
    exit 1
fi

# Check if ClickHouse container is running
# Note: grep -q with pipefail causes SIGPIPE, use grep > /dev/null instead
if ! docker ps | grep vigil-clickhouse > /dev/null 2>&1; then
    log_error "ClickHouse container (vigil-clickhouse) is not running"
    log_info "Start it with: docker-compose up -d clickhouse"
    exit 1
fi

log_success "ClickHouse container is running"

# Note: Permissions are configured by install.sh during initial setup
# If you encounter permission errors, run install.sh again or check vigil_data/ ownership

# Wait for ClickHouse to be ready
log_info "Waiting for ClickHouse to be ready..."
RETRY_COUNT=0
MAX_RETRIES=30
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -u "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" "http://localhost:8123/ping" >/dev/null 2>&1; then
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
DB_OUTPUT=$(docker exec vigil-clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" \
    --password "$CLICKHOUSE_PASSWORD" \
    -q "CREATE DATABASE IF NOT EXISTS n8n_logs" 2>&1)
DB_STATUS=$?

if [ $DB_STATUS -eq 0 ]; then
    log_success "Database created"
else
    log_error "Failed to create database"
    log_error "ClickHouse error output:"
    echo "$DB_OUTPUT" | sed 's/^/    /' # Indent error output
    echo ""
    log_info "Troubleshooting:"
    log_info "  1. Check container: docker ps | grep clickhouse"
    log_info "  2. Check credentials in .env file"
    log_info "  3. View logs: docker logs vigil-clickhouse"
    exit 1
fi

# Execute table creation script
log_info "Creating tables..."
SQL_OUTPUT=$(cat services/monitoring/sql/01-create-tables.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1)
SQL_STATUS=$?

if [ $SQL_STATUS -eq 0 ]; then
    log_success "Tables created"
else
    log_error "Failed to create tables"
    log_error "SQL execution output:"
    echo "$SQL_OUTPUT" | sed 's/^/    /'
    log_info "Script path: services/monitoring/sql/01-create-tables.sql"
    log_info "Check for syntax errors in the SQL file"
    exit 1
fi

# Execute views creation script
log_info "Creating views..."
VIEWS_OUTPUT=$(cat services/monitoring/sql/02-create-views.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1)
VIEWS_STATUS=$?

if [ $VIEWS_STATUS -eq 0 ]; then
    log_success "Views created"
else
    log_error "Failed to create views"
    log_error "SQL execution output:"
    echo "$VIEWS_OUTPUT" | sed 's/^/    /'
    log_info "Script path: services/monitoring/sql/02-create-views.sql"
    log_info "Check for syntax errors in the SQL file"
    exit 1
fi

# Execute false positive reports schema
log_info "Creating false positive reports table..."
FP_OUTPUT=$(cat services/monitoring/sql/03-false-positives.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1)
FP_STATUS=$?

if [ $FP_STATUS -eq 0 ]; then
    log_success "False positive reports table created"
else
    log_error "Failed to create false positive reports table"
    log_error "SQL execution output:"
    echo "$FP_OUTPUT" | sed 's/^/    /'
    log_info "Script path: services/monitoring/sql/03-false-positives.sql"
    log_info "Check for syntax errors in the SQL file"
    exit 1
fi

# Execute retention config schema
log_info "Creating retention config table..."
RETENTION_OUTPUT=$(cat services/monitoring/sql/05-retention-config.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1)
RETENTION_STATUS=$?

if [ $RETENTION_STATUS -eq 0 ]; then
    log_success "Retention config table created"
else
    log_error "Failed to create retention config table"
    log_error "SQL execution output:"
    echo "$RETENTION_OUTPUT" | sed 's/^/    /'
    log_info "Script path: services/monitoring/sql/05-retention-config.sql"
    log_info "Check for syntax errors in the SQL file"
    exit 1
fi

# Execute v1.7.0 audit columns migration
log_info "Adding v1.7.0 audit columns (PII classification + client identification)..."
AUDIT_OUTPUT=$(cat services/monitoring/sql/06-add-audit-columns-v1.7.0.sql | \
   docker exec -i vigil-clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    --multiquery 2>&1)
AUDIT_STATUS=$?

if [ $AUDIT_STATUS -eq 0 ]; then
    log_success "Audit columns added successfully"
else
    log_error "Failed to add audit columns"
    log_error "SQL execution output:"
    echo "$AUDIT_OUTPUT" | sed 's/^/    /'
    log_info "Script path: services/monitoring/sql/06-add-audit-columns-v1.7.0.sql"
    log_info "Check for syntax errors in the SQL file"
    exit 1
fi

# Verify installation
log_info "Verifying database structure..."
TABLE_COUNT=$(docker exec vigil-clickhouse clickhouse-client \
    --user "$CLICKHOUSE_USER" \
    --password "$CLICKHOUSE_PASSWORD" \
    --database n8n_logs \
    -q "SHOW TABLES" 2>/dev/null | wc -l)

if [ "$TABLE_COUNT" -ge 7 ]; then
    log_success "ClickHouse initialized successfully!"
    echo ""
    echo -e "${GREEN}Tables and views created:${NC}"
    docker exec vigil-clickhouse clickhouse-client \
        --user "$CLICKHOUSE_USER" \
        --password "$CLICKHOUSE_PASSWORD" \
        --database n8n_logs \
        -q "SHOW TABLES" | sed 's/^/  • /'
    echo ""
else
    log_warning "Database created but table count is unexpected: $TABLE_COUNT (expected ≥7)"
    exit 1
fi

echo ""
log_success "Done! ClickHouse is ready to receive logs from n8n."
echo ""
