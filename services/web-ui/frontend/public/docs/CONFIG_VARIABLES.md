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

## PII Detection

**Version:** 1.6.10+ | **Engine:** Microsoft Presidio

Automatic detection and redaction of personally identifiable information (PII) using NLP-powered Microsoft Presidio with dual-language support (Polish + International entities).

### Enable PII Detection
```yaml
Variable: PII_ENABLED
Type: boolean
Default: true
```

Master switch for PII detection. When enabled, all user input is analyzed for PII before processing.

**Entities Detected:**
- **Polish:** PESEL, REGON, NIP, Polish ID cards, driver's licenses
- **International:** Credit cards (Visa, Mastercard, Amex), emails, phone numbers, IP addresses, SSN, passport numbers, IBAN, medical records

### Detection Settings

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| **PII_CONFIDENCE_THRESHOLD** | Minimum confidence score for detection | 0.7 | 0.5-1.0 |
| **PII_FALLBACK_TO_REGEX** | Use regex patterns when API unavailable | true | boolean |
| **PII_CONTEXT_ENHANCEMENT** | Use NLP context for accuracy | true | boolean |
| **PII_API_TIMEOUT_MS** | Presidio API timeout before fallback | 3000 | 1000-10000 |

**Confidence Threshold Guide:**
- **0.5-0.6** - Very sensitive (high false positives)
- **0.7** - Balanced (recommended)
- **0.8-0.9** - Conservative (may miss edge cases)
- **1.0** - Only exact matches (not recommended)

### Redaction Strategy
```yaml
Variable: PII_REDACTION_MODE
Type: select
Default: replace
Options: replace | hash | mask
```

**Redaction Modes:**
- **`replace`** - Replace with entity type tokens (e.g., `[EMAIL]`, `[PESEL]`, `[CREDIT_CARD]`)
  - ✅ Recommended: Audit trails show what was redacted
  - ✅ Reversible if you keep mapping in secure storage

- **`hash`** - Replace with SHA-256 hash
  - ✅ Cryptographically secure
  - ❌ Irreversible (cannot recover original)
  - ⚠️ Same PII always hashes to same value

- **`mask`** - Replace with asterisks (`*****`)
  - ❌ Not recommended: Loses information about entity type
  - ⚠️ Cannot distinguish between email, phone, PESEL, etc.

**Example:**
```
Input:  "My PESEL is 44051401359 and email is user@example.com"

replace: "My PESEL is [PESEL] and email is [EMAIL]"
hash:    "My PESEL is a8b3f2... and email is d9e4c1..."
mask:    "My PESEL is *********** and email is *****************"
```

### Architecture

```
User Input → Presidio API (vigil-presidio-pii:5001)
              ↓ (success)
           Entity Detection (confidence filtering)
              ↓
           Redaction (per mode)

              ↓ (timeout/error)
           Regex Fallback (pii.conf patterns)
              ↓
           Basic Pattern Matching
```

**Fallback Behavior:**
- If `PII_FALLBACK_TO_REGEX = true` and Presidio fails → Use regex patterns
- If `PII_FALLBACK_TO_REGEX = false` and Presidio fails → No PII detection (risk!)

**Performance:**
- Presidio API: ~100-300ms latency (local Docker)
- Regex fallback: ~5-10ms latency
- Timeout protection prevents blocking main workflow

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
