#!/bin/bash

# Vigil Guard - Complete Installation Script
# This script automates the installation of all components

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_header "1/8 Checking Prerequisites"

    local missing_deps=0

    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            log_success "Node.js $(node --version) is installed"
        else
            log_error "Node.js version 18 or higher is required (found: $(node --version))"
            missing_deps=1
        fi
    else
        log_error "Node.js is not installed"
        log_info "Install from: https://nodejs.org/"
        missing_deps=1
    fi

    # Check npm
    if command_exists npm; then
        log_success "npm $(npm --version) is installed"
    else
        log_error "npm is not installed"
        missing_deps=1
    fi

    # Check Docker
    if command_exists docker; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        log_success "Docker $DOCKER_VERSION is installed"

        # Check if Docker daemon is running
        if docker info >/dev/null 2>&1; then
            log_success "Docker daemon is running"
        else
            log_error "Docker daemon is not running"
            log_info "Start Docker Desktop or run: sudo systemctl start docker"
            missing_deps=1
        fi
    else
        log_error "Docker is not installed"
        log_info "Install from: https://www.docker.com/get-started"
        missing_deps=1
    fi

    # Check Docker Compose
    if command_exists docker-compose || docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose is installed"
    else
        log_error "Docker Compose is not installed"
        missing_deps=1
    fi

    # Check Git
    if command_exists git; then
        log_success "Git $(git --version | cut -d' ' -f3) is installed"
    else
        log_warning "Git is not installed (optional but recommended)"
    fi

    # Note: Llama model check is done earlier in check_llama_model() function
    # before user confirms installation

    if [ $missing_deps -eq 1 ]; then
        log_error "Missing required dependencies. Please install them and try again."
        exit 1
    fi

    echo ""
}

# Setup environment
setup_environment() {
    print_header "2/8 Setting Up Environment"

    # Check if .env exists
    if [ ! -f .env ]; then
        log_info "Creating .env file from template..."
        cp config/.env.example .env
        log_success ".env file created"

        # Generate random JWT secret
        log_info "Generating secure JWT_SECRET..."
        if command_exists openssl; then
            JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
            sed -i.bak "s|JWT_SECRET=change-this-to-a-long-random-string-in-production|JWT_SECRET=$JWT_SECRET|g" .env
            rm -f .env.bak
            log_success "JWT_SECRET generated and configured"
        else
            log_warning "OpenSSL not found. Please manually set JWT_SECRET in .env file!"
        fi

        log_warning "⚠️  IMPORTANT: Review and update other passwords in .env file:"
        log_warning "   - CLICKHOUSE_PASSWORD"
        log_warning "   - GF_SECURITY_ADMIN_PASSWORD"
        log_warning "   - GROQ_API_KEY (if using LLM Guard)"
        echo ""
        read -p "Press Enter to continue after reviewing .env file..."
    else
        log_success ".env file already exists"

        # Check for default/insecure values
        local warnings_found=0

        # Check JWT_SECRET
        if grep -q "JWT_SECRET=change-this" .env; then
            log_warning "⚠️  JWT_SECRET is using default value - generating new one"
            warnings_found=1
            if command_exists openssl; then
                JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
                sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|g" .env
                rm -f .env.bak
                log_success "JWT_SECRET generated automatically"
            fi
        fi

        # Check ClickHouse password
        if grep -q "CLICKHOUSE_PASSWORD=admin123" .env; then
            log_warning "⚠️  ClickHouse is using default password (admin123)"
            warnings_found=1
        fi

        # Check Grafana password
        if grep -q "GF_SECURITY_ADMIN_PASSWORD=admin123" .env; then
            log_warning "⚠️  Grafana admin is using default password (admin123)"
            warnings_found=1
        fi

        # Check n8n password
        if grep -q "N8N_BASIC_AUTH_PASSWORD=admin123" .env; then
            log_warning "⚠️  n8n is using default password (admin123)"
            warnings_found=1
        fi

        if [ "$warnings_found" -eq 1 ]; then
            echo ""
            log_warning "⚠️  Default passwords detected (admin123) - OK for development"
            log_warning "⚠️  For production, change passwords in .env before running"
            echo ""
        fi
    fi

    echo ""
}

