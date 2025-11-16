#!/bin/bash

# Vigil Guard - Complete Installation Script
# This script automates the installation of all components

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safe word splitting

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

# Track installation progress
TOTAL_STEPS=15
CURRENT_STEP=0

print_header() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    PROGRESS=$((CURRENT_STEP * 100 / TOTAL_STEPS))

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}[$PROGRESS%] $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect platform (for permission handling)
detect_platform() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

# State file for tracking installation
INSTALL_STATE_FILE=".install-state.lock"

# Check if this is a re-run on existing installation
check_existing_installation() {
    if [ -f "$INSTALL_STATE_FILE" ]; then
        log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_warning "  Existing Installation Detected"
        log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        log_info "Previous installation: $(cat $INSTALL_STATE_FILE)"
        echo ""
        log_warning "IMPORTANT: Re-running install.sh on existing installation"
        echo ""
        log_info "This installation will:"
        echo "  • ${GREEN}Preserve${NC} all data volumes (ClickHouse, Grafana, Web UI)"
        echo "  • ${GREEN}Keep${NC} existing passwords (unless you choose to reset)"
        echo "  • ${YELLOW}Update${NC} configuration files and services"
        echo ""
        log_warning "Data preservation is the default safe behavior."
        echo ""
        read -r -p "Continue with update? (y/N): " REPLY
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Installation cancelled by user"
            exit 0
        fi
        # Return 0 = existing installation detected (success, but needs update mode)
        return 0
    else
        # Return 1 = fresh installation (no existing state, normal install proceeds)
        return 1
    fi
}

# Detect existing Docker volumes
detect_volumes() {
    local volumes_found=0

    if docker volume ls | grep -q "vigil"; then
        volumes_found=1
        echo ""
        log_info "Found existing Docker volumes:"
        docker volume ls | grep "vigil" | awk '{print "  • " $2}'
        echo ""
    fi

    if [ -d "vigil_data/clickhouse" ]; then
        volumes_found=1
        local size
        size=$(du -sh vigil_data/clickhouse 2>/dev/null | awk '{print $1}')
        log_info "Found local ClickHouse data directory: vigil_data/clickhouse ($size)"
    fi

    return $volumes_found
}

# Confirm data destruction with user
confirm_data_destruction() {
    local reason="$1"

    echo ""
    log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_error "  ⚠️  DATA DESTRUCTION WARNING ⚠️"
    log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    log_warning "Reason: ${reason}"
    echo ""

    # Show what will be deleted
    detect_volumes

    echo ""
    log_error "⚠️  ALL DATA IN THESE VOLUMES WILL BE PERMANENTLY DELETED ⚠️"
    echo ""
    log_info "This includes:"
    echo "  • All ClickHouse logs (events_raw, events_processed)"
    echo "  • Security audit trails (30-365 days of data)"
    echo "  • Grafana dashboards and settings"
    echo "  • Web UI database (users, sessions)"
    echo ""
    log_warning "This action CANNOT be undone!"
    echo ""
    log_info "If you want to preserve data, cancel now and:"
    echo "  1. Backup vigil_data/ directory"
    echo "  2. Export ClickHouse tables manually"
    echo "  3. Use existing passwords (edit .env manually)"
    echo ""

    read -r -p "Type 'DELETE' (all caps) to confirm data destruction: " CONFIRM
    echo

    if [ "$CONFIRM" != "DELETE" ]; then
        log_info "Data destruction cancelled by user"
        log_info "Installation cannot proceed with password rotation"
        log_info "To continue, either:"
        log_info "  1. Keep existing passwords (edit .env manually)"
        log_info "  2. Backup data and re-run with DELETE confirmation"
        exit 1
    fi

    log_warning "Confirmation received - proceeding with data destruction..."
}

# Save installation state
save_install_state() {
    local timestamp
    timestamp=$(date +%Y-%m-%d_%H:%M:%S)
    echo "$timestamp - Vigil Guard installation completed successfully" > "$INSTALL_STATE_FILE"
    log_success "Installation state saved to $INSTALL_STATE_FILE"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

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

    # Check spaCy models for Presidio PII detection
    log_info "Checking spaCy models for PII detection..."
    MODELS_DIR="services/presidio-pii-api/models"
    if [ -d "$MODELS_DIR" ] && [ -f "$MODELS_DIR/checksums.sha256" ]; then
        MODEL_COUNT=$(find "$MODELS_DIR" -maxdepth 1 -name "*.whl" 2>/dev/null | wc -l | tr -d ' ')
        if [ "$MODEL_COUNT" -ge 2 ]; then
            log_success "spaCy models found ($MODEL_COUNT .whl files)"
        else
            log_warning "spaCy models incomplete (found $MODEL_COUNT, expected 2)"
            log_info "Run: ./scripts/download-pii-models.sh"
        fi
    else
        log_warning "spaCy models not found"
        log_info "PII detection will use Presidio with spaCy models"
        log_info "Download models: ./scripts/download-pii-models.sh"
    fi

    # Note: Llama model check is done earlier in check_llama_model() function
    # before user confirms installation

    if [ $missing_deps -eq 1 ]; then
        log_error "Missing required dependencies. Please install them and try again."
        exit 1
    fi

    echo ""
}

# Generate secure random passwords
generate_secure_passwords() {
    log_info "Generating cryptographically secure passwords..."
    echo ""

    if ! command_exists openssl; then
        log_error "OpenSSL is required to generate secure passwords"
        log_error "Please install OpenSSL and try again"
        exit 1
    fi

    # Generate 4 unique passwords (n8n uses account creation wizard)
    CLICKHOUSE_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 32)
    GRAFANA_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 32)
    WEB_UI_ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 32)
    SESSION_SECRET=$(openssl rand -base64 64 | tr -d '/+=\n' | head -c 64)

    # Replace passwords in .env file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS requires empty string after -i
        sed -i '' "s|CLICKHOUSE_PASSWORD=.*|CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}|g" .env || { log_error "Failed to update CLICKHOUSE_PASSWORD in .env"; exit 1; }
        sed -i '' "s|GF_SECURITY_ADMIN_PASSWORD=.*|GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}|g" .env || { log_error "Failed to update GF_SECURITY_ADMIN_PASSWORD in .env"; exit 1; }
        sed -i '' "s|WEB_UI_ADMIN_PASSWORD=.*|WEB_UI_ADMIN_PASSWORD=${WEB_UI_ADMIN_PASSWORD}|g" .env || { log_error "Failed to update WEB_UI_ADMIN_PASSWORD in .env"; exit 1; }
        sed -i '' "s|SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|g" .env || { log_error "Failed to update SESSION_SECRET in .env"; exit 1; }
    else
        # Linux sed
        sed -i "s|CLICKHOUSE_PASSWORD=.*|CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}|g" .env || { log_error "Failed to update CLICKHOUSE_PASSWORD in .env"; exit 1; }
        sed -i "s|GF_SECURITY_ADMIN_PASSWORD=.*|GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}|g" .env || { log_error "Failed to update GF_SECURITY_ADMIN_PASSWORD in .env"; exit 1; }
        sed -i "s|WEB_UI_ADMIN_PASSWORD=.*|WEB_UI_ADMIN_PASSWORD=${WEB_UI_ADMIN_PASSWORD}|g" .env || { log_error "Failed to update WEB_UI_ADMIN_PASSWORD in .env"; exit 1; }
        sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|g" .env || { log_error "Failed to update SESSION_SECRET in .env"; exit 1; }
    fi

    log_success "Secure passwords generated and configured"
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}⚠️  CRITICAL: SAVE THESE CREDENTIALS - SHOWN ONLY ONCE! ⚠️${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}These credentials have been auto-generated for your installation:${NC}"
    echo ""
    echo -e "${GREEN}ClickHouse Database:${NC}"
    echo -e "  Username: ${BLUE}admin${NC}"
    echo -e "  Password: ${BLUE}${CLICKHOUSE_PASSWORD}${NC}"
    echo ""
    echo -e "${GREEN}Grafana Dashboard:${NC}"
    echo -e "  Username: ${BLUE}admin${NC}"
    echo -e "  Password: ${BLUE}${GRAFANA_PASSWORD}${NC}"
    echo ""
    echo -e "${GREEN}Web UI Admin Account:${NC}"
    echo -e "  Username: ${BLUE}admin${NC}"
    echo -e "  Password: ${BLUE}${WEB_UI_ADMIN_PASSWORD}${NC}"
    echo -e "  ${YELLOW}Note: You will be forced to change this password on first login${NC}"
    echo ""
    echo -e "${GREEN}Backend Session Secret:${NC}"
    echo -e "  ${BLUE}${SESSION_SECRET}${NC}"
    echo ""
    echo -e "${RED}⚠️  IMPORTANT NEXT STEPS:${NC}"
    echo -e "  1. ${YELLOW}COPY${NC} these credentials to a secure password manager ${RED}NOW${NC}"
    echo -e "  2. These passwords are ${RED}NOT${NC} shown again after this screen"
    echo -e "  3. You will need them to access Web UI, Grafana, and ClickHouse"
    echo -e "  4. Web UI: Login at ${BLUE}http://localhost/ui${NC} with admin password above"
    echo -e "  5. n8n account: Create via wizard at ${BLUE}http://localhost:5678${NC} on first visit"
    echo -e "  6. If lost, you can regenerate by re-running: ${BLUE}./install.sh${NC}"
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    read -r -p "Press Enter after you have SAVED these credentials..."
    echo ""
}

