#!/bin/bash
# =============================================================================
# Vigil Guard Plugin Build Script
# =============================================================================
# Purpose: Build Chrome extension with pre-configured bootstrap token
#
# This script:
# 1. Generates a fresh bootstrap token via API
# 2. Injects token into plugin configuration
# 3. Packages the extension for distribution
#
# Usage:
#   ./scripts/build-plugin.sh [OPTIONS]
#
# Options:
#   --token TOKEN    Use existing bootstrap token (skip API call)
#   --gui-url URL    Backend GUI URL (default: http://localhost:80/ui)
#   --output DIR     Output directory (default: ./dist/plugin)
#   --no-zip         Don't create zip archive
#   --help           Show this help message
#
# Requirements:
#   - jq (JSON processor)
#   - curl (HTTP client)
#   - zip (optional, for packaging)
#   - Valid JWT token in VIGIL_JWT_TOKEN env var (for API auth)
#
# Example:
#   export VIGIL_JWT_TOKEN="eyJhbGciOi..."
#   ./scripts/build-plugin.sh
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
GUI_URL="${VIGIL_GUI_URL:-http://localhost:80/ui}"
OUTPUT_DIR="./dist/plugin"
CREATE_ZIP=true
BOOTSTRAP_TOKEN=""
PLUGIN_SOURCE="./plugin/Chrome"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}=============================================${NC}"
    echo -e "${BLUE}  Vigil Guard Plugin Build Script${NC}"
    echo -e "${BLUE}=============================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Build Chrome extension with pre-configured bootstrap token"
    echo ""
    echo "Options:"
    echo "  --token TOKEN    Use existing bootstrap token (skip API generation)"
    echo "  --gui-url URL    Backend GUI URL (default: http://localhost:80/ui)"
    echo "  --output DIR     Output directory (default: ./dist/plugin)"
    echo "  --no-zip         Don't create zip archive"
    echo "  --help           Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  VIGIL_JWT_TOKEN  JWT token for API authentication (required for token generation)"
    echo "  VIGIL_GUI_URL    Alternative to --gui-url option"
    echo ""
    echo "Examples:"
    echo "  # Generate new bootstrap token and build"
    echo "  export VIGIL_JWT_TOKEN=\"eyJhbGciOi...\""
    echo "  $0"
    echo ""
    echo "  # Use existing token"
    echo "  $0 --token \"abc123xyz...\""
    echo ""
    echo "  # Custom output directory"
    echo "  $0 --output /path/to/output"
}

check_dependencies() {
    print_info "Checking dependencies..."

    local missing=()

    if ! command -v jq &> /dev/null; then
        missing+=("jq")
    fi

    if ! command -v curl &> /dev/null; then
        missing+=("curl")
    fi

    if [ "$CREATE_ZIP" = true ] && ! command -v zip &> /dev/null; then
        print_warning "zip not found - will skip archive creation"
        CREATE_ZIP=false
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing[*]}"
        echo "Install with: brew install ${missing[*]}"
        exit 1
    fi

    print_success "All dependencies available"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --token)
                BOOTSTRAP_TOKEN="$2"
                shift 2
                ;;
            --gui-url)
                GUI_URL="$2"
                shift 2
                ;;
            --output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --no-zip)
                CREATE_ZIP=false
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