# Create data directories
create_data_directories() {
    print_header "3/8 Creating Data Directories"

    log_info "Creating vigil_data directory structure..."

    mkdir -p vigil_data/clickhouse
    mkdir -p vigil_data/grafana
    mkdir -p vigil_data/n8n
    mkdir -p vigil_data/web-ui
    mkdir -p vigil_data/prompt-guard-cache
    mkdir -p vigil_data/caddy-data
    mkdir -p vigil_data/caddy-config

    log_success "Data directories created at: $(pwd)/vigil_data/"

    # Fix permissions for Docker containers (needed for ClickHouse and Grafana)
    log_info "Setting permissions for Docker volumes..."
    chmod -R 777 vigil_data/clickhouse 2>/dev/null || true
    chmod -R 777 vigil_data/grafana 2>/dev/null || true
    log_success "Permissions configured"

    echo ""
}

# Create Docker network
create_docker_network() {
    print_header "4/8 Creating Docker Network"

    if docker network inspect vigil-net >/dev/null 2>&1; then
        log_info "Docker network 'vigil-net' already exists"
        # Remove it and let Docker Compose create it with correct labels
        log_info "Removing existing network to ensure correct configuration..."
        docker network rm vigil-net 2>/dev/null || true
    fi

    # Let Docker Compose create the network with proper labels during 'up' phase
    log_success "Network will be created by Docker Compose"

    echo ""
}

# Build and start all services
start_all_services() {
    print_header "5/8 Building and Starting All Services"

    log_info "Building Docker images..."
    docker-compose build

    log_success "Docker images built successfully"
    echo ""

    log_info "Starting all services..."
    docker-compose up -d

    log_success "All services started"
    echo ""

    log_info "Waiting for services to be ready (60 seconds)..."
    sleep 60
    echo ""
}

# Initialize ClickHouse database
initialize_clickhouse() {
    print_header "6/8 Initializing ClickHouse Database"

    # Load ClickHouse configuration from .env
    if [ -f .env ]; then
        CLICKHOUSE_CONTAINER_NAME=$(grep "^CLICKHOUSE_CONTAINER_NAME=" .env | cut -d'=' -f2)
        CLICKHOUSE_USER=$(grep "^CLICKHOUSE_USER=" .env | cut -d'=' -f2)
        CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
        CLICKHOUSE_DB=$(grep "^CLICKHOUSE_DB=" .env | cut -d'=' -f2)
        CLICKHOUSE_HTTP_PORT=$(grep "^CLICKHOUSE_HTTP_PORT=" .env | cut -d'=' -f2)
    fi
    CLICKHOUSE_CONTAINER_NAME=${CLICKHOUSE_CONTAINER_NAME:-vigil-clickhouse}
    CLICKHOUSE_USER=${CLICKHOUSE_USER:-admin}
    CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-admin123}
    CLICKHOUSE_DB=${CLICKHOUSE_DB:-n8n_logs}
    CLICKHOUSE_HTTP_PORT=${CLICKHOUSE_HTTP_PORT:-8123}

    log_info "Waiting for ClickHouse to be ready..."

    # Wait for ClickHouse to be fully started (check health endpoint)
    RETRY_COUNT=0
    MAX_RETRIES=30
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s -u ${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD} "http://localhost:${CLICKHOUSE_HTTP_PORT}/ping" >/dev/null 2>&1; then
            log_success "ClickHouse is ready"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            sleep 2
        else
            log_error "ClickHouse failed to start within expected time"
            return 1
        fi
    done

    # Create database
    log_info "Creating ${CLICKHOUSE_DB} database..."
    if docker exec -i $CLICKHOUSE_CONTAINER_NAME clickhouse-client --user $CLICKHOUSE_USER --password "$CLICKHOUSE_PASSWORD" --multiquery <<EOF >/dev/null 2>&1
CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DB};
EOF
    then
        log_success "Database created"
    else
        log_error "Failed to create database"
        return 1
    fi

    # Execute table creation script
    log_info "Creating tables..."
    if cat services/monitoring/sql/01-create-tables.sql | docker exec -i $CLICKHOUSE_CONTAINER_NAME clickhouse-client --user $CLICKHOUSE_USER --password "$CLICKHOUSE_PASSWORD" --multiquery >/dev/null 2>&1; then
        log_success "Tables created"
    else
        log_error "Failed to create tables"
        return 1
    fi

    # Execute views creation script
    log_info "Creating views..."
    if cat services/monitoring/sql/02-create-views.sql | docker exec -i $CLICKHOUSE_CONTAINER_NAME clickhouse-client --user $CLICKHOUSE_USER --password "$CLICKHOUSE_PASSWORD" --multiquery >/dev/null 2>&1; then
        log_success "Views created"
    else
        log_error "Failed to create views"
        return 1
    fi

    # Verify installation
    log_info "Verifying database structure..."
    TABLE_COUNT=$(docker exec $CLICKHOUSE_CONTAINER_NAME clickhouse-client --user $CLICKHOUSE_USER --password "$CLICKHOUSE_PASSWORD" --database $CLICKHOUSE_DB -q "SHOW TABLES" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$TABLE_COUNT" -ge 5 ]; then
        log_success "ClickHouse initialized successfully ($TABLE_COUNT tables/views)"
    else
        log_warning "Database created but table count is unexpected: $TABLE_COUNT"
    fi

    echo ""
}

