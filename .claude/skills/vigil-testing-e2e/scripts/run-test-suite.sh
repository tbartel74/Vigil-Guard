#!/bin/bash
# Comprehensive test runner for Vigil Guard E2E tests
# Usage: ./run-test-suite.sh [suite-name|all]

set -euo pipefail

cd "$(dirname "$0")/../../.." # Navigate to services/workflow

SUITE="${1:-all}"

echo "========================================="
echo "Vigil Guard Test Suite Runner"
echo "========================================="
echo "Suite: $SUITE"
echo "Time: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Not in services/workflow directory${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Verify services are running
echo "Verifying services..."

if ! curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  n8n workflow may not be running${NC}"
    echo "   Start with: docker-compose up -d n8n"
fi

if ! docker exec vigil-clickhouse clickhouse-client -q "SELECT 1" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  ClickHouse may not be running${NC}"
    echo "   Start with: docker-compose up -d clickhouse"
fi

echo ""

# Run tests based on suite selection
case "$SUITE" in
  "all")
    echo "Running ALL test suites..."
    npm test
    ;;

  "smoke")
    echo "Running smoke tests (basic functionality)..."
    npm test -- smoke.test.js
    ;;

  "bypass")
    echo "Running bypass scenario tests (advanced attacks)..."
    npm test -- bypass-scenarios.test.js
    ;;

  "emoji")
    echo "Running emoji obfuscation tests..."
    npm test -- emoji-obfuscation.test.js
    ;;

  "false-positive" | "fp")
    echo "Running false positive prevention tests..."
    npm test -- false-positives.test.js
    ;;

  "owasp")
    echo "Running OWASP AITG test suites..."
    npm test -- --grep "OWASP"
    ;;

  "quick")
    echo "Running quick validation (smoke + false positives)..."
    npm test -- smoke.test.js false-positives.test.js
    ;;

  "watch")
    echo "Running in watch mode..."
    npm run test:watch
    ;;

  "coverage")
    echo "Running with coverage report..."
    npm run test:coverage
    ;;

  *)
    echo "Running custom test: $SUITE"
    npm test -- "$SUITE"
    ;;
esac

EXIT_CODE=$?

echo ""
echo "========================================="

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Tests PASSED${NC}"
else
    echo -e "${RED}❌ Tests FAILED${NC}"
    echo ""
    echo "Debugging tips:"
    echo "1. Check test output for specific failures"
    echo "2. Verify patterns in rules.config.json via GUI"
    echo "3. Test manually in n8n chat: http://localhost:5678"
    echo "4. Check ClickHouse logs for detection details"
fi

echo "========================================="

exit $EXIT_CODE
