#!/bin/bash

# Start Vigil Guard in development mode (without Docker for GUI)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Vigil Guard - Development Mode${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Directories
BACKEND_DIR="services/web-ui/backend"
FRONTEND_DIR="services/web-ui/frontend"
MONITORING_DIR="services/monitoring"
WORKFLOW_DIR="services/workflow"

# Separate function for dependency installation
install_dependencies() {
    local needs_install=0

    if [ ! -d "$BACKEND_DIR/node_modules" ]; then
        echo -e "${YELLOW}⚠${NC} Backend dependencies missing"
        needs_install=1
    fi

    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo -e "${YELLOW}⚠${NC} Frontend dependencies missing"
        needs_install=1
    fi

    if [ "$needs_install" -eq 1 ]; then
        echo ""
        echo -e "${BLUE}Installing dependencies...${NC}"
        echo ""

        if [ ! -d "$BACKEND_DIR/node_modules" ]; then
            echo -e "${BLUE}→${NC} Backend: npm install"
            (cd "$BACKEND_DIR" && npm install) || {
                echo -e "${RED}✗${NC} Backend dependency installation failed"
                exit 1
            }
            echo -e "${GREEN}✓${NC} Backend dependencies installed"
        fi

        if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
            echo -e "${BLUE}→${NC} Frontend: npm install"
            (cd "$FRONTEND_DIR" && npm install) || {
                echo -e "${RED}✗${NC} Frontend dependency installation failed"
                exit 1
            }
            echo -e "${GREEN}✓${NC} Frontend dependencies installed"
        fi
        echo ""
    else
        echo -e "${GREEN}✓${NC} Dependencies already installed"
        echo ""
    fi
}

# Detect docker compose command (handles both old and new syntax)
detect_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        return 1
    fi
}

# Check Docker availability with detailed error handling
check_docker() {
    local docker_status=0

    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}✗${NC} Docker CLI not found"
        echo ""
        echo -e "${YELLOW}To install Docker:${NC}"
        echo "  macOS:   https://docs.docker.com/desktop/install/mac-install/"
        echo "  Linux:   https://docs.docker.com/engine/install/"
        echo "  Windows: https://docs.docker.com/desktop/install/windows-install/"
        echo ""
        docker_status=1
    elif ! docker info >/dev/null 2>&1; then
        echo -e "${RED}✗${NC} Docker daemon not reachable"
        echo ""
        echo -e "${YELLOW}Possible causes:${NC}"
        echo "  1. Docker daemon is not running"
        echo "     → Start Docker Desktop (macOS/Windows)"
        echo "     → Run: sudo systemctl start docker (Linux)"
        echo ""
        echo "  2. Permission denied"
        echo "     → Add your user to docker group: sudo usermod -aG docker \$USER"
        echo "     → Log out and log back in"
        echo ""
        docker_status=1
    elif ! DOCKER_COMPOSE=$(detect_docker_compose); then
        echo -e "${RED}✗${NC} Docker Compose not found"
        echo ""
        echo -e "${YELLOW}Docker Compose is required but not available${NC}"
        echo "  → Install Docker Compose plugin or standalone binary"
        echo ""
        docker_status=1
    else
        export DOCKER_COMPOSE
    fi

    return $docker_status
}

# Start Docker services
start_docker_services() {
    echo -e "${BLUE}Checking Docker services...${NC}"
    echo ""

    if ! docker ps --format '{{.Names}}' | grep -q '^vigil-clickhouse$'; then
        echo -e "${YELLOW}Starting monitoring stack...${NC}"
        (cd "$MONITORING_DIR" && $DOCKER_COMPOSE up -d) || {
            echo -e "${RED}✗${NC} Failed to start monitoring stack"
            return 1
        }
        echo -e "${GREEN}✓${NC} Monitoring stack started"
    else
        echo -e "${GREEN}✓${NC} Monitoring stack already running"
    fi

    if ! docker ps --format '{{.Names}}' | grep -q '^vigil-n8n$'; then
        echo -e "${YELLOW}Starting n8n...${NC}"
        (cd "$WORKFLOW_DIR" && $DOCKER_COMPOSE up -d) || {
            echo -e "${RED}✗${NC} Failed to start n8n"
            return 1
        }
        echo -e "${GREEN}✓${NC} n8n started"
    else
        echo -e "${GREEN}✓${NC} n8n already running"
    fi
    echo ""
}

# Main execution flow
install_dependencies

if ! check_docker; then
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}Docker is required for development${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Development requires Docker containers for:"
    echo "  • ClickHouse (analytics database)"
    echo "  • Grafana (monitoring dashboards)"
    echo "  • n8n (workflow engine)"
    echo ""
    echo "Options:"
    echo "  1. Fix Docker and run this script again"
    echo "  2. Start GUI only (backend + frontend):"
    echo "     - Terminal 1: cd services/web-ui/backend && npm run dev"
    echo "     - Terminal 2: cd services/web-ui/frontend && npm run dev"
    echo ""
    exit 1
fi

start_docker_services

echo ""
echo -e "${YELLOW}Starting GUI in development mode (current terminal)...${NC}"
echo ""
echo "Press Ctrl+C to stop both servers."

start_backend() {
    echo -e "${BLUE}→${NC} Backend: npm run dev"
    (cd "$BACKEND_DIR" && npm run dev)
}

start_frontend() {
    echo -e "${BLUE}→${NC} Frontend: npm run dev"
    (cd "$FRONTEND_DIR" && npm run dev)
}

start_backend &
BACKEND_PID=$!
start_frontend &
FRONTEND_PID=$!

stop_servers() {
    echo ""
    echo -e "${YELLOW}Stopping dev servers...${NC}"
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    exit 0
}

trap stop_servers INT TERM

wait "$BACKEND_PID" "$FRONTEND_PID"
