#!/bin/bash

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safe word splitting

# Restart Vigil Guard services

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

show_usage() {
    echo ""
    echo "Usage: $0 [service]"
    echo ""
    echo "Services:"
    echo "  web-ui        - Web UI frontend and backend"
    echo "  n8n           - n8n workflow engine"
    echo "  monitoring    - ClickHouse and Grafana"
    echo "  prompt-guard  - Prompt Guard API"
    echo "  presidio      - Presidio PII API"
    echo "  all           - All services (default)"
    echo ""
}

SERVICE=${1:-all}

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Restarting Vigil Guard Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

restart_service() {
    local name=$1
    local service_name=$2

    echo -e "${YELLOW}Restarting $name...${NC}"
    docker-compose restart "$service_name"
    echo -e "${GREEN}✓${NC} $name restarted"
    echo ""
}

case $SERVICE in
    web-ui)
        restart_service "Web UI Backend" "web-ui-backend"
        restart_service "Web UI Frontend" "web-ui-frontend"
        ;;
    n8n)
        restart_service "n8n" "n8n"
        ;;
    monitoring)
        restart_service "ClickHouse" "clickhouse"
        restart_service "Grafana" "grafana"
        ;;
    prompt-guard)
        restart_service "Prompt Guard API" "prompt-guard-api"
        ;;
    presidio)
        restart_service "Presidio PII API" "presidio-pii-api"
        ;;
    all)
        echo -e "${YELLOW}Restarting all services...${NC}"
        docker-compose restart
        echo -e "${GREEN}✓${NC} All services restarted"
        echo ""
        ;;
    *)
        echo "Unknown service: $SERVICE"
        show_usage
        exit 1
        ;;
esac

echo -e "${GREEN}Services restarted successfully!${NC}"
echo ""
echo "Check status with: ./scripts/status.sh"
echo ""
