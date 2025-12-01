# Heuristics Service (Branch A) - v2.0.0
FROM node:20-alpine AS builder

# Security: Update npm to fix CVE-2024-21538 (cross-spawn) and CVE-2025-64756 (glob)
RUN npm install -g npm@latest

# Build stage
WORKDIR /build

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src
COPY config ./config

# Production stage
FROM node:20-alpine

# Security: Update npm to fix CVE-2024-21538 (cross-spawn) and CVE-2025-64756 (glob)
RUN npm install -g npm@latest

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs config ./config

# Patterns directory will be mounted at runtime via docker-compose
# This allows dynamic pattern updates without rebuilding image
RUN mkdir -p /app/patterns && chown nodejs:nodejs /app/patterns

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5005/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start service
CMD ["node", "src/server.js"]