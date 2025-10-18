#!/bin/bash

# View logs for Vigil Guard services

# Colors
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

show_usage() {
    echo ""
    echo "Usage: $0 [service] [options]"
    echo ""
    echo "Services:"
    echo "  web-ui        - Web UI frontend and backend"
    echo "  n8n           - n8n workflow engine"
    echo "  monitoring    - ClickHouse and Grafana"
    echo "  prompt-guard  - Prompt Guard API"
    echo "  all           - All services (default)"
    echo ""
    echo "Options:"
    echo "  -f, --follow     Follow log output"
    echo "  -n, --lines NUM  Number of lines to show (default: 100)"
    echo ""
    echo "Examples:"
    echo "  $0 web-ui --follow"
    echo "  $0 n8n -n 50"
    echo "  $0 monitoring"
    echo ""
}

SERVICE=${1:-all}
FOLLOW=""
LINES=100

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW="-f"
            shift
            ;;
        -n|--lines)
            # Strict validation: must be positive integer, max 10000
            if ! [[ "$2" =~ ^[0-9]+$ ]]; then
                echo -e "${RED}ERROR: --lines must be a positive integer${NC}"
                show_usage
                exit 1
            fi
            if [ "$2" -gt 10000 ]; then
                echo -e "${RED}ERROR: --lines maximum is 10000${NC}"
                exit 1
            fi
            LINES="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        web-ui|n8n|monitoring|prompt-guard|all)
            SERVICE=$1
            shift
            ;;
        *)
            shift
            ;;
    esac
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Vigil Guard - Service Logs${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

case $SERVICE in
    web-ui)
        echo -e "${YELLOW}Web UI Services Logs:${NC}"
        docker-compose logs "$FOLLOW" --tail="$LINES" web-ui-backend web-ui-frontend
        ;;
    n8n)
        echo -e "${YELLOW}n8n Logs:${NC}"
        docker-compose logs "$FOLLOW" --tail="$LINES" n8n
        ;;
    monitoring)
        echo -e "${YELLOW}Monitoring Stack Logs:${NC}"
        docker-compose logs "$FOLLOW" --tail="$LINES" clickhouse grafana
        ;;
    prompt-guard)
        echo -e "${YELLOW}Prompt Guard API Logs:${NC}"
        docker-compose logs "$FOLLOW" --tail="$LINES" prompt-guard-api
        ;;
    all)
        echo -e "${YELLOW}All Services Logs:${NC}"
        docker-compose logs "$FOLLOW" --tail="$LINES"
        ;;
    *)
        echo "Unknown service: $SERVICE"
        show_usage
        exit 1
        ;;
esac

echo ""
