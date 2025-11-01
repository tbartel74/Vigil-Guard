# Vigil Guard - Language Detection Service
# Lightweight Flask service using langdetect for accurate language detection
# Handles Polish text without diacritics

FROM python:3.11-slim

LABEL maintainer="Vigil Guard"
LABEL description="Language detection microservice using langdetect"

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app.py .

# Create non-root user
RUN useradd -m -u 1001 langdetect && \
    chown -R langdetect:langdetect /app

USER langdetect

# Expose port
EXPOSE 5002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5002/health')"

# Run application
CMD ["python", "app.py"]