# Setup environment
setup_environment() {
    print_header "Setting Up Environment"

    # CRITICAL: Unset any existing password ENV variables to ensure .env takes priority
    # Docker Compose prioritizes: Shell ENV > .env file
    # Without this, old passwords from previous sessions would override new .env values
    unset WEB_UI_ADMIN_PASSWORD 2>/dev/null || true
    unset CLICKHOUSE_PASSWORD 2>/dev/null || true
    unset GF_SECURITY_ADMIN_PASSWORD 2>/dev/null || true
    unset SESSION_SECRET 2>/dev/null || true
    unset JWT_SECRET 2>/dev/null || true
    log_info "Cleared environment variables (ensures .env takes priority)"
    echo ""

    # Check if .env exists
    if [ ! -f .env ]; then
        log_info "Creating .env file from template..."
        cp config/.env.example .env
        log_success ".env file created"
        echo ""

        # CRITICAL SECURITY: Check for existing ClickHouse volume
        # User may want to preserve data from previous installation
        if [ -d "vigil_data/clickhouse" ]; then
            echo ""
            log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            log_warning "  Existing ClickHouse Volume Detected"
            log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            log_info "Found existing ClickHouse data at: vigil_data/clickhouse"
            log_info "This volume may contain logs and data from a previous installation."
            echo ""
            log_warning "IMPORTANT DECISION REQUIRED:"
            echo ""
            log_info "New passwords will be generated for this installation."
            log_info "The existing volume contains authentication data tied to old passwords."
            echo ""
            log_warning "Options:"
            log_info "  1. ${GREEN}Remove volume${NC} - Clean installation with new passwords (RECOMMENDED)"
            log_info "     • All existing data will be lost"
            log_info "     • Fresh start with secure passwords"
            log_info "     • No authentication issues"
            echo ""
            log_info "  2. ${YELLOW}Keep volume${NC} - Preserve existing data (MAY CAUSE ISSUES)"
            log_info "     • Existing logs/data preserved"
            log_info "     • Password mismatch will cause authentication failures"
            log_info "     • You'll need to manually fix authentication"
            echo ""

            read -p "Remove existing ClickHouse volume? (Y/n): " -n 1 -r
            echo ""
            echo ""

            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                # User chose to remove volume
                log_info "Proceeding with volume cleanup..."
                echo ""

                # Verify Docker is accessible
                if ! docker info >/dev/null 2>&1; then
                    log_error "Docker daemon is not running or not accessible"
                    log_error "Cannot stop ClickHouse container"
                    log_info "Start Docker and try again"
                    exit 1
                fi

                # Stop container if running
                log_info "Stopping ClickHouse container if running..."
                docker-compose stop clickhouse 2>/dev/null || log_info "Container not running"
                docker-compose rm -f clickhouse 2>/dev/null || log_info "Container not present"

                # Wait for full shutdown
                sleep 2

                # Remove volume with error handling
                log_info "Removing old ClickHouse volume data..."
                if ! rm -rf vigil_data/clickhouse 2>&1; then
                    log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                    log_error "  CRITICAL FAILURE: Cannot Remove ClickHouse Volume"
                    log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                    echo ""
                    log_error "Failed to delete vigil_data/clickhouse"
                    log_error "This will cause password authentication failures!"
                    echo ""
                    log_info "Possible solutions:"
                    log_info "  1. Run with elevated permissions: sudo ./install.sh"
                    log_info "  2. Manually remove: sudo rm -rf vigil_data/clickhouse"
                    log_info "  3. Check if files are in use: lsof vigil_data/clickhouse"
                    echo ""
                    exit 1
                fi

                # Verify deletion succeeded
                if [ -d "vigil_data/clickhouse" ]; then
                    log_error "CRITICAL: Volume directory still exists after deletion attempt!"
                    log_error "This indicates a serious filesystem or permission issue."
                    log_error "Cannot proceed - authentication will fail."
                    exit 1
                fi

                log_success "Old volume removed successfully"
                echo ""
            else
                # User chose to keep volume
                log_warning "Keeping existing ClickHouse volume as requested"
                log_warning "⚠️  WARNING: This WILL cause password authentication failures!"
                echo ""
                log_info "After installation, you'll need to manually fix ClickHouse authentication:"
                log_info "  1. Stop services: docker-compose down"
                log_info "  2. Remove volume: rm -rf vigil_data/clickhouse"
                log_info "  3. Restart with new password: docker-compose up -d"
                echo ""
                log_warning "Continuing with installation (authentication issues expected)..."
                echo ""
                sleep 3
            fi
        fi

        # MANDATORY: Generate secure passwords for new installations
        log_warning "⚠️  Auto-generating secure passwords (no default credentials allowed)..."
        echo ""
        generate_secure_passwords

        # Generate random JWT secret
        log_info "Generating secure JWT_SECRET..."
        if command_exists openssl; then
            JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|JWT_SECRET=change-this-to-a-secure-random-string-at-least-32-characters-long|JWT_SECRET=$JWT_SECRET|g" .env
            else
                sed -i "s|JWT_SECRET=change-this-to-a-secure-random-string-at-least-32-characters-long|JWT_SECRET=$JWT_SECRET|g" .env
            fi
            log_success "JWT_SECRET generated and configured"
        else
            log_warning "OpenSSL not found. Please manually set JWT_SECRET in .env file!"
        fi
    else
        log_success ".env file already exists"

        # Check for default/insecure values
        local force_regenerate=0

        # Check JWT_SECRET
        if grep -q "JWT_SECRET=change-this" .env; then
            log_warning "⚠️  JWT_SECRET is using default value - generating new one"
            if command_exists openssl; then
                JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|g" .env
                else
                    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|g" .env
                fi
                log_success "JWT_SECRET generated automatically"
            fi
        fi

        # Check for default passwords in ACTUAL VALUES (not comments)
        # Only check variables that are actually set, ignoring comments and empty lines
        if grep -Eq '^(CLICKHOUSE_PASSWORD|GF_SECURITY_ADMIN_PASSWORD|WEB_UI_ADMIN_PASSWORD|N8N_BASIC_AUTH_PASSWORD)=admin123$' .env; then
            log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            log_error "  CRITICAL SECURITY ISSUE: Default passwords detected!"
            log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            log_warning "Your .env file contains DEFAULT PASSWORDS (admin123)"
            log_warning "These are PUBLICLY KNOWN and must be changed immediately!"
            echo ""
            force_regenerate=1
        fi

        # Check for missing SESSION_SECRET
        if ! grep -q "^SESSION_SECRET=" .env || grep -q "^SESSION_SECRET=$" .env; then
            log_error "SESSION_SECRET is missing or empty - this will prevent backend from starting"
            force_regenerate=1
        fi

        if [ "$force_regenerate" -eq 1 ]; then
            # Check if this is a re-run on existing installation
            if [ -f "$INSTALL_STATE_FILE" ]; then
                # Existing installation - user must explicitly choose password rotation
                echo ""
                log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                log_warning "  Password Rotation on Existing Installation"
                log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo ""
                log_info "Default passwords detected, but this is an EXISTING installation."
                log_info "Password rotation will DESTROY all ClickHouse data to prevent auth conflicts."
                echo ""
                read -r -p "Do you want to rotate passwords? (y/N): " ROTATE_REPLY
                echo

                if [[ ! $ROTATE_REPLY =~ ^[Yy]$ ]]; then
                    log_info "Password rotation skipped by user"
                    log_warning "Installation will continue with existing passwords"
                    log_warning "⚠️  SECURITY RISK: Default passwords remain in use!"
                    log_info "To manually change passwords:"
                    log_info "  1. Edit .env file with strong passwords (32+ chars)"
                    log_info "  2. Run: docker-compose down"
                    log_info "  3. Run: rm -rf vigil_data/clickhouse"
                    log_info "  4. Run: docker-compose up -d"
                    force_regenerate=0  # Skip password generation
                fi
            fi

            # If still need to regenerate (either fresh install or user confirmed rotation)
            if [ "$force_regenerate" -eq 1 ]; then
                echo ""
                log_info "Auto-generating secure passwords to replace defaults..."
                echo ""
                generate_secure_passwords

                # CRITICAL: Confirm data destruction before removing volumes
                if [ -d "vigil_data/clickhouse" ] || docker volume ls | grep -q "vigil"; then
                    confirm_data_destruction "Password rotation requires ClickHouse re-initialization"

                    # Verify Docker is accessible
                    if ! docker info >/dev/null 2>&1; then
                        log_error "Docker daemon not accessible - cannot perform cleanup"
                        log_error "Start Docker and try again"
                        exit 1
                    fi

                    # Stop and remove container
                    log_info "Stopping ClickHouse container if running..."
                    docker-compose stop clickhouse 2>/dev/null || log_info "Container not running"

                    log_info "Removing ClickHouse container if present..."
                    docker-compose rm -f clickhouse 2>/dev/null || log_info "Container not present"

                    # Wait for full shutdown
                    sleep 2

                    # Remove volume data with error handling
                    log_info "Removing old ClickHouse volume data..."
                    if ! rm -rf vigil_data/clickhouse 2>&1; then
                        log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                        log_error "  CRITICAL SECURITY FAILURE: Password Rotation Cannot Complete"
                        log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                        echo ""
                        log_error "Cannot remove old ClickHouse volume at vigil_data/clickhouse"
                        log_error "System CANNOT rotate to secure passwords with old volume present"
                        echo ""
                        log_warning "SECURITY IMPACT:"
                        log_warning "  • System will continue using default/insecure passwords"
                        log_warning "  • This is a CRITICAL SECURITY VULNERABILITY"
                        log_warning "  • You MUST resolve this before deploying to production"
                        echo ""
                        log_info "Manual intervention required:"
                        log_info "  1. Stop all services: docker-compose down"
                        log_info "  2. Remove volume: sudo rm -rf vigil_data/clickhouse"
                        log_info "  3. Re-run installation: ./install.sh"
                        echo ""
                        log_error "ABORTING: Cannot proceed with insecure configuration"
                        exit 1
                    fi

                    # Verify deletion succeeded
                    if [ -d "vigil_data/clickhouse" ]; then
                        log_error "CRITICAL: Volume directory still exists after deletion!"
                        log_error "Filesystem error detected - cannot complete password rotation"
                        exit 1
                    fi

                    log_success "Old ClickHouse volume removed - will recreate with new password"
                    echo ""
                else
                    log_info "No existing ClickHouse volume found - proceeding with password rotation"
                    echo ""
                fi
            fi
        fi
    fi

    # Create Grafana ClickHouse datasource configuration from template
    log_info "Creating Grafana datasource configuration from template..."
    CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
    CLICKHOUSE_DATASOURCE_TEMPLATE="services/monitoring/grafana/provisioning/datasources/clickhouse.yml.example"
    CLICKHOUSE_DATASOURCE_FILE="services/monitoring/grafana/provisioning/datasources/clickhouse.yml"

    if [ -f "$CLICKHOUSE_DATASOURCE_TEMPLATE" ]; then
        # Copy template and replace placeholder with actual password
        cp "$CLICKHOUSE_DATASOURCE_TEMPLATE" "$CLICKHOUSE_DATASOURCE_FILE"

        # Note: Grafana provisioning files don't support environment variable substitution for datasource passwords
        # Therefore we use sed to inject the password during installation. This is a known Grafana limitation.
        # The password is securely sourced from .env and the resulting file is only readable by containers.
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|CLICKHOUSE_PASSWORD_PLACEHOLDER|${CLICKHOUSE_PASSWORD}|g" "$CLICKHOUSE_DATASOURCE_FILE"
        else
            sed -i "s|CLICKHOUSE_PASSWORD_PLACEHOLDER|${CLICKHOUSE_PASSWORD}|g" "$CLICKHOUSE_DATASOURCE_FILE"
        fi
        log_success "Grafana datasource configured with ClickHouse password from .env"
    else
        log_error "Grafana datasource template not found: $CLICKHOUSE_DATASOURCE_TEMPLATE"
        exit 1
    fi

    # Validate environment variables before proceeding
    echo ""
    log_info "Validating environment variables..."
    if ! bash scripts/validate-env.sh; then
        log_error "Environment validation failed - cannot proceed with installation"
        log_error "Fix the issues above and re-run ./install.sh"
        exit 1
    fi
    log_success "Environment variables validated successfully"

    echo ""
}