# Initialize Grafana
initialize_grafana() {
    print_header "7/8 Initializing Grafana"

    # Load Grafana configuration from .env
    if [ -f .env ]; then
        GRAFANA_CONTAINER_NAME=$(grep "^GRAFANA_CONTAINER_NAME=" .env | cut -d'=' -f2)
        GRAFANA_PASSWORD=$(grep "^GF_SECURITY_ADMIN_PASSWORD=" .env | cut -d'=' -f2)
        GRAFANA_PORT=$(grep "^GRAFANA_PORT=" .env | cut -d'=' -f2)
    fi
    GRAFANA_CONTAINER_NAME=${GRAFANA_CONTAINER_NAME:-vigil-grafana}
    GRAFANA_PASSWORD=${GRAFANA_PASSWORD:-admin}
    GRAFANA_PORT=${GRAFANA_PORT:-3001}

    log_info "Waiting for Grafana to be ready..."
    sleep 15

    # Check if Grafana is responding
    log_info "Checking Grafana health..."
    RETRY_COUNT=0
    MAX_RETRIES=10
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:${GRAFANA_PORT}/api/health | grep -q "200"; then
            log_success "Grafana is ready"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            log_info "Waiting for Grafana... ($RETRY_COUNT/$MAX_RETRIES)"
            sleep 5
        else
            log_warning "Grafana health check timed out, continuing anyway..."
        fi
    done

    # Reset admin password to ensure it matches .env
    log_info "Setting Grafana admin password..."
    if docker exec $GRAFANA_CONTAINER_NAME grafana cli admin reset-admin-password "$GRAFANA_PASSWORD" >/dev/null 2>&1; then
        log_success "Admin password configured"
    else
        log_warning "Failed to set admin password (may already be set correctly)"
    fi

    # Verify datasource provisioning
    log_info "Verifying ClickHouse datasource..."
    sleep 5
    DATASOURCE_CHECK=$(curl -s -u admin:"$GRAFANA_PASSWORD" http://localhost:${GRAFANA_PORT}/api/datasources/name/ClickHouse 2>/dev/null)
    if echo "$DATASOURCE_CHECK" | grep -q "ClickHouse"; then
        log_success "ClickHouse datasource provisioned successfully"
    else
        log_warning "ClickHouse datasource not found - check provisioning config"
    fi

    # Verify dashboard provisioning
    log_info "Verifying Vigil dashboard..."
    DASHBOARD_CHECK=$(curl -s -u admin:"$GRAFANA_PASSWORD" "http://localhost:${GRAFANA_PORT}/api/search?type=dash-db" 2>/dev/null)
    if echo "$DASHBOARD_CHECK" | grep -q "Vigil"; then
        log_success "Vigil dashboard provisioned successfully"
    else
        log_warning "Vigil dashboard not found - check provisioning config"
    fi

    echo ""
}

# Verify services
verify_services() {
    print_header "8/8 Verifying Services"

    local all_healthy=1

    # Check ClickHouse
    log_info "Checking ClickHouse..."
    if docker-compose ps clickhouse | grep -q "Up"; then
        if curl -s http://localhost:8123/ping >/dev/null 2>&1; then
            log_success "ClickHouse is running on port 8123"
        else
            log_warning "ClickHouse container is up but not responding yet"
            all_healthy=0
        fi
    else
        log_error "ClickHouse is not running"
        all_healthy=0
    fi

    # Check Grafana
    log_info "Checking Grafana..."
    if docker-compose ps grafana | grep -q "Up"; then
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200\|302"; then
            log_success "Grafana is running on port 3001"
        else
            log_warning "Grafana container is up but not responding yet"
            all_healthy=0
        fi
    else
        log_error "Grafana is not running"
        all_healthy=0
    fi

    # Check n8n
    log_info "Checking n8n..."
    if docker-compose ps n8n | grep -q "Up"; then
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:5678 | grep -q "200\|302"; then
            log_success "n8n is running on port 5678"
        else
            log_warning "n8n container is up but not responding yet"
            all_healthy=0
        fi
    else
        log_error "n8n is not running"
        all_healthy=0
    fi

    # Check Web UI Backend
    log_info "Checking Web UI Backend..."
    if docker-compose ps web-ui-backend | grep -q "Up"; then
        if curl -s http://localhost:8787/api/files >/dev/null 2>&1; then
            log_success "Web UI Backend is running on port 8787"
        else
            log_warning "Web UI Backend container is up but not responding yet"
            all_healthy=0
        fi
    else
        log_error "Web UI Backend is not running"
        all_healthy=0
    fi

    # Check Web UI Frontend
    log_info "Checking Web UI Frontend..."
    if docker-compose ps web-ui-frontend | grep -q "Up"; then
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200\|404"; then
            log_success "Web UI Frontend is running on port 5173"
        else
            log_warning "Web UI Frontend container is up but not responding yet"
            all_healthy=0
        fi
    else
        log_error "Web UI Frontend is not running"
        all_healthy=0
    fi

    echo ""

    if [ $all_healthy -eq 0 ]; then
        log_warning "Some services may need more time to start."
        log_info "Check service logs with: docker-compose logs [service-name]"
        log_info "Or run: ./scripts/status.sh"
    fi

    echo ""
}

# Display summary
show_summary() {
    print_header "Installation Complete!"

    # Load configuration from .env for display
    if [ -f .env ]; then
        FRONTEND_PORT=$(grep "^FRONTEND_PORT=" .env | cut -d'=' -f2)
        BACKEND_PORT=$(grep "^BACKEND_PORT=" .env | cut -d'=' -f2)
        N8N_PORT=$(grep "^N8N_PORT=" .env | cut -d'=' -f2)
        GRAFANA_PORT=$(grep "^GRAFANA_PORT=" .env | cut -d'=' -f2)
        CLICKHOUSE_HTTP_PORT=$(grep "^CLICKHOUSE_HTTP_PORT=" .env | cut -d'=' -f2)
        CLICKHOUSE_USER=$(grep "^CLICKHOUSE_USER=" .env | cut -d'=' -f2)
        CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
        CLICKHOUSE_DB=$(grep "^CLICKHOUSE_DB=" .env | cut -d'=' -f2)
        GF_SECURITY_ADMIN_PASSWORD=$(grep "^GF_SECURITY_ADMIN_PASSWORD=" .env | cut -d'=' -f2)
    fi
    FRONTEND_PORT=${FRONTEND_PORT:-5173}
    BACKEND_PORT=${BACKEND_PORT:-8787}
    N8N_PORT=${N8N_PORT:-5678}
    GRAFANA_PORT=${GRAFANA_PORT:-3001}
    CLICKHOUSE_HTTP_PORT=${CLICKHOUSE_HTTP_PORT:-8123}
    CLICKHOUSE_USER=${CLICKHOUSE_USER:-admin}
    CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-admin123}
    CLICKHOUSE_DB=${CLICKHOUSE_DB:-n8n_logs}
    GF_SECURITY_ADMIN_PASSWORD=${GF_SECURITY_ADMIN_PASSWORD:-admin}

    echo -e "${GREEN}All components have been installed and started!${NC}"
    echo ""
    echo "Access points:"
    echo -e "  ${BLUE}•${NC} Web UI:            ${GREEN}http://localhost:${FRONTEND_PORT}/ui${NC}"
    echo -e "  ${BLUE}•${NC} Web UI API:        ${GREEN}http://localhost:${BACKEND_PORT}/api${NC}"
    echo -e "  ${BLUE}•${NC} n8n Workflow:      ${GREEN}http://localhost:${N8N_PORT}${NC}"
    echo -e "  ${BLUE}•${NC} Grafana Dashboard: ${GREEN}http://localhost:${GRAFANA_PORT}${NC}"
    echo -e "  ${BLUE}•${NC} ClickHouse HTTP:   ${GREEN}http://localhost:${CLICKHOUSE_HTTP_PORT}${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Default Credentials:${NC}"
    echo ""
    echo -e "  ${GREEN}Web UI:${NC}"
    echo -e "    Username: ${BLUE}admin${NC}"
    echo -e "    Password: ${BLUE}admin123${NC}"
    echo -e "    ${RED}⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!${NC}"
    echo ""
    echo -e "  ${GREEN}Grafana:${NC}"
    echo -e "    Username: ${BLUE}admin${NC}"
    echo -e "    Password: ${BLUE}${GF_SECURITY_ADMIN_PASSWORD}${NC} (from .env: GF_SECURITY_ADMIN_PASSWORD)"
    echo -e "    Datasource: ${GREEN}ClickHouse (auto-configured)${NC}"
    echo -e "    Dashboard: ${GREEN}Vigil (auto-imported)${NC}"
    echo ""
    echo -e "  ${GREEN}ClickHouse:${NC}"
    echo -e "    Username: ${BLUE}${CLICKHOUSE_USER}${NC}"
    echo -e "    Password: ${BLUE}${CLICKHOUSE_PASSWORD}${NC}"
    echo -e "    Database: ${BLUE}${CLICKHOUSE_DB}${NC}"
    echo ""
    echo "Useful commands:"
    echo -e "  ${BLUE}•${NC} Check all services:      ${YELLOW}docker-compose ps${NC}"
    echo -e "  ${BLUE}•${NC} View service status:     ${YELLOW}./scripts/status.sh${NC}"
    echo -e "  ${BLUE}•${NC} View all logs:           ${YELLOW}docker-compose logs -f${NC}"
    echo -e "  ${BLUE}•${NC} Stop all services:       ${YELLOW}docker-compose down${NC}"
    echo -e "  ${BLUE}•${NC} Restart a service:       ${YELLOW}docker-compose restart [service]${NC}"
    echo ""
    echo "Management scripts:"
    echo -e "  ${BLUE}•${NC} Init ClickHouse DB:      ${YELLOW}./scripts/init-clickhouse.sh${NC}"
    echo -e "  ${BLUE}•${NC} Init Grafana:            ${YELLOW}./scripts/init-grafana.sh${NC}"
    echo -e "  ${BLUE}•${NC} Development mode:        ${YELLOW}./scripts/dev.sh${NC}"
    echo -e "  ${BLUE}•${NC} View logs:               ${YELLOW}./scripts/logs.sh${NC}"
    echo ""
    echo "Documentation:"
    echo -e "  ${BLUE}•${NC} Quick Start:           ${YELLOW}QUICKSTART.md${NC}"
    echo -e "  ${BLUE}•${NC} Docker Guide:          ${YELLOW}DOCKER.md${NC}"
    echo -e "  ${BLUE}•${NC} Authentication:        ${YELLOW}docs/AUTHENTICATION.md${NC}"
    echo -e "  ${BLUE}•${NC} Full Documentation:    ${YELLOW}docs/README.md${NC}"
    echo ""
}

