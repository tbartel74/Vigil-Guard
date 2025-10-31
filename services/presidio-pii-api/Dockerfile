# Vigil Guard - Presidio PII API Dockerfile
# Python 3.11 with Microsoft Presidio and spaCy models
# Target size: <700 MB

FROM python:3.11-slim

LABEL maintainer="Vigil Guard Project"
LABEL description="Microsoft Presidio PII Detection API with Polish recognizers"
LABEL version="1.6.10"

# Install system dependencies (gcc needed for spaCy compilation)
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first (for Docker cache)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy models (latest compatible versions)
RUN python -m spacy download en_core_web_sm && \
    python -m spacy download pl_core_news_sm

# Copy application code
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

# Expose port
EXPOSE 5001

# Run FastAPI with uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]