# Create data directories
create_data_directories() {
    print_header "Creating Data Directories"

    # CRITICAL: Clean stale databases on fresh installation
    # Prevents old credentials from persisting across reinstalls
    if [ ! -f "$INSTALL_STATE_FILE" ]; then
        log_info "Fresh installation detected: Cleaning stale databases..."
        rm -f vigil_data/web-ui/users.db* 2>/dev/null || true
        log_success "Stale databases removed"
        echo ""
    fi

    log_info "Creating vigil_data directory structure..."

    mkdir -p vigil_data/clickhouse
    mkdir -p vigil_data/grafana
    mkdir -p vigil_data/n8n
    mkdir -p vigil_data/web-ui
    mkdir -p vigil_data/prompt-guard-cache
    mkdir -p vigil_data/caddy-data
    mkdir -p vigil_data/caddy-config

    log_success "Data directories created at: $(pwd)/vigil_data/"

    # Set secure permissions for Docker containers
    log_info "Setting secure permissions for Docker volumes..."

    PLATFORM=$(detect_platform)

    if [ "$PLATFORM" = "linux" ]; then
        # Linux: Use specific UIDs for container users
        # ClickHouse runs as UID 101, Grafana as UID 472
        log_info "Linux detected: Setting ownership to container UIDs..."

        # ClickHouse data (UID 101:101)
        if [ -d "vigil_data/clickhouse" ]; then
            if ! chown -R 101:101 vigil_data/clickhouse 2>/dev/null; then
                log_error "Cannot set ownership for ClickHouse data directory (UID 101:101)"
                log_error "ClickHouse may fail to start due to permission issues"
                echo ""
                log_info "Run with sudo to fix: sudo chown -R 101:101 vigil_data/clickhouse"
                log_info "Or: Run full install with sudo: sudo ./install.sh"
                echo ""
                read -p "Continue anyway? (y/N): " -n 1 -r
                echo ""
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    exit 1
                fi
            fi
            chmod -R 750 vigil_data/clickhouse 2>/dev/null || true
            log_success "ClickHouse: 750 (owner: 101:101)"
        fi

        # Grafana data (read UID/GID from .env or use defaults)
        GRAFANA_UID=${GRAFANA_UID:-472}
        GRAFANA_GID=${GRAFANA_GID:-472}
        if [ -d "vigil_data/grafana" ]; then
            chown -R ${GRAFANA_UID}:${GRAFANA_GID} vigil_data/grafana 2>/dev/null || {
                log_warning "Cannot set ownership (need sudo), using fallback permissions"
                chmod 755 vigil_data/grafana
            }
            chmod -R 750 vigil_data/grafana 2>/dev/null || true
            log_success "Grafana: 750 (owner: ${GRAFANA_UID}:${GRAFANA_GID})"
        fi

    elif [ "$PLATFORM" = "macos" ]; then
        # macOS: Docker Desktop automatically maps host user to containers
        log_info "macOS detected: Using Docker Desktop UID mapping..."
        chmod 755 vigil_data/clickhouse 2>/dev/null || true
        chmod 755 vigil_data/grafana 2>/dev/null || true
        log_success "ClickHouse & Grafana: 755 (Docker Desktop will map UIDs)"

    else
        # Unknown platform - use safe defaults
        log_warning "Unknown platform: Using safe default permissions..."
        chmod 755 vigil_data/clickhouse 2>/dev/null || true
        chmod 755 vigil_data/grafana 2>/dev/null || true
    fi

    # Secure other directories (platform-independent)
    chmod 755 vigil_data/n8n 2>/dev/null || true
    chmod 755 vigil_data/web-ui 2>/dev/null || true
    chmod 700 vigil_data/prompt-guard-cache 2>/dev/null || true  # Most sensitive
    chmod 755 vigil_data/caddy-data 2>/dev/null || true
    chmod 755 vigil_data/caddy-config 2>/dev/null || true

    log_success "All permissions configured with least-privilege"

    echo ""
}

