#!/bin/bash

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safe word splitting

# Check status of all Vigil Guard services

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

check_service() {
    local name=$1
    local url=$2
    local expected_code=${3:-200}

    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_code"; then
        echo -e "  ${GREEN}✓${NC} $name is ${GREEN}running${NC} - $url"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name is ${RED}not responding${NC} - $url"
        return 1
    fi
}

print_header "Vigil Guard - Service Status"

DOCKER_AVAILABLE=1
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} Docker CLI not found. Skipping Docker diagnostics."
    DOCKER_AVAILABLE=0
elif ! docker info >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} Docker daemon not reachable (is it running / do you have permissions?). Skipping Docker diagnostics."
    DOCKER_AVAILABLE=0
fi

if [ "$DOCKER_AVAILABLE" -eq 1 ]; then
    if docker network inspect vigil-net >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Docker network 'vigil-net' exists"
    else
        echo -e "${RED}✗${NC} Docker network 'vigil-net' not found"
        echo -e "      ${YELLOW}→${NC} Create it with: docker network create vigil-net"
    fi
else
    echo -e "${YELLOW}⚠${NC} Docker network check skipped"
fi

echo ""
echo "Service Status:"

# Web UI Frontend (SPA may return 200 or 404 depending on route handling)
check_service "Web UI Frontend     " "http://localhost:5173" "200\|404"

# Web UI Backend
check_service "Web UI Backend API  " "http://localhost:8787/health" "200"

# n8n
check_service "n8n Workflow        " "http://localhost:5678" "200\|302"

# Grafana
check_service "Grafana Dashboard   " "http://localhost:3001" "200\|302"

# ClickHouse
check_service "ClickHouse HTTP     " "http://localhost:8123/ping" "200"

# Prompt Guard API
check_service "Prompt Guard API    " "http://localhost:8000/health" "200"

if [ "$DOCKER_AVAILABLE" -eq 1 ]; then
    echo ""
    echo "Docker Containers (vigil-guard project):"
    docker ps --filter "label=com.docker.compose.project=vigil-guard" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || echo "No containers found"

    echo ""
    echo "Resource Usage:"
    docker stats --no-stream --filter "label=com.docker.compose.project=vigil-guard" --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "Could not retrieve stats"

    echo ""
else
    echo ""
    echo -e "${YELLOW}⚠${NC} Container details skipped (Docker unavailable)"
    echo ""
fi
