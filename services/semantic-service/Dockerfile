# ============================================================================
# Semantic Service Dockerfile
# Branch B: Semantic similarity detection using MiniLM embeddings
# Uses @xenova/transformers which auto-downloads model on first run
# ============================================================================

# ============================================================================
# Production image
FROM node:20-slim AS production

# Security: Update npm to fix CVE-2024-21538 (cross-spawn) and CVE-2025-64756 (glob)
RUN npm install -g npm@latest

# Labels
LABEL org.opencontainers.image.title="Semantic Service"
LABEL org.opencontainers.image.description="Semantic similarity detection using MiniLM embeddings"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Vigil Guard"

# Security: Run as non-root user
RUN groupadd -r semantic && useradd -r -g semantic semantic

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY src ./src

# ============================================================================
# DATA VOLUME USAGE EXPLANATION
# ============================================================================
# IMPORTANT: Embedding data is NOT included in this Docker image.
#
# Embeddings workflow:
# 1. During installation (install.sh), embeddings are imported to ClickHouse
#    from the ./data/embeddings.jsonl file via volume mount
# 2. Volume mount: ./data:/app/data:ro (read-only, install.sh use only)
# 3. At runtime, this service reads embeddings from ClickHouse database,
#    NOT from the filesystem
# 4. The ./data volume is not needed after initial installation
#
# Why this design?
# - Keeps Docker image small (embeddings are ~500MB+)
# - Centralizes embedding storage in ClickHouse (single source of truth)
# - Allows embedding updates without rebuilding Docker image
# - Enables fast similarity queries via ClickHouse vector functions
# ============================================================================

# Create model cache directory
RUN mkdir -p /app/models && chown -R semantic:semantic /app/models

# Environment
ENV NODE_ENV=production
ENV PORT=5006
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 5006

# Change ownership
RUN chown -R semantic:semantic /app

# Switch to non-root user
USER semantic

# Start server
CMD ["node", "src/server.js"]

# ============================================================================
# Development stage (for local development with hot reload)
FROM node:20-slim AS development

# Security: Update npm to fix CVE-2024-21538 (cross-spawn) and CVE-2025-64756 (glob)
RUN npm install -g npm@latest

WORKDIR /app

# Install all dependencies (including dev)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Create model cache directory
RUN mkdir -p /app/models

# Environment
ENV NODE_ENV=development
ENV PORT=5006
ENV HOST=0.0.0.0
ENV LOG_PRETTY=true

EXPOSE 5006

CMD ["npm", "run", "dev"]