# Create Docker network
create_docker_network() {
    print_header "Creating Docker Network"

    if docker network inspect vigil-net >/dev/null 2>&1; then
        log_info "Docker network 'vigil-net' already exists"
        # Remove it and let Docker Compose create it with correct labels
        log_info "Removing existing network to ensure correct configuration..."
        if ! docker network rm vigil-net 2>&1; then
            log_error "Failed to remove existing vigil-net network"
            log_error "Network may be in use by running containers"
            log_info "Check with: docker network inspect vigil-net"
            log_info "Force removal: docker-compose down && docker network rm vigil-net"
            exit 1
        fi
    fi

    # Let Docker Compose create the network with proper labels during 'up' phase
    log_success "Network will be created by Docker Compose"

    echo ""
}
# Clean Docker cache and old images
cleanup_docker_cache() {
    print_header "Cleaning Docker Cache and Old Images"
    
    log_info "Checking for existing Vigil Guard images..."
    
    # Check if any Vigil images exist
    if docker images | grep -q "vigil-"; then
        log_warning "Found existing Vigil Guard Docker images"
        log_info "Removing old images to prevent cache issues..."
        
        # Stop and remove containers first (if running)
        if docker ps -a | grep -q "vigil-"; then
            log_info "Stopping existing containers..."
            docker-compose down 2>/dev/null || true
        fi
        
        # Remove Vigil Guard images
        docker images | grep "vigil-" | awk '{print $1":"$2}' | xargs -r docker rmi -f 2>/dev/null || true
        
        log_success "Old images removed"
    else
        log_info "No existing Vigil Guard images found (fresh installation)"
    fi
    
    # Prune build cache to ensure fresh build
    log_info "Pruning Docker build cache..."
    docker builder prune -f >/dev/null 2>&1 || true
    
    log_success "Docker cache cleaned"
    echo ""
}

# Build and start all services
    cleanup_docker_cache
start_all_services() {
    print_header "Building and Starting All Services"

    log_info "Building Docker images..."
    docker-compose build

    log_success "Docker images built successfully"
    echo ""

    log_info "Starting all services..."
    docker-compose up -d

    log_success "All services started"
    echo ""

    log_info "Waiting for services to be ready..."
    echo ""

    # Define all services with their health check endpoints (name|url pairs)
    SERVICES=(
        "ClickHouse|http://localhost:8123/ping"
        "Grafana|http://localhost:3001/api/health"
        "n8n|http://localhost:5678/healthz"
        "Web UI Backend|http://localhost:8787/health"
        "Presidio PII|http://localhost:5001/health"
        "Language Detector|http://localhost:5002/health"
        "Prompt Guard|http://localhost:8000/health"
    )

    # Wait for each service with individual timeout
    GLOBAL_TIMEOUT=120  # 2 minutes total
    START_TIME=$(date +%s)

    for SERVICE_ENTRY in "${SERVICES[@]}"; do
        IFS='|' read -r SERVICE_NAME SERVICE_URL <<< "$SERVICE_ENTRY"
        log_info "Checking $SERVICE_NAME..."

        RETRY_COUNT=0
        MAX_RETRIES=15

        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            # Check global timeout
            CURRENT_TIME=$(date +%s)
            ELAPSED=$((CURRENT_TIME - START_TIME))
            if [ $ELAPSED -ge $GLOBAL_TIMEOUT ]; then
                log_warning "$SERVICE_NAME not ready within global timeout (continuing anyway)"
                break
            fi

            # Try health check
            if curl -s -f "$SERVICE_URL" >/dev/null 2>&1; then
                log_success "$SERVICE_NAME is ready"
                break
            fi

            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                sleep 2
            else
                log_warning "$SERVICE_NAME not responding (continuing anyway)"
            fi
        done
    done

    echo ""
    log_success "Service initialization complete"
    echo ""
}

