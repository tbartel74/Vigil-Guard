# Heuristics Service (Branch A) - v2.0.0

Fast, lightweight heuristics-based detection service for Vigil Guard's 3-Branch architecture.

## Overview

The Heuristics Service analyzes text for obfuscation techniques, structural anomalies, whisper/narrative patterns, and entropy anomalies. It operates independently and returns results in the standardized `branch_result` format for the Arbiter 2.0.

### Detection Mechanisms

1. **Obfuscation Detection** (Weight: 0.30)
   - Zero-width characters (18 types)
   - Homoglyph detection (56 mappings: Cyrillic, Greek, Arabic)
   - Base64/Hex encoding
   - Mixed script detection
   - Spacing anomalies

2. **Structure Detection** (Weight: 0.25)
   - Code fence markers (```)
   - Boundary markers (HTML/C-style comments, brackets)
   - Excessive newlines
   - Segmentation anomalies
   - Nested structures

3. **Whisper/Narrative Detection** (Weight: 0.30)
   - Whisper phrases (20+ patterns)
   - Divider patterns (20+ types)
   - Role-play markers (20+ patterns)
   - Question repetition
   - Narrative markers
   - Stage directions

4. **Entropy Detection** (Weight: 0.15)
   - Shannon entropy calculation
   - Bigram anomaly detection
   - Random segment identification
   - Perplexity scoring
   - Pattern repetition

## Performance Targets

- **P95 Latency:** <50ms
- **Target Latency:** 50ms
- **Degraded Rate:** <2%
- **Memory:** <256MB
- **CPU:** <0.5 core

## API Endpoints

### POST /analyze

Analyze text for heuristic patterns.

**Request:**
```json
{
  "text": "string (1-100000 chars)",
  "request_id": "uuid",
  "lang": "pl|en|null"
}
```

**Response (branch_result):**
```json
{
  "branch_id": "A",
  "name": "heuristics",
  "score": 73,
  "threat_level": "HIGH|MEDIUM|LOW",
  "confidence": 0.85,
  "features": {
    "obfuscation": {
      "zero_width_count": 5,
      "homoglyph_count": 3,
      "scripts_detected": ["Latin", "Cyrillic"],
      "base64_detected": false,
      "hex_detected": false,
      "mixed_scripts": ["Latin", "Cyrillic"],
      "spacing_anomalies": 2,
      "score": 65
    },
    "structure": {
      "boundary_anomalies": 2,
      "code_fence_count": 4,
      "excess_newlines": 8,
      "segmentation_score": 45,
      "nested_structures": 1,
      "score": 70
    },
    "whisper": {
      "whisper_patterns_found": ["Imagination/visualization technique"],
      "divider_count": 2,
      "roleplay_markers": ["Named jailbreak personas"],
      "open_question_repetition": 0,
      "narrative_markers": 3,
      "stage_directions": 0,
      "score": 85
    },
    "entropy": {
      "entropy_raw": 4.2,
      "entropy_normalized": 52,
      "bigram_anomaly_score": 30,
      "random_segments": 1,
      "perplexity_score": 45,
      "score": 45
    }
  },
  "explanations": [
    "Primary concern: whisper (score: 85)",
    "Found 3 whisper patterns across 2 types",
    "Detected 2 divider patterns",
    "Found 5 zero-width characters"
  ],
  "timing_ms": 32,
  "degraded": false
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "heuristics-service",
  "branch_id": "A",
  "version": "2.0.0",
  "timestamp": "2025-11-20T21:00:00.000Z"
}
```

### GET /metrics

Service metrics.

**Response:**
```json
{
  "requests_total": 1234,
  "latency_p95": 38,
  "degraded_rate": 0.012,
  "uptime_seconds": 3600
}
```

## Threat Levels

- **LOW** (0-39): Clean text with minimal suspicious patterns
- **MEDIUM** (40-69): Some concerning patterns detected
- **HIGH** (70-100): Multiple attack techniques detected

## Confidence Scoring

Base confidence: `0.6`
Signal bonus: `min(0.4, signal_count × 0.05)`
Range: `0.6 - 1.0`

## Installation

### Development

```bash
# Install dependencies
npm install

# Copy patterns from roadmap
mkdir -p config/patterns
cp -r ../../Roadmap/semantic-similarity/extracted-patterns/* config/patterns/

# Start development server
npm run dev

# Run tests
npm test
```

### Docker (Recommended)

```bash
# Build and run with docker-compose
docker-compose -f docker-compose.dev.yml up --build

# Or with main docker-compose (after integration)
docker-compose up vigil-heuristics
```

## Configuration

### Environment Variables

```bash
# Server
PORT=5005
NODE_ENV=production
LOG_LEVEL=info

# Detection Weights (must sum to 1.0)
WEIGHT_OBFUSCATION=0.30
WEIGHT_STRUCTURE=0.25
WEIGHT_WHISPER=0.30
WEIGHT_ENTROPY=0.15

# Thresholds
THRESHOLD_LOW_MAX=39
THRESHOLD_MEDIUM_MAX=69

# Obfuscation
ZERO_WIDTH_THRESHOLD=2
HOMOGLYPH_THRESHOLD=3
MIXED_SCRIPT_THRESHOLD=2
SPACING_ANOMALY_RATIO=0.1

# Structure
CODE_FENCE_THRESHOLD=3
BOUNDARY_THRESHOLD=5
NEWLINE_THRESHOLD=10
SEGMENTATION_RATIO=0.3

# Whisper/Narrative
WHISPER_WEIGHT_MULTIPLIER=1.0
DIVIDER_WEIGHT=70
ROLEPLAY_WEIGHT=65
QUESTION_REP_THRESHOLD=3

# Entropy
ENTROPY_ENABLED=true
SHANNON_THRESHOLD_LOW=3.5
SHANNON_THRESHOLD_HIGH=5.5
BIGRAM_ANOMALY_THRESHOLD=0.3

# Performance
TARGET_LATENCY_MS=50
CIRCUIT_BREAKER_ENABLED=true
CB_FAILURE_THRESHOLD=5
CB_RESET_TIMEOUT=30000
```

### Configuration Files

- `src/config/default.json` - Default configuration
- `config/patterns/` - Detection patterns (loaded from extracted-patterns)

## Pattern Sources

Patterns are extracted from existing Vigil Guard configurations:

- **Zero-width chars:** `normalize.conf` (41 characters)
- **Homoglyphs:** `normalize.conf` (18 mappings)
- **System markers:** `normalize.conf` (28 markers)
- **Whisper patterns:** Manual curation (20 patterns)
- **Divider patterns:** Manual curation (20 patterns)
- **Roleplay patterns:** Manual curation (20 patterns)

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test tests/integration/api.test.js

# Run with coverage
npm run test:coverage
```

### Test Scenarios

- ✅ Normal text (LOW threat)
- ✅ Zero-width obfuscation
- ✅ Code fence structures
- ✅ Whisper patterns
- ✅ Divider patterns
- ✅ Roleplay markers
- ✅ Mixed obfuscation (HIGH threat)
- ✅ Branch result contract validation

## Architecture

```
src/
├── server.js              # Express API server
├── config/
│   ├── index.js          # Config loader
│   └── default.json      # Default configuration
├── detectors/
│   ├── obfuscation.js    # Zero-width, homoglyphs, encoding
│   ├── structure.js      # Boundaries, fences, segmentation
│   ├── whisper.js        # Narrative techniques
│   └── entropy.js        # Shannon entropy, bigrams
├── scoring/
│   └── scorer.js         # Weighted scoring algorithm
├── utils/
│   ├── patterns.js       # Pattern loader
│   ├── unicode.js        # Script detection, entropy
│   └── logger.js         # Logging utility
└── middleware/
    └── validation.js     # Request validation
```

## Integration with Vigil Guard

This service is designed to run independently alongside:

- **Branch B:** Semantic Service (MiniLM embeddings + ClickHouse HNSW)
- **Branch C:** LLM Guard Service (Llama Guard 2 8B)

Results are combined by **Arbiter 2.0** in the n8n workflow.

### Arbiter Integration

```javascript
// Weighted combination
const combined =
  (heuristics.score × 0.30) +
  (semantic.score × 0.35) +
  (llm_guard.score × 0.35);

// Degradation handling
if (heuristics.degraded) weight_heuristics *= 0.1;

// Priority boosts
if (heuristics.threat_level === 'HIGH' && mixed_scripts.length > 0)
  score = Math.max(score, 70);
```

## Deployment Notes

- **Isolated Service:** Does NOT modify existing Vigil Guard services
- **No Database:** Stateless, pattern-based detection
- **Fast Startup:** <2 seconds to ready state
- **Horizontal Scaling:** Can run multiple instances
- **Graceful Degradation:** Returns `degraded: true` on errors

## Monitoring

Logs include:

- Request ID for tracing
- Score and threat level
- Timing (warn if >50ms)
- Error details on degradation

Example log:
```json
{
  "level": "info",
  "request_id": "abc-123",
  "score": 73,
  "threat_level": "HIGH",
  "msg": "Analysis completed"
}
```

## Roadmap

- [ ] Branch B: Semantic Service (MiniLM + ClickHouse)
- [ ] Branch C: LLM Guard Service (Llama Guard 2)
- [ ] n8n Workflow Integration (Arbiter 2.0)
- [ ] Shadow Mode Testing
- [ ] Performance Benchmarking
- [ ] Controlled Rollout (10% → 50% → 100%)

## License

Part of Vigil Guard project - MIT License