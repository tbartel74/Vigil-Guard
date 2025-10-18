#!/bin/bash

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safe word splitting

# Stop all Vigil Guard services

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Stopping Vigil Guard Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Stop all services using main docker-compose
echo -e "${YELLOW}Stopping all Vigil Guard services...${NC}"
docker-compose down
echo -e "${GREEN}✓${NC} All services stopped"

echo ""
echo -e "${GREEN}All services stopped successfully!${NC}"
echo ""
echo "To start services again, run: ./install.sh"
echo "Or manually: docker-compose up -d"
echo "To remove all data and containers, run: ./scripts/uninstall.sh"
echo ""
