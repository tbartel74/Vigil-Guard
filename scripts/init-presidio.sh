#!/bin/bash
set -euo pipefail

# Presidio PII API Initialization Script
# This script manually initializes the Presidio service
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
echo -e "${BLUE}    Presidio PII API Initialization${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if container is running
if ! docker ps | grep vigil-presidio-pii > /dev/null 2>&1; then
    log_error "Presidio container (vigil-presidio-pii) is not running"
    log_info "Start it with: docker-compose up -d presidio-pii-api"
    exit 1
fi

log_success "Presidio container is running"

# Wait for health check
log_info "Waiting for Presidio to be ready..."
RETRY_COUNT=0
MAX_RETRIES=30
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:5001/health >/dev/null 2>&1; then
        log_success "Presidio is ready"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        sleep 2
    else
        log_error "Presidio failed to respond within 60 seconds"
        echo ""
        log_info "Troubleshooting:"
        log_info "  1. Check container logs: docker logs vigil-presidio-pii"
        log_info "  2. Verify models: ls -lh services/presidio-pii-api/models/"
        log_info "  3. Rebuild image: docker-compose build --no-cache presidio-pii-api"
        exit 1
    fi
done

# Get health status
log_info "Fetching service details..."
HEALTH_JSON=$(curl -s http://localhost:5001/health)

echo ""
echo -e "${GREEN}Service Status:${NC}"
echo "$HEALTH_JSON" | jq '.' 2>/dev/null || echo "$HEALTH_JSON"

# Verify recognizers
RECOGNIZER_COUNT=$(echo "$HEALTH_JSON" | grep -o '"recognizers_loaded":[0-9]*' | grep -o '[0-9]*' || echo "0")
if [ "$RECOGNIZER_COUNT" -ge 4 ]; then
    log_success "Custom Polish recognizers loaded: $RECOGNIZER_COUNT"
else
    log_warning "Only $RECOGNIZER_COUNT recognizers loaded (expected ≥4)"
fi

# Verify spaCy models
if echo "$HEALTH_JSON" | grep -q "spacy_models"; then
    log_success "spaCy models loaded (en, pl)"
else
    log_warning "spaCy models not detected"
fi

# Test detection
log_info "Running detection test..."
TEST_RESULT=$(curl -s -X POST http://localhost:5001/analyze \
    -H "Content-Type: application/json" \
    -d '{"text": "Jan Kowalski, PESEL: 92032100157, email: test@example.com", "language": "pl"}' \
    2>/dev/null || echo '{"error": "API call failed"}')

if echo "$TEST_RESULT" | grep -q "entities"; then
    ENTITY_COUNT=$(echo "$TEST_RESULT" | grep -o '"entity_type"' | wc -l | tr -d ' ')
    log_success "Detection test passed ($ENTITY_COUNT entities found)"
else
    log_warning "Detection test failed or incomplete"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Presidio initialization complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Access Presidio API at: http://localhost:5001"
echo "API documentation: http://localhost:5001/docs"
echo ""