# Initialize ClickHouse database
initialize_clickhouse() {
    print_header "Initializing ClickHouse Database"

    # Verify all required SQL scripts exist
    REQUIRED_SQL_FILES=(
        "services/monitoring/sql/01-create-tables.sql"
        "services/monitoring/sql/02-create-views.sql"
        "services/monitoring/sql/03-false-positives.sql"
        "services/monitoring/sql/05-retention-config.sql"
        "services/monitoring/sql/06-add-audit-columns-v1.7.0.sql"
    )

    log_info "Verifying SQL migration files..."
    MISSING_FILES=0
    for SQL_FILE in "${REQUIRED_SQL_FILES[@]}"; do
        if [ ! -f "$SQL_FILE" ]; then
            log_error "Missing SQL file: $SQL_FILE"
            MISSING_FILES=$((MISSING_FILES + 1))
        fi
    done

    if [ $MISSING_FILES -gt 0 ]; then
        log_error "$MISSING_FILES SQL file(s) missing - cannot proceed"
        log_info "Ensure you have the complete v1.7.0 repository"
        exit 1
    fi
    log_success "All SQL migration files present"
    echo ""

    # Load ClickHouse configuration from .env
    if [ ! -f .env ]; then
        log_error ".env file not found - installation cannot proceed"
        log_error "Run: cp config/.env.example .env && ./install.sh"
        exit 1
    fi

    CLICKHOUSE_CONTAINER_NAME=$(grep "^CLICKHOUSE_CONTAINER_NAME=" .env | cut -d'=' -f2)
    CLICKHOUSE_USER=$(grep "^CLICKHOUSE_USER=" .env | cut -d'=' -f2)
    CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
    CLICKHOUSE_DB=$(grep "^CLICKHOUSE_DB=" .env | cut -d'=' -f2)
    CLICKHOUSE_HTTP_PORT=$(grep "^CLICKHOUSE_HTTP_PORT=" .env | cut -d'=' -f2)

    CLICKHOUSE_CONTAINER_NAME=${CLICKHOUSE_CONTAINER_NAME:-vigil-clickhouse}
    CLICKHOUSE_USER=${CLICKHOUSE_USER:-admin}
    # Password must be set in .env - no fallback for security
    if [ -z "$CLICKHOUSE_PASSWORD" ]; then
        log_error "CLICKHOUSE_PASSWORD empty in .env - installation cannot proceed"
        log_error "Run ./install.sh to generate secure credentials"
        exit 1
    fi
    CLICKHOUSE_DB=${CLICKHOUSE_DB:-n8n_logs}
    CLICKHOUSE_HTTP_PORT=${CLICKHOUSE_HTTP_PORT:-8123}

    log_info "Waiting for ClickHouse to be ready..."

    # Wait for ClickHouse to be fully started (check health endpoint)
    RETRY_COUNT=0
    MAX_RETRIES=30
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s -u "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" "http://localhost:${CLICKHOUSE_HTTP_PORT}/ping" >/dev/null 2>&1; then
            log_success "ClickHouse is ready"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            sleep 2
        else
            log_error "ClickHouse failed to start within expected time (60 seconds)"
            echo ""
            log_info "Troubleshooting:"
            log_info "  1. Check container status:"
            log_info "     docker ps -a | grep vigil-clickhouse"
            log_info "  2. Check ClickHouse logs for errors:"
            log_info "     docker logs vigil-clickhouse"
            log_info "  3. Common issues:"
            log_info "     - Port ${CLICKHOUSE_HTTP_PORT} already in use"
            log_info "     - Insufficient memory (ClickHouse needs ~512MB)"
            log_info "     - Permission issues with vigil_data/clickhouse directory"
            log_info "  4. Verify authentication:"
            log_info "     curl -u ${CLICKHOUSE_USER}:PASSWORD http://localhost:${CLICKHOUSE_HTTP_PORT}/ping"
            echo ""
            exit 1
        fi
    done

    # Create database
    log_info "Creating ${CLICKHOUSE_DB} database..."
    if DB_CREATE_OUTPUT=$(docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery <<EOF 2>&1
CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DB};
EOF
); then
        log_success "Database created"
    else
        log_error "Failed to create database"
        log_error "ClickHouse error: $DB_CREATE_OUTPUT"
        log_info "Check credentials in .env file"
        exit 1
    fi

    # Execute table creation script
    log_info "Creating tables..."
    TABLE_OUTPUT=$(cat services/monitoring/sql/01-create-tables.sql | docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery 2>&1)
    TABLE_STATUS=$?

    if [ $TABLE_STATUS -eq 0 ]; then
        log_success "Tables created"
    else
        log_error "Failed to create tables"
        log_error "ClickHouse error output:"
        echo "$TABLE_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Troubleshooting:"
        log_info "  1. Check SQL file: services/monitoring/sql/01-create-tables.sql"
        log_info "  2. Common issues:"
        log_info "     - Table already exists (drop first with: DROP TABLE IF EXISTS ...)"
        log_info "     - Syntax errors in SQL"
        log_info "     - Insufficient permissions"
        log_info "  3. Verify database: docker exec ${CLICKHOUSE_CONTAINER_NAME} clickhouse-client -q 'SHOW DATABASES'"
        echo ""
        exit 1
    fi

    # Execute v1.7.0 audit columns migration FIRST (before views that reference these columns)
    SQL_FILE="services/monitoring/sql/06-add-audit-columns-v1.7.0.sql"
    if [ ! -f "$SQL_FILE" ]; then
        log_error "SQL migration file not found: $SQL_FILE"
        log_info "This file is required for v1.7.0 audit columns (PII classification + browser fingerprinting)"
        exit 1
    fi

    log_info "Adding v1.7.0 audit columns (PII classification + browser fingerprinting)..."
    AUDIT_OUTPUT=$(cat "$SQL_FILE" | docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery 2>&1)
    AUDIT_STATUS=$?

    if [ $AUDIT_STATUS -eq 0 ]; then
        log_success "Audit columns added successfully"
    else
        log_error "Failed to add audit columns"
        log_error "ClickHouse error output:"
        echo "$AUDIT_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Troubleshooting:"
        log_info "  1. Check SQL file: services/monitoring/sql/06-add-audit-columns-v1.7.0.sql"
        log_info "  2. Common issues:"
        log_info "     - Columns already exist (migration idempotent with IF NOT EXISTS)"
        log_info "     - Syntax errors in ALTER TABLE statements"
        log_info "     - Target table does not exist"
        echo ""
        exit 1
    fi

    # Execute v1.8.1 language detection migration
    SQL_FILE="services/monitoring/sql/07-add-language-detection-v1.8.1.sql"
    if [ ! -f "$SQL_FILE" ]; then
        log_error "SQL migration file not found: $SQL_FILE"
        log_info "This file is required for v1.8.1 language detection feature"
        exit 1
    fi

    log_info "Adding v1.8.1 language detection column..."
    LANG_OUTPUT=$(cat "$SQL_FILE" | docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery 2>&1)
    LANG_STATUS=$?

    if [ $LANG_STATUS -eq 0 ]; then
        log_success "Language detection column added successfully"
    else
        log_error "Failed to add language detection column"
        log_error "ClickHouse error output:"
        echo "$LANG_OUTPUT" | sed 's/^/    /'
        echo ""
        log_info "Troubleshooting:"
        log_info "  1. Check SQL file: services/monitoring/sql/07-add-language-detection-v1.8.1.sql"
        log_info "  2. Common issues:"
        log_info "     - Column already exists (migration idempotent with IF NOT EXISTS)"
        log_info "     - Syntax errors in ALTER TABLE statement"
        log_info "     - Target table does not exist"
        echo ""
        exit 1
    fi

    # Check if views already exist (created by Docker entrypoint)
    log_info "Checking views..."
    VIEW_COUNT=$(docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "SELECT COUNT(*) FROM system.tables WHERE database = '${CLICKHOUSE_DB}' AND name LIKE 'v_%'" 2>/dev/null | tr -d ' ')

    if [ "$VIEW_COUNT" -ge 2 ]; then
        log_info "Views already created (Docker entrypoint initialized them)"
        log_info "Verifying view schema compatibility..."
        VIEW_SCHEMA=$(docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "SHOW CREATE VIEW ${CLICKHOUSE_DB}.v_grafana_prompts_table" 2>&1)
        VIEW_SCHEMA_STATUS=$?

        if [ $VIEW_SCHEMA_STATUS -ne 0 ]; then
            log_warning "Unable to read existing view definition (status $VIEW_SCHEMA_STATUS). Recreating views..."
            docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "DROP VIEW IF EXISTS ${CLICKHOUSE_DB}.v_grafana_prompts_table" >/dev/null 2>&1 || true
            docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "DROP VIEW IF EXISTS ${CLICKHOUSE_DB}.v_malice_index_timeseries" >/dev/null 2>&1 || true
            docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "DROP VIEW IF EXISTS ${CLICKHOUSE_DB}.events_summary_realtime" >/dev/null 2>&1 || true
            VIEW_COUNT=0
        elif echo "$VIEW_SCHEMA" | grep -q "pii_sanitized"; then
            log_success "Existing views are compatible with v1.7.0 schema"
        else
            log_warning "Existing views are outdated (missing v1.7.0 audit columns). Recreating..."
            docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "DROP VIEW IF EXISTS ${CLICKHOUSE_DB}.v_grafana_prompts_table" >/dev/null 2>&1 || true
            docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "DROP VIEW IF EXISTS ${CLICKHOUSE_DB}.v_malice_index_timeseries" >/dev/null 2>&1 || true
            docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "DROP VIEW IF EXISTS ${CLICKHOUSE_DB}.events_summary_realtime" >/dev/null 2>&1 || true
            VIEW_COUNT=0
        fi
    else
        log_info "Creating views..."
        VIEW_OUTPUT=$(cat services/monitoring/sql/02-create-views.sql | docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery 2>&1)
        VIEW_STATUS=$?

        if [ $VIEW_STATUS -eq 0 ]; then
            log_success "Views created"
        else
            log_error "Failed to create views"
            log_error "ClickHouse error output:"
            echo "$VIEW_OUTPUT" | sed 's/^/    /'
            echo ""
            log_info "Troubleshooting:"
            log_info "  1. Check SQL file: services/monitoring/sql/02-create-views.sql"
            log_info "  2. Common issues:"
            log_info "     - View already exists (drop first with: DROP VIEW IF EXISTS ...)"
            log_info "     - Referenced tables do not exist (check previous step)"
            log_info "     - Syntax errors in view definition"
            log_info "  3. Check existing views: docker exec ${CLICKHOUSE_CONTAINER_NAME} clickhouse-client -q 'SHOW TABLES FROM ${CLICKHOUSE_DB}'"
            echo ""
            exit 1
        fi
    fi

    # Check if false positive reports table exists
    log_info "Checking false positive reports table..."
    FP_EXISTS=$(docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "EXISTS TABLE false_positive_reports" 2>/dev/null | tr -d ' ')

    if [ "$FP_EXISTS" = "1" ]; then
        log_success "False positive reports table already exists (Docker entrypoint initialized it)"
    else
        log_info "Creating false positive reports table..."
        FP_OUTPUT=$(cat services/monitoring/sql/03-false-positives.sql | docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery 2>&1)
        FP_STATUS=$?

        if [ $FP_STATUS -eq 0 ]; then
            log_success "False positive reports table created"
        else
            log_error "Failed to create false positive reports table"
            log_error "ClickHouse error output:"
            echo "$FP_OUTPUT" | sed 's/^/    /'
            echo ""
            log_info "Troubleshooting:"
            log_info "  1. Check SQL file: services/monitoring/sql/03-false-positives.sql"
            log_info "  2. Common issues:"
            log_info "     - Table/view already exists (drop first with: DROP TABLE/VIEW IF EXISTS ...)"
            log_info "     - Syntax errors in SQL"
            log_info "     - Database does not exist"
            log_info "  3. List all objects: docker exec ${CLICKHOUSE_CONTAINER_NAME} clickhouse-client -q 'SHOW TABLES FROM ${CLICKHOUSE_DB}'"
            echo ""
            exit 1
        fi
    fi

    # Check if retention config table exists
    log_info "Checking retention config table..."
    RETENTION_EXISTS=$(docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "EXISTS TABLE retention_config" 2>/dev/null | tr -d ' ')

    if [ "$RETENTION_EXISTS" = "1" ]; then
        log_success "Retention config table already exists (Docker entrypoint initialized it)"
    else
        log_info "Creating retention config table..."
        RETENTION_OUTPUT=$(cat services/monitoring/sql/05-retention-config.sql | docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery 2>&1)
        RETENTION_STATUS=$?

        if [ $RETENTION_STATUS -eq 0 ]; then
            log_success "Retention config table created"
        else
            log_error "Failed to create retention config table"
            log_error "ClickHouse error output:"
            echo "$RETENTION_OUTPUT" | sed 's/^/    /'
            echo ""
            log_info "Troubleshooting:"
            log_info "  1. Check SQL file: services/monitoring/sql/05-retention-config.sql"
            log_info "  2. Common issues:"
            log_info "     - Table already exists (drop first with: DROP TABLE IF EXISTS ...)"
            log_info "     - Syntax errors in SQL"
            log_info "     - Database does not exist"
            log_info "  3. List all objects: docker exec ${CLICKHOUSE_CONTAINER_NAME} clickhouse-client -q 'SHOW TABLES FROM ${CLICKHOUSE_DB}'"
            log_info "  4. Verify columns: docker exec ${CLICKHOUSE_CONTAINER_NAME} clickhouse-client -q 'DESCRIBE TABLE ${CLICKHOUSE_DB}.events_processed'"
            echo ""
            exit 1
        fi
    fi

    # Verify v1.7.0 audit columns (9 columns: PII classification + browser fingerprinting)
    log_info "Verifying v1.7.0 audit columns..."
    AUDIT_COLUMNS=(
        "pii_sanitized"
        "pii_types_detected"
        "pii_entities_count"
        "client_id"
        "browser_name"
        "browser_version"
        "os_name"
        "browser_language"
        "browser_timezone"
    )

    MISSING_COLUMNS=0
    MISSING_COLUMN_NAMES=()
    for COLUMN in "${AUDIT_COLUMNS[@]}"; do
        COLUMN_EXISTS=$(docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client \
            --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
            --database "$CLICKHOUSE_DB" \
            -q "SELECT count() FROM system.columns WHERE database = '${CLICKHOUSE_DB}' AND table = 'events_processed' AND name = '${COLUMN}'" \
            2>/dev/null | tr -d ' ')

        if [ "$COLUMN_EXISTS" = "0" ]; then
            log_warning "Column '${COLUMN}' missing in events_processed"
            MISSING_COLUMNS=$((MISSING_COLUMNS + 1))
            MISSING_COLUMN_NAMES+=("$COLUMN")
        fi
    done

    if [ $MISSING_COLUMNS -gt 0 ]; then
        log_warning "$MISSING_COLUMNS audit column(s) missing - may indicate incomplete migration"
        log_info "Missing columns: ${MISSING_COLUMN_NAMES[*]}"
        echo ""
        log_info "Re-running 06-add-audit-columns-v1.7.0.sql to fix..."

        # Re-run migration (idempotent with IF NOT EXISTS)
        RERUN_OUTPUT=$(cat "services/monitoring/sql/06-add-audit-columns-v1.7.0.sql" | \
            docker exec -i "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client \
            --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
            --multiquery 2>&1)
        RERUN_STATUS=$?

        if [ $RERUN_STATUS -eq 0 ]; then
            log_success "Audit columns migration re-applied successfully"

            # Verify again
            VERIFY_COUNT=0
            for COLUMN in "${AUDIT_COLUMNS[@]}"; do
                COLUMN_EXISTS=$(docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client \
                    --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
                    --database "$CLICKHOUSE_DB" \
                    -q "SELECT count() FROM system.columns WHERE database = '${CLICKHOUSE_DB}' AND table = 'events_processed' AND name = '${COLUMN}'" \
                    2>/dev/null | tr -d ' ')
                if [ "$COLUMN_EXISTS" = "1" ]; then
                    VERIFY_COUNT=$((VERIFY_COUNT + 1))
                fi
            done

            if [ $VERIFY_COUNT -eq 9 ]; then
                log_success "All 9 audit columns now present after re-run"
            else
                log_error "Migration re-run completed but columns still missing ($VERIFY_COUNT/9)"
                log_error "ClickHouse error output:"
                echo "$RERUN_OUTPUT" | sed 's/^/    /'
                echo ""
                exit 1
            fi
        else
            log_error "Failed to re-run audit columns migration"
            log_error "ClickHouse error output:"
            echo "$RERUN_OUTPUT" | sed 's/^/    /'
            echo ""
            exit 1
        fi
    else
        log_success "All 9 audit columns present"
        log_info "v1.7.0 audit columns: pii_sanitized, pii_types_detected, pii_entities_count, client_id, browser_name, browser_version, os_name, browser_language, browser_timezone"
    fi

    echo ""

    # Verify installation
    log_info "Verifying database structure..."
    TABLE_COUNT=$(docker exec "$CLICKHOUSE_CONTAINER_NAME" clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" -q "SHOW TABLES" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$TABLE_COUNT" -ge 7 ]; then
        log_success "ClickHouse initialized successfully ($TABLE_COUNT tables/views)"
    else
        log_warning "Database created but table count is unexpected: $TABLE_COUNT (expected ≥7)"
    fi

    echo ""
}

