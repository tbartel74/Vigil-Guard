# Configuration Variables Reference

This guide describes all configurable parameters available in the Vigil Guard Web UI.

---

## Quick Settings

### Block Message
```yaml
Variable: BLOCK_MESSAGE
Type: string
Default: "Content blocked by security policy. Please rephrase without instructing how to respond."
```

Message displayed to users when their content is blocked by the security system.

---

## Detection Tuning

These settings control when the system triggers different security actions based on threat scores (0-100 range).

### Scoring Ranges

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| **ALLOW_MAX** | Maximum score for safe content | 29 | 0-100 |
| **SL_MIN** | Start light content sanitization | 30 | 0-100 |
| **SL_MAX** | End light sanitization range | 64 | 0-100 |
| **SH_MIN** | Start heavy content sanitization | 65 | 0-100 |
| **SH_MAX** | End heavy sanitization range | 84 | 0-100 |
| **BLOCK_MIN** | Minimum score to block content | 85 | 0-100 |

**Important:** Ranges should not overlap. Ensure: ALLOW_MAX < SL_MIN < SL_MAX < SH_MIN < SH_MAX < BLOCK_MIN

### Bloom Filter Thresholds

Early detection thresholds for suspicious patterns before full analysis.

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| **BLOOM_ROUTE_TO_AC** | % match to trigger additional checks | 15 | 0-100 |
| **BLOOM_HARD_BLOCK** | % match to block immediately | 50 | 0-100 |
| **BLOOM_PHRASE_BONUS** | Points added per exact phrase match | 20 | 0-100 |
| **BLOOM_REQUIRE_EXTRA** | Require multiple indicators to block | true | boolean |

---

## Performance

### Bloom Filter Settings

Control memory usage and accuracy tradeoffs for pattern detection.

| Variable | Description | Default |
|----------|-------------|---------|
| **BLOOM_M** | Filter size in bits (higher = more accurate, more memory) | 32768 |
| **BLOOM_K** | Number of hash functions (affects accuracy) | 5 |

**Recommended values:**
- Small deployment: m=8192, k=3
- Default: m=32768, k=5
- High accuracy: m=65536, k=7

---

## Advanced Settings

### Text Normalization

How aggressively to normalize and decode input text before analysis.

| Variable | Description | Default |
|----------|-------------|---------|
| **REMOVE_ZERO_WIDTH** | Strip zero-width Unicode characters | true |
| **COLLAPSE_WS** | Merge multiple spaces into one | true |
| **DECODE_ENTITIES** | Convert HTML entities (&lt; → <) | true |
| **UNICODE_FORM** | Unicode normalization strength | NFKC |

**Unicode Form Options:**
- `NFC` - Basic composition
- `NFD` - Basic decomposition
- `NFKC` - **Aggressive composition (recommended)**
- `NFKD` - Aggressive decomposition

### Heavy Sanitization Policy

Controls behavior when large portions of content need removal.

| Variable | Description | Default |
|----------|-------------|---------|
| **HEAVY_MAX_REMOVAL** | Maximum % of text that can be removed | 60 |
| **HEAVY_POLICY** | Action when exceeds removal limit | sanitize_if_exceeds |

**Policy Options:**
- `sanitize_if_exceeds` - **Continue sanitizing (recommended)**
- `block_if_exceeds` - Block entire content if limit exceeded

### N-gram Analysis

Substring pattern analysis configuration.

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| **NGRAM_MIN** | Shortest substring to analyze | 3 | 2-10 |
| **NGRAM_MAX** | Longest substring to analyze | 6 | 2-20 |
| **NGRAM_PREFIX_WINDOW** | Characters to analyze from start | 96 | 50-500 |

---

## Configuration Tips

1. **Start conservative** - Begin with default settings and adjust based on real traffic
2. **Monitor false positives** - Use the monitoring dashboard to track over-blocking
3. **Test incrementally** - Make small threshold adjustments (5-10 points at a time)
4. **Heavy sanitization** - Consider using `block_if_exceeds` for high-security environments
5. **Bloom filter tuning** - Increase `BLOOM_M` if you see false positives in early detection

---

## Configuration Files

These settings are stored in:
- `unified_config.json` - Main configuration and bloom filter settings
- `thresholds.config.json` - Scoring ranges and decision thresholds

**Note:** Changes made in the Web UI automatically update these files. Manual editing is not recommended unless you need to make bulk changes or restore from backup.
