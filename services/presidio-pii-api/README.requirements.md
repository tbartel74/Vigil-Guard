# Python Dependencies Management

## Files

- **requirements.txt**: Development dependencies with version ranges (e.g., `spacy>=3.7.0,<4.0.0`)
- **requirements.lock**: Production dependencies with exact pinned versions (e.g., `spacy==3.7.5`)

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
docker-compose up -d vigil-presidio-pii

# Generate new lock file
docker exec vigil-presidio-pii pip freeze > services/presidio-pii-api/requirements.lock

# Rebuild with new dependencies
docker-compose build vigil-presidio-pii
docker-compose up -d vigil-presidio-pii
```

### Method 2: Local Python Environment

```bash
cd services/presidio-pii-api

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
# Example: presidio-analyzer==2.2.355 → presidio-analyzer==2.2.400

# Rebuild container (will install new version)
docker-compose build vigil-presidio-pii

# Generate new lock file
docker exec vigil-presidio-pii pip freeze > services/presidio-pii-api/requirements.lock
```

## spaCy Models

**Important**: This service uses offline spaCy models (`.whl` files in `models/` directory).

Model updates require:
1. Download new `.whl` from spaCy releases
2. Update `models/checksums.sha256`
3. Rebuild Docker image

See `services/presidio-pii-api/README.md` for model download instructions.

## Security Audits

Run security audits on dependencies:

```bash
# Using pip-audit (install if needed: pip install pip-audit)
pip-audit -r requirements.lock

# Using Docker
docker run --rm -v $(pwd):/src -w /src python:3.12-slim \
  bash -c "pip install pip-audit && pip-audit -r requirements.lock"
```

## Current Pinned Versions (as of lock generation)

- **presidio-analyzer**: 2.2.355
- **flask**: 3.1.0
- **spacy**: 3.7.5
- **pyyaml**: 6.0.3
- **pytest**: 8.4.2
- **pytest-cov**: (included)

See `requirements.lock` for complete list (60 packages total).