# Check Llama model BEFORE anything else
check_llama_model() {
    print_header "Llama Prompt Guard 2 Model Check"

    # Check multiple possible locations
    LLAMA_MODEL_PATHS=(
        "../vigil-llm-models/Llama-Prompt-Guard-2-86M"  # Recommended location
        "./Llama-Prompt-Guard-2-86M"                     # In-repo location
    )

    for LLAMA_MODEL_PATH in "${LLAMA_MODEL_PATHS[@]}"; do
        if [ -d "$LLAMA_MODEL_PATH" ] && [ -f "$LLAMA_MODEL_PATH/config.json" ]; then
            log_success "Llama Prompt Guard model found at $LLAMA_MODEL_PATH"
            echo ""
            return 0
        fi
    done

    echo ""
    log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_error "  Llama Prompt Guard 2 Model NOT FOUND"
    log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    log_warning "⚠️  REQUIRED: You must download the model BEFORE installation"
    echo ""
    log_info "Due to Meta's Llama 4 Community License, the model cannot be included"
    log_info "in this repository and must be downloaded separately by you."
    echo ""
    log_info "📋 Requirements:"
    log_info "   1. Hugging Face account (free): https://huggingface.co/join"
    log_info "   2. Accept license: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M"
    log_info "   3. Download the model using our script"
    echo ""
    log_success "✅ Option 1: Download to External Directory (Recommended):"
    echo ""
    echo -e "   ${GREEN}./scripts/download-llama-model.sh${NC}"
    echo ""
    log_info "   This will download to: ../vigil-llm-models/Llama-Prompt-Guard-2-86M"
    echo ""
    log_success "✅ Option 2: Download to Repository Directory:"
    echo ""
    echo -e "   ${GREEN}cd Llama-Prompt-Guard-2-86M${NC}"
    echo -e "   ${GREEN}./download-here.sh${NC}"
    echo ""
    log_info "   This will download to: ./Llama-Prompt-Guard-2-86M"
    echo ""
    log_info "Both scripts will:"
    log_info "   • Check if Hugging Face CLI is installed"
    log_info "   • Verify your authentication"
    log_info "   • Download the model (~1.1 GB)"
    log_info "   • Validate the download"
    echo ""
    log_info "Alternative: Manual download instructions in prompt-guard-api/README.md"
    echo ""
    log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    read -p "Would you like to run the download script now? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        log_info "Starting model download..."
        echo ""

        if [ -f "./scripts/download-llama-model.sh" ]; then
            ./scripts/download-llama-model.sh

            # Check again after download
            if [ -d "$LLAMA_MODEL_PATH" ] && [ -f "$LLAMA_MODEL_PATH/config.json" ]; then
                echo ""
                log_success "Model downloaded successfully!"
                echo ""
                log_info "Continuing with Vigil Guard installation..."
                echo ""
                sleep 2
                return 0
            else
                echo ""
                log_error "Model download failed or incomplete."
                log_info "Please run ./scripts/download-llama-model.sh manually and try again."
                exit 1
            fi
        else
            log_error "Download script not found at ./scripts/download-llama-model.sh"
            exit 1
        fi
    else
        echo ""
        log_info "Installation cancelled."
        log_info "Run ./scripts/download-llama-model.sh first, then run ./install.sh again."
        exit 1
    fi
}

# Main installation flow
main() {
    clear
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                                    ║${NC}"
    echo -e "${BLUE}║         Vigil Guard Installation Script       ║${NC}"
    echo -e "${BLUE}║                      v1.0.0                        ║${NC}"
    echo -e "${BLUE}║                                                    ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
    echo ""

    # CRITICAL: Check for Llama model FIRST, before anything else
    check_llama_model

    log_warning "This script will install and start all Vigil Guard components."
    log_warning "Estimated time: 5-10 minutes"
    echo ""
    log_info "Starting installation automatically..."
    echo ""

    # Run installation steps
    check_prerequisites
    setup_environment
    create_data_directories
    create_docker_network
    start_all_services
    initialize_clickhouse
    initialize_grafana
    verify_services
    show_summary
}

# Run main function
main
