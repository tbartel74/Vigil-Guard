#!/bin/bash

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safe word splitting

# Vigil Guard - Grafana Initialization Script
# Manually initializes Grafana with datasource and dashboard provisioning

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Vigil Guard - Grafana Initialization${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if running from project root
if [ ! -f "docker-compose.yml" ]; then
    log_error "This script must be run from the project root directory"
    exit 1
fi

# Load passwords from .env
if [ -f .env ]; then
    GRAFANA_PASSWORD=$(grep "^GF_SECURITY_ADMIN_PASSWORD=" .env | cut -d'=' -f2)
    CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
else
    log_error ".env file not found"
    exit 1
fi
GRAFANA_PASSWORD=${GRAFANA_PASSWORD:-admin}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-admin123}

# Check if Grafana container is running
if ! docker ps | grep -q vigil-grafana; then
    log_error "Grafana container is not running"
    log_info "Start it with: docker-compose up -d grafana"
    exit 1
fi

log_success "Grafana container is running"

# Note: Permissions are configured by install.sh during initial setup
# If you encounter permission errors, run install.sh again or check vigil_data/ ownership

# Restart Grafana to ensure latest configuration
log_info "Restarting Grafana container..."
docker-compose restart grafana >/dev/null 2>&1
sleep 5

# Wait for Grafana to be ready
log_info "Waiting for Grafana to be ready..."
RETRY_COUNT=0
MAX_RETRIES=20
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health 2>/dev/null | grep -q "200"; then
        log_success "Grafana is responding"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo -n "."
        sleep 3
    else
        log_error "Grafana health check timed out"
        exit 1
    fi
done
echo ""

# Reset admin password
log_info "Setting admin password..."
RESET_OUTPUT=$(docker exec vigil-grafana grafana cli admin reset-admin-password "$GRAFANA_PASSWORD" 2>&1)
RESET_STATUS=$?

if [ $RESET_STATUS -eq 0 ]; then
    log_success "Admin password set successfully"
else
    # Parse error to determine the cause
    if echo "$RESET_OUTPUT" | grep -qi "container.*not.*running\|cannot.*connect\|no such container"; then
        log_error "Grafana container is not running or accessible"
        log_error "Error output:"
        echo "$RESET_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Troubleshooting:"
        log_info "  1. Check container status: docker ps | grep vigil-grafana"
        log_info "  2. Start Grafana: docker-compose up -d grafana"
        log_info "  3. Check logs: docker logs vigil-grafana"
        exit 1
    elif echo "$RESET_OUTPUT" | grep -qi "command not found\|executable.*not found\|grafana.*cli.*not found"; then
        log_error "grafana-cli command not found in container"
        log_error "Error output:"
        echo "$RESET_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "This may indicate a corrupted Grafana installation"
        log_info "Try: docker-compose pull grafana && docker-compose up -d grafana"
        exit 1
    elif echo "$RESET_OUTPUT" | grep -qi "password.*too short\|password.*invalid\|password.*weak"; then
        log_error "Password does not meet Grafana requirements"
        log_error "Error output:"
        echo "$RESET_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Generate a stronger password and update .env file"
        exit 1
    elif echo "$RESET_OUTPUT" | grep -qi "database.*locked\|database.*busy"; then
        log_warning "Database is locked (Grafana may be starting up)"
        log_info "Waiting 5 seconds and retrying..."
        sleep 5
        RETRY_OUTPUT=$(docker exec vigil-grafana grafana cli admin reset-admin-password "$GRAFANA_PASSWORD" 2>&1)
        if [ $? -eq 0 ]; then
            log_success "Admin password set successfully (retry succeeded)"
        else
            log_error "Failed to set password after retry"
            log_error "Error output:"
            echo "$RETRY_OUTPUT" | sed 's/^/    /'
            exit 1
        fi
    elif echo "$RESET_OUTPUT" | grep -qi "Admin password changed successfully"; then
        # Success message in stderr (Grafana quirk)
        log_success "Admin password set successfully"
    else
        log_warning "Could not set password (may already be correct)"
        log_info "Error details:"
        echo "$RESET_OUTPUT" | sed 's/^/    /'
    fi
fi

