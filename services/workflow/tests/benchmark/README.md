# Pattern_Matching_Engine Benchmark Suite

Benchmark suite for measuring Pattern_Matching_Engine performance before and after optimizations.

## Target

**Faza 2.2 Goal:** Reduce P95 latency by ≥20% through regex pre-compilation, caching, and early exit optimization.

## Quick Start

### 1. Prerequisites

- n8n workflow running at `http://localhost:5678`
- Workflow webhook active: `http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1`
- Test fixtures available at `../fixtures/malicious-prompts.json`

### 2. Run Benchmark (BEFORE optimization)

```bash
# Rollback to pre-optimization version
cp ../workflows/backup/Vigil-Guard-v1.3.json.before_2.2_* ../workflows/Vigil-Guard-v1.3.json

# Reimport workflow in n8n UI

# Run benchmark
node pattern-engine-benchmark.js --label="before-optimization" --output=results-before.json
```

### 3. Run Benchmark (AFTER optimization)

```bash
# Ensure optimized workflow is active (already applied)

# Run benchmark
node pattern-engine-benchmark.js --label="after-optimization" --output=results-after.json
```

### 4. Compare Results

```bash
node pattern-engine-benchmark.js --compare=results-before.json,results-after.json
```

## Usage

### Basic Usage

```bash
node pattern-engine-benchmark.js [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--samples=N` | Number of samples to test | 100 |
| `--webhook=URL` | Webhook URL | http://localhost:5678/webhook/... |
| `--output=FILE` | Output JSON file | benchmark-results.json |
| `--warmup=N` | Number of warmup requests | 10 |
| `--label=TEXT` | Label for this benchmark run | timestamp |
| `--compare=FILE1,FILE2` | Compare two benchmark results | - |

### Examples

```bash
# Run with 200 samples
node pattern-engine-benchmark.js --samples=200

# Custom webhook URL
node pattern-engine-benchmark.js --webhook=http://localhost:5678/webhook/custom-id

# Save to custom file
node pattern-engine-benchmark.js --output=my-results.json

# Run with label
node pattern-engine-benchmark.js --label="production-load-test"

# Compare results
node pattern-engine-benchmark.js --compare=before.json,after.json
```

## Output

### Console Output

```
🎯 Pattern_Matching_Engine Benchmark Suite

Configuration:
  Samples: 100
  Warmup: 10
  Webhook: http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1
  Output: benchmark-results.json
  Label: 2025-10-13T10:30:00.000Z

✅ Loaded 50 test prompts from fixtures

🔥 Warming up (cache population)...
  ✅ Warmup complete (10 requests)

📊 Running benchmark...
  Progress: 100/100 (100%)
  ✅ Benchmark complete (100 successful samples)

📈 Results:
  Successful samples: 100
  Failed requests: 0
  Early exit rate: 45.0%
  Avg cache hits/request: 650.5

  Latency statistics (ms):
    Min:    120ms
    Mean:   245ms
    Median: 230ms
    P75:    280ms
    P90:    350ms
    P95:    400ms
    P99:    480ms
    Max:    550ms

💾 Results saved to: benchmark-results.json
```

### JSON Output Format

```json
{
  "label": "after-optimization",
  "timestamp": "2025-10-13T10:30:00.000Z",
  "config": {
    "samples": 100,
    "webhookUrl": "http://localhost:5678/webhook/...",
    "warmupRequests": 10
  },
  "latencies": [120, 125, 130, ...],
  "errors": 0,
  "details": [
    {
      "sample": 1,
      "latency": 120,
      "score": 85,
      "earlyExit": true,
      "categoriesProcessed": 3,
      "cacheHits": 650
    },
    ...
  ],
  "stats": {
    "count": 100,
    "min": 120,
    "max": 550,
    "mean": 245,
    "median": 230,
    "p75": 280,
    "p90": 350,
    "p95": 400,
    "p99": 480
  },
  "cacheEffectiveness": {
    "avgHitsPerRequest": 650.5,
    "samplesWithCache": 100
  },
  "earlyExitRate": 45.0
}
```

## Comparison Output

```
📊 Comparing benchmark results...

Metric          Before      After       Change      Improvement
──────────────────────────────────────────────────────────────────────
mean            320ms       245ms       -75ms       23.44% faster ✅
median          310ms       230ms       -80ms       25.81% faster ✅
p75             380ms       280ms       -100ms      26.32% faster ✅
p90             450ms       350ms       -100ms      22.22% faster ✅
p95             500ms       400ms       -100ms      20.00% faster ✅
p99             600ms       480ms       -120ms      20.00% faster ✅

🎯 Target: 20% improvement on P95
✅ SUCCESS! P95 improved by 20.00% (target: 20%)
```

## Integration with CI/CD

Add to `.github/workflows/benchmark.yml`:

```yaml
name: Pattern Engine Benchmark

on:
  pull_request:
    paths:
      - 'services/workflow/workflows/**'
      - 'services/workflow/config/rules.config.json'

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup n8n
        run: |
          docker-compose up -d n8n
          # Wait for n8n to be ready
          sleep 30

      - name: Run Benchmark
        run: |
          cd services/workflow/tests/benchmark
          node pattern-engine-benchmark.js --samples=100 --output=results.json

      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: services/workflow/tests/benchmark/results.json
```

## Troubleshooting

### Error: Connection refused

**Cause:** n8n not running or webhook incorrect

**Solution:**
```bash
# Check n8n is running
docker ps | grep n8n

# Verify webhook URL in n8n UI
# Open http://localhost:5678 and check Chat Trigger node
```

### Error: No test prompts found

**Cause:** Fixtures file missing or empty

**Solution:**
```bash
# Check fixtures exist
ls -l ../fixtures/malicious-prompts.json

# Verify content
cat ../fixtures/malicious-prompts.json | jq '.prompts | length'
```

### Low cache hit rate

**Cause:** Insufficient warmup requests

**Solution:**
```bash
# Increase warmup
node pattern-engine-benchmark.js --warmup=50
```

### High variance in results

**Cause:** Background processes or network latency

**Solution:**
- Close other applications
- Run benchmark multiple times and average results
- Increase sample size: `--samples=500`

## Metrics Explanation

- **Min/Max**: Fastest and slowest requests
- **Mean**: Average latency across all samples
- **Median (P50)**: 50% of requests completed in this time or less
- **P75**: 75th percentile
- **P90**: 90th percentile
- **P95**: 95th percentile (KEY METRIC for optimization target)
- **P99**: 99th percentile
- **Early Exit Rate**: Percentage of requests that triggered early exit (score >= 100 before processing all categories)
- **Cache Hits**: Average number of regex cache hits per request

## Expected Improvements (Faza 2.2)

| Optimization | Expected Impact | Actual Impact |
|-------------|----------------|---------------|
| Regex pre-compilation | ~15-20% | TBD |
| Caching | ~10-15% | TBD |
| Early exit | ~5-10% | TBD |
| **Total** | **≥20%** | **TBD** |

## Notes

- **Warmup phase** is critical for caching optimization - don't skip it!
- **Early exit** effectiveness depends on input data (malicious vs benign)
- **Cache hits** should stabilize after warmup (~690 patterns cached)
- Run benchmarks on **production-like load** for accurate results
