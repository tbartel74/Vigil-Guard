# Multi-stage build for production

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Note: Using npm install instead of npm ci due to npm workspaces
# (package-lock.json is at monorepo root, not in workspace)
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Note: Using npm install instead of npm ci due to npm workspaces
RUN npm install --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Create necessary directories
RUN mkdir -p /config /app/logs

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

# Run as non-root user
USER node

# Start production server
CMD ["node", "dist/server.js"]