# Check datasource provisioning
log_info "Checking ClickHouse datasource..."
sleep 3
DATASOURCE_CHECK=$(curl -s -u admin:"$GRAFANA_PASSWORD" http://localhost:3001/api/datasources/name/ClickHouse 2>/dev/null)

if echo "$DATASOURCE_CHECK" | grep -q '"name":"ClickHouse"'; then
    log_success "ClickHouse datasource is provisioned"

    # Extract datasource details
    DS_ID=$(echo "$DATASOURCE_CHECK" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
    DS_UID=$(echo "$DATASOURCE_CHECK" | grep -o '"uid":"[^"]*"' | head -1 | cut -d'"' -f4)

    log_info "  ID: $DS_ID"
    log_info "  UID: $DS_UID"
    log_info "  URL: http://vigil-clickhouse:8123"

    # Update datasource password with value from .env
    log_info "Updating ClickHouse datasource password..."
    UPDATE_PAYLOAD=$(cat <<EOF
{
  "id": $DS_ID,
  "uid": "$DS_UID",
  "name": "ClickHouse",
  "type": "vertamedia-clickhouse-datasource",
  "access": "proxy",
  "url": "http://vigil-clickhouse:8123",
  "basicAuth": true,
  "basicAuthUser": "admin",
  "jsonData": {
    "defaultDatabase": "n8n_logs",
    "usePOST": false,
    "addCorsHeader": true,
    "useYandexCloudAuthorization": false
  },
  "secureJsonData": {
    "basicAuthPassword": "$CLICKHOUSE_PASSWORD"
  },
  "isDefault": true
}
EOF
)

    UPDATE_RESULT=$(curl -s -X PUT \
        -H "Content-Type: application/json" \
        -u admin:"$GRAFANA_PASSWORD" \
        -d "$UPDATE_PAYLOAD" \
        "http://localhost:3001/api/datasources/$DS_ID" 2>/dev/null)

    if echo "$UPDATE_RESULT" | grep -q '"message":"Datasource updated"'; then
        log_success "ClickHouse password updated successfully"
    else
        log_warning "Failed to update datasource password"
        log_info "Response: $UPDATE_RESULT"
    fi
else
    log_warning "ClickHouse datasource not found"
    log_info "Datasource should be auto-provisioned from:"
    log_info "  services/monitoring/grafana/provisioning/datasources/clickhouse.yml"
    log_info ""
    log_info "If missing, restart Grafana: docker-compose restart grafana"
fi

# Check dashboard provisioning
log_info "Checking Vigil dashboard..."
DASHBOARD_CHECK=$(curl -s -u admin:"$GRAFANA_PASSWORD" 'http://localhost:3001/api/search?type=dash-db' 2>/dev/null)

if echo "$DASHBOARD_CHECK" | grep -q '"title":"Vigil"'; then
    log_success "Vigil dashboard is provisioned"

    # Extract dashboard details
    DASH_UID=$(echo "$DASHBOARD_CHECK" | grep -o '"uid":"[^"]*"' | head -1 | cut -d'"' -f4)
    DASH_URL=$(echo "$DASHBOARD_CHECK" | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4)

    log_info "  UID: $DASH_UID"
    log_info "  URL: http://localhost:3001$DASH_URL"
else
    log_warning "Vigil dashboard not found"
    log_info "Dashboard should be auto-provisioned from:"
    log_info "  services/monitoring/grafana/provisioning/dashboards/vigil-dashboard.json"
    log_info ""
    log_info "If missing, restart Grafana: docker-compose restart grafana"
fi

# Check provisioning configuration
echo ""
log_info "Provisioning files:"
if [ -f "services/monitoring/grafana/provisioning/datasources/clickhouse.yml" ]; then
    log_success "  ✓ datasources/clickhouse.yml"
else
    log_error "  ✗ datasources/clickhouse.yml (missing)"
fi

if [ -f "services/monitoring/grafana/provisioning/dashboards/default.yml" ]; then
    log_success "  ✓ dashboards/default.yml"
else
    log_error "  ✗ dashboards/default.yml (missing)"
fi

if [ -f "services/monitoring/grafana/provisioning/dashboards/vigil-dashboard.json" ]; then
    log_success "  ✓ dashboards/vigil-dashboard.json"
else
    log_error "  ✗ dashboards/vigil-dashboard.json (missing)"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Grafana Initialization Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Access Grafana:"
echo -e "  URL:      ${GREEN}http://localhost:3001${NC}"
echo -e "  Username: ${BLUE}admin${NC}"
echo -e "  Password: ${BLUE}$GRAFANA_PASSWORD${NC}"
echo ""
echo "Dashboard:"
echo -e "  ${GREEN}http://localhost:3001/d/$DASH_UID/vigil${NC}"
echo ""
