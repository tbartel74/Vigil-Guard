#!/bin/bash

# Uninstall Vigil Guard - Remove all containers, volumes, and data

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}Vigil Guard - Complete Uninstall${NC}"
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}WARNING: This will:${NC}"
echo "  • Stop all running services"
echo "  • Remove all Docker containers"
echo "  • Remove all Docker volumes (data will be lost)"
echo "  • Remove node_modules directories"
echo "  • Remove build artifacts"
echo "  • Remove the Docker network"
echo ""
echo -e "${RED}This action CANNOT be undone!${NC}"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " -r
echo

if [[ ! $REPLY == "yes" ]]; then
    echo -e "${GREEN}Uninstall cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting uninstall process...${NC}"
echo ""

# Stop and remove all services using main docker-compose
echo -e "${BLUE}[1/5]${NC} Stopping and removing all Vigil Guard services..."
docker-compose down -v 2>/dev/null
echo -e "${GREEN}✓${NC} All services removed"

# Remove Docker network
echo -e "${BLUE}[2/5]${NC} Removing Docker network..."
docker network rm Vigil_Net 2>/dev/null || echo "Network already removed"
echo -e "${GREEN}✓${NC} Docker network removed"

# Remove node_modules
echo -e "${BLUE}[3/5]${NC} Removing node_modules..."
rm -rf services/web-ui/frontend/node_modules services/web-ui/backend/node_modules
echo -e "${GREEN}✓${NC} node_modules removed"

# Remove build artifacts
echo -e "${BLUE}[4/5]${NC} Removing build artifacts..."
rm -rf services/web-ui/frontend/dist services/web-ui/backend/dist
echo -e "${GREEN}✓${NC} Build artifacts removed"

# Remove lock files (optional)
read -p "Remove package-lock.json files? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f services/web-ui/frontend/package-lock.json services/web-ui/backend/package-lock.json
    echo -e "${GREEN}✓${NC} Lock files removed"
fi

echo ""
echo -e "${BLUE}[5/5]${NC} Verifying cleanup..."

# Check for remaining containers
REMAINING=$(docker ps -a --filter "label=com.docker.compose.project=Vigil_Guard" --format "{{.Names}}" 2>/dev/null | wc -l)
if [ "$REMAINING" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} No containers remaining"
else
    echo -e "${YELLOW}⚠${NC} Found $REMAINING containers still present"
    docker ps -a --filter "label=com.docker.compose.project=Vigil_Guard"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Uninstall completed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "To reinstall, run: ./install.sh"
echo ""
