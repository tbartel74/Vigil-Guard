# Vigil Guard - Presidio PII Detection API
# Multi-stage build for offline-capable PII detection
# Version: 1.6.0

# ============================================================================
# Stage 1: Builder - Install dependencies and models
# ============================================================================
FROM python:3.12-slim AS builder

# Install build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /build

# Copy and install Python dependencies (system-wide for multi-user access)
# Use requirements.lock for reproducible builds (pinned versions)
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock

# Keep requirements.txt for reference (development dependencies)
COPY requirements.txt .

# ⚡ OFFLINE CAPABILITY: Install spaCy models from local .whl files
COPY models/*.whl /tmp/models/
COPY models/checksums.sha256 /tmp/models/

# Verify checksums before installation
WORKDIR /tmp/models
RUN shasum -a 256 -c checksums.sha256 || \
    (echo "❌ ERROR: Checksum mismatch! Models may be corrupted." && exit 1)

# Install spaCy models from local .whl files (no internet required, system-wide)
RUN pip install --no-cache-dir *.whl

# Verify models are installed
RUN python3 -c "import spacy; spacy.load('en_core_web_sm'); spacy.load('pl_core_news_sm')" || \
    (echo "❌ ERROR: Failed to load spaCy models" && exit 1)

# ============================================================================
# Stage 2: Runtime - Minimal image with only necessary files
# ============================================================================
FROM python:3.12-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder stage (system-wide installation)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Create app directory
WORKDIR /app

# Copy application files
COPY app.py /app/
COPY config/ /app/config/
COPY validators/ /app/validators/
COPY custom_recognizers/ /app/custom_recognizers/
COPY docs/ /app/docs/

# Security: Create non-root user
RUN useradd -m -u 1001 -s /bin/bash presidio && \
    chown -R presidio:presidio /app

# Switch to non-root user
USER presidio

# Expose API port
EXPOSE 5001

# Health check - verify API is responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

# Metadata labels
LABEL org.opencontainers.image.title="Vigil Guard PII Detection API" \
      org.opencontainers.image.description="Microsoft Presidio-based PII detection with Polish language support" \
      org.opencontainers.image.version="1.6.0" \
      org.opencontainers.image.vendor="Vigil Guard" \
      com.vigil-guard.service="presidio-pii-api" \
      com.vigil-guard.offline="true" \
      com.vigil-guard.models="en_core_web_sm-3.7.1,pl_core_news_sm-3.7.0"

# Start Presidio Analyzer API via Flask wrapper
CMD ["python3", "/app/app.py"]
