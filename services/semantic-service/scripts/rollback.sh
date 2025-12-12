#!/bin/bash
#
# Rollback Script for Semantic Service
# Phase 4: Emergency rollback from Two-Phase Search v2.0
#
# Usage:
#   ./scripts/rollback.sh              # Rollback to single-table search
#   ./scripts/rollback.sh --status     # Check current status
#   ./scripts/rollback.sh --restore    # Restore Two-Phase Search
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$SERVICE_DIR")")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_status() {
    echo "============================================================"
    echo "SEMANTIC SERVICE STATUS"
    echo "============================================================"
    echo ""

    # Check environment variables
    echo "Environment Configuration:"
    echo "  SEMANTIC_ENABLE_TWO_PHASE: ${SEMANTIC_ENABLE_TWO_PHASE:-true (default)}"
    echo "  SEMANTIC_TWO_PHASE_PERCENT: ${SEMANTIC_TWO_PHASE_PERCENT:-100 (default)}"
    echo "  SEMANTIC_AB_TEST_ENABLED: ${SEMANTIC_AB_TEST_ENABLED:-false (default)}"
    echo ""

    # Check if service is running
    if docker ps --format '{{.Names}}' | grep -q "semantic-service"; then
        log_info "Service is running"

        # Get health status
        HEALTH=$(curl -s http://localhost:5006/health 2>/dev/null || echo '{"status":"unreachable"}')
        echo "  Health: $HEALTH"
    else
        log_warn "Service is not running"
    fi

    echo ""
}

rollback_to_single_table() {
    echo "============================================================"
    echo "ROLLBACK: Disabling Two-Phase Search v2.0"
    echo "============================================================"
    echo ""

    log_warn "This will disable Two-Phase Search and use single-table search only"
    echo ""

    # Set environment variables
    export SEMANTIC_ENABLE_TWO_PHASE=false
    export SEMANTIC_TWO_PHASE_PERCENT=0

    log_info "Setting SEMANTIC_ENABLE_TWO_PHASE=false"
    log_info "Setting SEMANTIC_TWO_PHASE_PERCENT=0"

    # Check if docker-compose is available
    if command -v docker-compose &> /dev/null; then
        log_info "Restarting semantic-service via docker-compose..."
        cd "$PROJECT_ROOT"
        docker-compose restart semantic-service || {
            log_error "Failed to restart service"
            exit 1
        }
    elif command -v docker &> /dev/null; then
        log_info "Restarting semantic-service container..."
        docker restart vigil-semantic-service || {
            log_error "Failed to restart container"
            exit 1
        }
    else
        log_error "Neither docker-compose nor docker found"
        exit 1
    fi

    # Wait for service to be healthy
    log_info "Waiting for service to be healthy..."
    sleep 5

    for i in {1..10}; do
        HEALTH=$(curl -s http://localhost:5006/health 2>/dev/null || echo '{"status":"starting"}')
        if echo "$HEALTH" | grep -q '"status":"healthy"'; then
            log_info "Service is healthy"
            break
        fi
        echo "  Attempt $i/10: $HEALTH"
        sleep 2
    done

    echo ""
    log_info "Rollback complete!"
    echo ""
    echo "To verify:"
    echo "  curl http://localhost:5006/health"
    echo ""
    echo "To restore Two-Phase Search:"
    echo "  ./scripts/rollback.sh --restore"
    echo ""
}

restore_two_phase() {
    echo "============================================================"
    echo "RESTORE: Enabling Two-Phase Search v2.0"
    echo "============================================================"
    echo ""

    # Set environment variables
    export SEMANTIC_ENABLE_TWO_PHASE=true
    export SEMANTIC_TWO_PHASE_PERCENT=100

    log_info "Setting SEMANTIC_ENABLE_TWO_PHASE=true"
    log_info "Setting SEMANTIC_TWO_PHASE_PERCENT=100"

    # Restart service
    if command -v docker-compose &> /dev/null; then
        log_info "Restarting semantic-service via docker-compose..."
        cd "$PROJECT_ROOT"
        docker-compose restart semantic-service || {
            log_error "Failed to restart service"
            exit 1
        }
    elif command -v docker &> /dev/null; then
        log_info "Restarting semantic-service container..."
        docker restart vigil-semantic-service || {
            log_error "Failed to restart container"
            exit 1
        }
    else
        log_error "Neither docker-compose nor docker found"
        exit 1
    fi

    # Wait for service to be healthy
    log_info "Waiting for service to be healthy..."
    sleep 5

    for i in {1..10}; do
        HEALTH=$(curl -s http://localhost:5006/health 2>/dev/null || echo '{"status":"starting"}')
        if echo "$HEALTH" | grep -q '"status":"healthy"'; then
            log_info "Service is healthy"
            break
        fi
        echo "  Attempt $i/10: $HEALTH"
        sleep 2
    done

    echo ""
    log_info "Two-Phase Search v2.0 restored!"
    echo ""
}

# Main
case "${1:-}" in
    --status)
        show_status
        ;;
    --restore)
        restore_two_phase
        ;;
    --help|-h)
        echo "Semantic Service Rollback Script"
        echo ""
        echo "Usage:"
        echo "  $0              Rollback to single-table search (disable Two-Phase)"
        echo "  $0 --status     Show current service status"
        echo "  $0 --restore    Restore Two-Phase Search v2.0"
        echo "  $0 --help       Show this help message"
        echo ""
        ;;
    *)
        rollback_to_single_table
        ;;
esac