generate_bootstrap_token() {
    if [ -n "$BOOTSTRAP_TOKEN" ]; then
        print_info "Using provided bootstrap token"
        return 0
    fi

    print_info "Generating new bootstrap token via API..."

    if [ -z "$VIGIL_JWT_TOKEN" ]; then
        print_error "VIGIL_JWT_TOKEN environment variable not set"
        echo ""
        echo "To generate a bootstrap token, you need to authenticate first:"
        echo "  1. Login to Vigil Guard Web UI"
        echo "  2. Get JWT token from browser DevTools (Application > Local Storage)"
        echo "  3. Export: export VIGIL_JWT_TOKEN=\"your-token\""
        echo ""
        echo "Or provide an existing bootstrap token with --token option"
        exit 1
    fi

    local api_url="${GUI_URL}/api/plugin-config/generate-bootstrap"

    local response
    response=$(curl -s -X POST "$api_url" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $VIGIL_JWT_TOKEN" \
        2>&1)

    if [ $? -ne 0 ]; then
        print_error "Failed to connect to API: $response"
        exit 1
    fi

    # Check for error response
    local error
    error=$(echo "$response" | jq -r '.error // empty')

    if [ -n "$error" ]; then
        local message
        message=$(echo "$response" | jq -r '.message // "Unknown error"')
        print_error "API error: $error - $message"
        exit 1
    fi

    # Extract token
    BOOTSTRAP_TOKEN=$(echo "$response" | jq -r '.token // empty')

    if [ -z "$BOOTSTRAP_TOKEN" ]; then
        print_error "Failed to extract bootstrap token from response"
        echo "Response: $response"
        exit 1
    fi

    local expires_at
    expires_at=$(echo "$response" | jq -r '.expiresAt // "unknown"')

    print_success "Bootstrap token generated"
    print_info "Token expires: $expires_at"
    print_warning "Token is valid for 24 hours - distribute plugin promptly"
}

prepare_output_directory() {
    print_info "Preparing output directory: $OUTPUT_DIR"

    # Create output directory
    mkdir -p "$OUTPUT_DIR"

    # Clean previous build
    rm -rf "${OUTPUT_DIR:?}"/*

    # Copy plugin source
    cp -r "$PROJECT_ROOT/$PLUGIN_SOURCE"/* "$OUTPUT_DIR/"

    print_success "Plugin source copied"
}

inject_bootstrap_token() {
    print_info "Injecting bootstrap token into plugin configuration..."

    local config_file="$OUTPUT_DIR/src/background/plugin-config.js"

    # Create plugin-config.js with injected token
    cat > "$config_file" << EOF
// =============================================================================
// Vigil Guard Plugin Configuration
// =============================================================================
// AUTO-GENERATED by build-plugin.sh - DO NOT EDIT MANUALLY
// Build timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
//
// This file contains pre-configured bootstrap token for automatic
// credential retrieval on first extension install.
// =============================================================================

export const PLUGIN_BUILD_CONFIG = {
  // Pre-injected bootstrap token (valid 24h from build time)
  bootstrapToken: '${BOOTSTRAP_TOKEN}',

  // GUI URL for API calls
  guiUrl: '${GUI_URL}',

  // Build metadata
  buildTimestamp: '$(date -u +"%Y-%m-%dT%H:%M:%SZ")',
  buildVersion: '$(cat "$PROJECT_ROOT/$PLUGIN_SOURCE/manifest.json" | jq -r '.version')'
};
EOF

    print_success "Configuration file created: src/background/plugin-config.js"

    # Update service-worker.js to import and use the config
    update_service_worker
}

update_service_worker() {
    local sw_file="$OUTPUT_DIR/src/background/service-worker.js"

    print_info "Updating service-worker.js to use build config..."

    # Create a modified service-worker that imports the build config
    # Insert import at the top after the initial comment block
    local temp_file=$(mktemp)

    # Read the file and inject import + auto-bootstrap logic
    awk '
    /^\/\/ Vigil Guard Browser Extension - Service Worker/ {
        print
        print "// BUILD CONFIG: Auto-generated bootstrap token"
        print "import { PLUGIN_BUILD_CONFIG } from '\''./plugin-config.js'\'';"
        print ""
        next
    }

    # Modify fetchConfigFromGUI to check build config first
    /async function fetchConfigFromGUI\(\)/ {
        print
        print "  // v2.0 BUILD-TIME INJECTION: Check for pre-configured bootstrap token"
        print "  if (PLUGIN_BUILD_CONFIG && PLUGIN_BUILD_CONFIG.bootstrapToken) {"
        print "    const stored = await chrome.storage.local.get('\''config'\'');"
        print "    if (!stored.config?.bootstrapComplete) {"
        print "      console.log('\''[Vigil Guard] Using build-time bootstrap token...'\'');"
        print "      await chrome.storage.local.set({ bootstrapToken: PLUGIN_BUILD_CONFIG.bootstrapToken });"
        print "    }"
        print "  }"
        print ""
        next
    }

    { print }
    ' "$sw_file" > "$temp_file"

    mv "$temp_file" "$sw_file"

    print_success "Service worker updated with auto-bootstrap"
}

create_zip_archive() {
    if [ "$CREATE_ZIP" = false ]; then
        print_info "Skipping zip archive creation (--no-zip)"
        return 0
    fi

    print_info "Creating zip archive for Chrome Web Store..."

    local version
    version=$(cat "$OUTPUT_DIR/manifest.json" | jq -r '.version')
    local zip_name="vigil-guard-plugin-v${version}.zip"
    local zip_path="$PROJECT_ROOT/dist/$zip_name"

    # Create dist directory if needed
    mkdir -p "$PROJECT_ROOT/dist"

    # Create zip from output directory
    (cd "$OUTPUT_DIR" && zip -r "$zip_path" . -x "*.DS_Store" -x "__MACOSX/*")

    print_success "Archive created: dist/$zip_name"

    # Print file size
    local size
    size=$(du -h "$zip_path" | cut -f1)
    print_info "Archive size: $size"
}

print_summary() {
    echo ""
    echo -e "${GREEN}=============================================${NC}"
    echo -e "${GREEN}  Build Complete!${NC}"
    echo -e "${GREEN}=============================================${NC}"
    echo ""
    echo "Output directory: $OUTPUT_DIR"
    echo ""
    echo "Distribution options:"
    echo "  1. Load unpacked from: $OUTPUT_DIR"
    echo "     (chrome://extensions > Developer mode > Load unpacked)"
    echo ""
    if [ "$CREATE_ZIP" = true ]; then
        echo "  2. Upload zip to Chrome Web Store"
        echo "     (https://chrome.google.com/webstore/devconsole)"
        echo ""
    fi
    echo "  3. Deploy via Chrome Enterprise (MDM)"
    echo "     (Use managed_schema.json for policy-based deployment)"
    echo ""
    print_warning "Bootstrap token expires in 24 hours!"
    print_warning "Users must install plugin before token expires."
    echo ""
}

# =============================================================================
# Main Script
# =============================================================================

main() {
    print_header

    # Change to project root
    cd "$PROJECT_ROOT"

    # Parse command line arguments
    parse_args "$@"

    # Check dependencies
    check_dependencies

    # Generate or validate bootstrap token
    generate_bootstrap_token

    # Prepare output directory
    prepare_output_directory

    # Inject bootstrap token
    inject_bootstrap_token

    # Create zip archive
    create_zip_archive

    # Print summary
    print_summary
}

main "$@"
