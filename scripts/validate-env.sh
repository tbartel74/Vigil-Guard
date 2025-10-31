#!/bin/bash

# Vigil Guard - Environment Variable Validation Script
# This script validates that critical environment variables meet security requirements
# Called by docker-compose healthcheck to prevent containers from starting with weak passwords

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    echo "Run: cp config/.env.example .env && ./install.sh"
    exit 1
fi

# Load environment variables from .env
set -a  # Automatically export all variables
source .env 2>/dev/null || {
    echo -e "${RED}ERROR: Failed to load .env file${NC}"
    exit 1
}
set +a

# Validation function for passwords
validate_password() {
    local var_name="$1"
    local password="${!var_name:-}"
    local min_length="${2:-32}"  # Default minimum length: 32 chars

    # Check if variable is set
    if [ -z "$password" ]; then
        echo -e "${RED}ERROR: $var_name is not set or empty${NC}"
        echo "Set this variable in .env file with a strong password (min ${min_length} characters)"
        return 1
    fi

    # Check minimum length
    if [ ${#password} -lt "$min_length" ]; then
        echo -e "${RED}ERROR: $var_name is too short (${#password} chars, minimum ${min_length})${NC}"
        echo "Generate a secure password with: openssl rand -base64 48 | tr -d '/+=\\n' | head -c ${min_length}"
        return 1
    fi

    # Check for default/weak passwords
    if echo "$password" | grep -qiE "admin123|password|change-me|changeme|default|test|demo"; then
        echo -e "${RED}ERROR: $var_name contains default or weak password${NC}"
        echo "Current value matches common weak password pattern"
        echo "Generate a secure password with: openssl rand -base64 48 | tr -d '/+=\\n' | head -c ${min_length}"
        return 1
    fi

    return 0
}

# Track validation failures
validation_failed=0

echo "Validating environment variables..."
echo ""

# Validate critical passwords
echo "Checking CLICKHOUSE_PASSWORD..."
if ! validate_password "CLICKHOUSE_PASSWORD" 32; then
    validation_failed=1
fi
echo ""

echo "Checking GF_SECURITY_ADMIN_PASSWORD..."
if ! validate_password "GF_SECURITY_ADMIN_PASSWORD" 32; then
    validation_failed=1
fi
echo ""

echo "Checking WEB_UI_ADMIN_PASSWORD..."
if ! validate_password "WEB_UI_ADMIN_PASSWORD" 32; then
    validation_failed=1
fi
echo ""

echo "Checking SESSION_SECRET..."
if ! validate_password "SESSION_SECRET" 64; then
    validation_failed=1
fi
echo ""

echo "Checking JWT_SECRET..."
if ! validate_password "JWT_SECRET" 48; then
    validation_failed=1
fi
echo ""

# N8N password is set via wizard, skip validation
# echo "Checking N8N_BASIC_AUTH_PASSWORD..."
# if ! validate_password "N8N_BASIC_AUTH_PASSWORD" 32; then
#     validation_failed=1
# fi
# echo ""

# Exit with appropriate code
if [ "$validation_failed" -eq 1 ]; then
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  VALIDATION FAILED - WEAK PASSWORDS DETECTED${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Docker containers will NOT start with weak passwords${NC}"
    echo ""
    echo "To fix:"
    echo "  1. Run: ./install.sh (auto-generates secure passwords)"
    echo "  2. Or manually edit .env with strong passwords"
    echo "  3. Then run: docker-compose up -d"
    echo ""
    exit 1
else
    echo "✓ All environment variables validated successfully"
    exit 0
fi
