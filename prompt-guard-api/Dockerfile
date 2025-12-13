FROM python:3.11-slim

WORKDIR /app

# Instalacja zależności systemowych dla healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalacja zależności Pythona
# Use requirements.lock for reproducible builds (pinned versions)
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock

# Keep requirements.txt for reference (development dependencies)
COPY requirements.txt .

# Create non-root user (Golden Rule: never run containers as root)
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Skopiuj kod
COPY app.py .

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Port
EXPOSE 8000

# Health check - use curl GET since FastAPI /health doesn't support HEAD
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/health || exit 1

# Uruchom
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