# Initialize Grafana
initialize_grafana() {
    print_header "Initializing Grafana"

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
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${GRAFANA_PORT}/api/health" | grep -q "200"; then
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
    if docker exec "$GRAFANA_CONTAINER_NAME" grafana cli admin reset-admin-password "$GRAFANA_PASSWORD" >/dev/null 2>&1; then
        log_success "Admin password configured"
    else
        log_warning "Failed to set admin password (may already be set correctly)"
    fi

    # Verify datasource provisioning
    log_info "Verifying ClickHouse datasource..."
    sleep 5
    DATASOURCE_CHECK=$(curl -s -u admin:"$GRAFANA_PASSWORD" "http://localhost:${GRAFANA_PORT}/api/datasources/name/ClickHouse" 2>/dev/null)
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

# Initialize Presidio PII API
initialize_presidio() {
    print_header "Initializing Presidio PII API"

    log_info "Waiting for Presidio to be ready..."

    # Wait for Presidio health endpoint
    RETRY_COUNT=0
    MAX_RETRIES=15
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:5001/health >/dev/null 2>&1; then
            log_success "Presidio is ready"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            sleep 2
        else
            log_warning "Presidio health check timed out (may still be loading models)"
            log_info "Check logs: docker logs vigil-presidio-pii"
            return 1
        fi
    done

    # Verify recognizers loaded
    log_info "Verifying custom recognizers..."
    HEALTH_RESPONSE=$(curl -s http://localhost:5001/health 2>/dev/null || echo "{}")

    if echo "$HEALTH_RESPONSE" | grep -q "recognizers_loaded"; then
        RECOGNIZER_COUNT=$(echo "$HEALTH_RESPONSE" | grep -o '"recognizers_loaded":[0-9]*' | grep -o '[0-9]*')
        if [ "$RECOGNIZER_COUNT" -ge 4 ]; then
            log_success "Custom Polish recognizers loaded ($RECOGNIZER_COUNT)"
        else
            log_warning "Only $RECOGNIZER_COUNT recognizers loaded (expected ≥4)"
        fi
    else
        log_warning "Could not verify recognizers (API may still be initializing)"
    fi

    # Verify spaCy models
    if echo "$HEALTH_RESPONSE" | grep -q "spacy_models"; then
        log_success "spaCy models loaded (en, pl)"
    else
        log_warning "spaCy model status unknown"
    fi

    # Verify SmartPersonRecognizer (v1.8.1+)
    if echo "$HEALTH_RESPONSE" | grep -q "SmartPersonRecognizer"; then
        log_success "SmartPersonRecognizer loaded (0% false positives for AI models)"
    else
        log_warning "SmartPersonRecognizer status unknown (may still be initializing)"
    fi

    echo ""
}

# Initialize Language Detection Service
initialize_language_detector() {
    print_header "Initializing Language Detection Service"

    log_info "Waiting for Language Detector to be ready..."

    # Wait for Language Detector health endpoint
    RETRY_COUNT=0
    MAX_RETRIES=10
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:5002/health >/dev/null 2>&1; then
            log_success "Language Detector is ready"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            sleep 2
        else
            log_warning "Language Detector health check timed out"
            log_info "Check logs: docker logs vigil-language-detector"
            return 1
        fi
    done

    # Verify supported languages
    log_info "Verifying language detection..."
    HEALTH_RESPONSE=$(curl -s http://localhost:5002/health 2>/dev/null || echo "{}")

    if echo "$HEALTH_RESPONSE" | grep -q "language-detector"; then
        log_success "Language detection service operational"
    else
        log_warning "Could not verify language detection service"
    fi

    echo ""
}

# Install Test Dependencies
install_test_dependencies() {
    print_header "Installing Test Dependencies"

    log_info "Installing Vitest and test dependencies for services/workflow..."

    # Check if we're in the correct directory
    if [ ! -f "services/workflow/package.json" ]; then
        log_error "services/workflow/package.json not found"
        log_error "Please run this script from the Vigil Guard root directory"
        exit 1
    fi

    # Install dependencies in services/workflow
    cd services/workflow

    # Clean install to ensure all devDependencies are installed
    log_info "Running npm install with devDependencies..."
    if npm install --include=dev; then
        log_success "Test dependencies installed successfully"

        # Verify vitest is installed
        if [ -d "node_modules/vitest" ]; then
            VITEST_VERSION=$(npx vitest --version 2>/dev/null | head -1 || echo "unknown")
            log_success "Vitest installed: $VITEST_VERSION"
        else
            log_warning "Vitest package not found after installation"
            log_info "This may cause test failures. Try: cd services/workflow && npm install"
        fi
    else
        log_error "Failed to install test dependencies"
        log_info "You can install manually later with:"
        log_info "  cd services/workflow && npm install"
    fi

    # Return to root directory
    cd ../..

    echo ""
}

# Verify services
verify_services() {
    print_header "Verifying Services"

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

    # Check Presidio PII API
    log_info "Checking Presidio PII API..."
    if docker-compose ps presidio-pii-api | grep -q "Up"; then
        if curl -s http://localhost:5001/health >/dev/null 2>&1; then
            log_success "Presidio PII API is running on port 5001"
        else
            log_warning "Presidio container is up but not responding yet"
            all_healthy=0
        fi
    else
        log_error "Presidio PII API is not running"
        all_healthy=0
    fi

    # Check Language Detector
    log_info "Checking Language Detection Service..."
    if docker-compose ps language-detector | grep -q "Up"; then
        if curl -s http://localhost:5002/health >/dev/null 2>&1; then
            log_success "Language Detector is running on port 5002"
        else
            log_warning "Language Detector container is up but not responding yet"
            all_healthy=0
        fi
    else
        log_error "Language Detector is not running"
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
    if [ ! -f .env ]; then
        log_error ".env file not found - cannot display summary"
        log_error "Run: cp config/.env.example .env && ./install.sh"
        exit 1
    fi

    FRONTEND_PORT=$(grep "^FRONTEND_PORT=" .env | cut -d'=' -f2)
    BACKEND_PORT=$(grep "^BACKEND_PORT=" .env | cut -d'=' -f2)
    N8N_PORT=$(grep "^N8N_PORT=" .env | cut -d'=' -f2)
    GRAFANA_PORT=$(grep "^GRAFANA_PORT=" .env | cut -d'=' -f2)
    CLICKHOUSE_HTTP_PORT=$(grep "^CLICKHOUSE_HTTP_PORT=" .env | cut -d'=' -f2)
    CLICKHOUSE_USER=$(grep "^CLICKHOUSE_USER=" .env | cut -d'=' -f2)
    CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" .env | cut -d'=' -f2)
    CLICKHOUSE_DB=$(grep "^CLICKHOUSE_DB=" .env | cut -d'=' -f2)
    GF_SECURITY_ADMIN_PASSWORD=$(grep "^GF_SECURITY_ADMIN_PASSWORD=" .env | cut -d'=' -f2)

    FRONTEND_PORT=${FRONTEND_PORT:-5173}
    BACKEND_PORT=${BACKEND_PORT:-8787}
    N8N_PORT=${N8N_PORT:-5678}
    GRAFANA_PORT=${GRAFANA_PORT:-3001}
    CLICKHOUSE_HTTP_PORT=${CLICKHOUSE_HTTP_PORT:-8123}
    CLICKHOUSE_USER=${CLICKHOUSE_USER:-admin}
    # Password must be set in .env - no fallback for security
    if [ -z "$CLICKHOUSE_PASSWORD" ]; then
        log_error "CLICKHOUSE_PASSWORD empty in .env - cannot display summary"
        exit 1
    fi
    CLICKHOUSE_DB=${CLICKHOUSE_DB:-n8n_logs}
    # Grafana password must be set - no fallback for security
    if [ -z "$GF_SECURITY_ADMIN_PASSWORD" ]; then
        log_error "GF_SECURITY_ADMIN_PASSWORD empty in .env - cannot display summary"
        exit 1
    fi

    echo -e "${GREEN}All components have been installed and started!${NC}"
    echo ""
    echo "Access points:"
    echo -e "  ${BLUE}•${NC} Web UI:            ${GREEN}http://localhost:${FRONTEND_PORT}/ui${NC}"
    echo -e "  ${BLUE}•${NC} Web UI API:        ${GREEN}http://localhost:${BACKEND_PORT}/api${NC}"
    echo -e "  ${BLUE}•${NC} n8n Workflow:      ${GREEN}http://localhost:${N8N_PORT}${NC}"
    echo -e "  ${BLUE}•${NC} Grafana Dashboard: ${GREEN}http://localhost:${GRAFANA_PORT}${NC}"
    echo -e "  ${BLUE}•${NC} ClickHouse HTTP:   ${GREEN}http://localhost:${CLICKHOUSE_HTTP_PORT}${NC}"
    echo -e "  ${BLUE}•${NC} Presidio PII API:  ${GREEN}http://localhost:5001${NC}"
    echo -e "  ${BLUE}•${NC} Prompt Guard API:  ${GREEN}http://localhost:8000${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Auto-Generated Credentials:${NC}"
    echo ""
    echo -e "  ${GREEN}Web UI:${NC}"
    echo -e "    Username: ${BLUE}admin${NC}"
    echo -e "    Password: ${BLUE}${WEB_UI_ADMIN_PASSWORD:-[see .env file]}${NC} (from .env: WEB_UI_ADMIN_PASSWORD)"
    echo -e "    ${YELLOW}⚠️  System will force password change on first login${NC}"
    echo ""
    echo -e "  ${GREEN}Grafana:${NC}"
    echo -e "    Username: ${BLUE}admin${NC}"
    echo -e "    Password: ${BLUE}${GF_SECURITY_ADMIN_PASSWORD:-[see .env file]}${NC} (from .env: GF_SECURITY_ADMIN_PASSWORD)"
    echo -e "    Datasource: ${GREEN}ClickHouse (auto-configured)${NC}"
    echo -e "    Dashboard: ${GREEN}Vigil (auto-imported)${NC}"
    echo ""
    echo -e "  ${GREEN}ClickHouse:${NC}"
    echo -e "    Username: ${BLUE}${CLICKHOUSE_USER:-admin}${NC}"
    echo -e "    Password: ${BLUE}${CLICKHOUSE_PASSWORD:-[see .env file]}${NC}"
    echo -e "    Database: ${BLUE}${CLICKHOUSE_DB:-n8n_logs}${NC}"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ SECURE INSTALLATION COMPLETE${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BLUE}PII Detection (NEW v1.6):${NC}"
    echo -e "  • Provider: ${GREEN}Microsoft Presidio${NC}"
    echo -e "  • Entity Types: ${GREEN}50+ (including Polish: PESEL, NIP, REGON, ID Card)${NC}"
    echo -e "  • NLP Models: ${GREEN}spaCy (en_core_web_sm, pl_core_news_sm)${NC}"
    echo -e "  • Custom Recognizers: ${GREEN}4 Polish PII types with checksum validation${NC}"
    echo -e "  • Fallback: ${GREEN}Legacy regex (pii.conf) if Presidio offline${NC}"
    echo -e "  • Performance: ${GREEN}<200ms detection, <10% false positives${NC}"
    echo ""
    echo -e "${BLUE}All services are using UNIQUE CRYPTOGRAPHIC PASSWORDS${NC}"
    echo -e "${BLUE}No default credentials are present in the system${NC}"
    echo ""
    echo -e "${YELLOW}📋 Important Notes:${NC}"
    echo ""
    echo -e "  ${GREEN}1. ALL Passwords Are Auto-Generated:${NC}"
    echo -e "     • ${BLUE}Web UI${NC}: Auto-generated (displayed above)"
    echo -e "     • ${BLUE}Grafana${NC}: Auto-generated (displayed above)"
    echo -e "     • ${BLUE}ClickHouse${NC}: Auto-generated (displayed above)"
    echo -e "     • ${BLUE}n8n${NC}: Set via account creation wizard on first access"
    echo ""
    echo -e "  ${GREEN}2. Password Security:${NC}"
    echo -e "     • All passwords are ${BLUE}32+ characters${NC} (cryptographically secure)"
    echo -e "     • Web UI forces password change on first login"
    echo -e "     • Passwords stored in ${BLUE}.env${NC} file (keep secure!)"
    echo -e "     • If lost, regenerate by running: ${BLUE}./install.sh${NC}"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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

    # VERIFICATION: Ensure passwords match between .env and containers
    log_info "Verifying password synchronization..."
    CONTAINER_PASSWORD=$(docker exec vigil-web-ui-backend printenv WEB_UI_ADMIN_PASSWORD 2>/dev/null || echo "")
    ENV_PASSWORD=$(grep "^WEB_UI_ADMIN_PASSWORD=" .env | cut -d'=' -f2)

    if [ "$CONTAINER_PASSWORD" = "$ENV_PASSWORD" ]; then
        log_success "Password verification: .env and container match ✓"
    else
        log_warning "Password mismatch detected:"
        log_warning "  .env file: ${ENV_PASSWORD}"
        log_warning "  Container: ${CONTAINER_PASSWORD}"
        log_warning "  Run: docker-compose restart web-ui-backend"
    fi
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

    # Check if this is a re-run on existing installation
    if check_existing_installation; then
        log_info "Re-running installation on existing system (update mode)"
    else
        log_info "Fresh installation detected"
    fi
    echo ""

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
    cleanup_docker_cache
    start_all_services
    initialize_clickhouse
    initialize_presidio
    initialize_language_detector
    initialize_grafana
    install_test_dependencies
    verify_services
    show_summary

    # Save installation state for idempotency tracking
    save_install_state
}

# Run main function
main
