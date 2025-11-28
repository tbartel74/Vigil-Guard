# Multi-stage build for production

# Stage 1: Build
FROM node:20-alpine AS builder

# Security: Update npm to fix CVE-2024-21538 (cross-spawn) and CVE-2025-64756 (glob)
RUN npm install -g npm@latest

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine
WORKDIR /app

# Security: Update npm to fix CVE-2024-21538 (cross-spawn) and CVE-2025-64756 (glob)
RUN npm install -g npm@latest

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Create necessary directories with proper permissions
RUN mkdir -p /config /app/logs /app/data && \
    chown -R node:node /config /app

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

# Run as non-root user
USER node

# Start production server
CMD ["node", "dist/server.js"]
