#!/bin/bash

echo "🧹 Clearing all caches for frontend development..."

# Clear npm cache
echo "Clearing npm cache..."
npm cache clean --force

# Remove node_modules and package-lock.json
echo "Removing node_modules..."
rm -rf node_modules
rm -f package-lock.json

# Clear Vite cache
echo "Clearing Vite cache..."
rm -rf .vite
rm -rf dist
rm -rf node_modules/.vite

# Reinstall dependencies
echo "Reinstalling dependencies..."
npm install

# Set environment variable to disable caching
export VITE_NO_CACHE=true

echo "🚀 Starting development server with no-cache mode..."
npm run dev

echo "✅ No-cache development server started!"
echo "💡 Tip: Use Ctrl+Shift+R or Cmd+Shift+R to hard refresh browser"