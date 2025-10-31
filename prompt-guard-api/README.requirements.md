# Python Dependencies Management

## Files

- **requirements.txt**: Development dependencies with version ranges (e.g., `transformers>=4.46.0`)
- **requirements.lock**: Production dependencies with exact pinned versions (e.g., `transformers==4.57.1`)

## Why Two Files?

### requirements.txt (Development)
- Specifies **minimum versions** and **ranges**
- Allows flexibility for local development
- Used when you need to upgrade dependencies

### requirements.lock (Production)
- **Exact versions** for reproducible builds
- Used by Dockerfile for consistent deployments
- Generated from actual running container

## Updating Dependencies

### Method 1: From Running Container (Recommended)

```bash
# Start the container
docker-compose up -d vigil-prompt-guard-api

# Generate new lock file
docker exec vigil-prompt-guard-api pip freeze > prompt-guard-api/requirements.lock

# Rebuild with new dependencies
docker-compose build vigil-prompt-guard-api
docker-compose up -d vigil-prompt-guard-api
```

### Method 2: Local Python Environment

```bash
cd prompt-guard-api

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install from requirements.txt
pip install -r requirements.txt

# Generate lock file
pip freeze > requirements.lock

# Deactivate
deactivate
```

### Method 3: Update Specific Package

```bash
# Edit requirements.txt to update version range
# Example: transformers>=4.46.0 → transformers>=4.60.0

# Rebuild container (will install new version)
docker-compose build vigil-prompt-guard-api

# Generate new lock file
docker exec vigil-prompt-guard-api pip freeze > prompt-guard-api/requirements.lock
```

## Security Audits

Run security audits on dependencies:

```bash
# Using pip-audit (install if needed: pip install pip-audit)
pip-audit -r requirements.lock

# Using Docker
docker run --rm -v $(pwd):/src -w /src python:3.11-slim \
  bash -c "pip install pip-audit && pip-audit -r requirements.lock"
```

## Current Pinned Versions (as of lock generation)

- **fastapi**: 0.104.1
- **uvicorn**: 0.24.0
- **transformers**: 4.57.1
- **tokenizers**: 0.22.1
- **torch**: 2.9.0
- **numpy**: 1.26.4

See `requirements.lock` for complete list (35 packages total).
