# GUI Configuration Parameters for Sequential Sanitizer

## 1. Detection Sensitivity

### **Overall Sensitivity Level**
```yaml
parameter: scoring.ranges
type: range_set
description: "Adjust when system triggers different security actions"
```

| Action | Field | Default | Range | Description |
|--------|-------|---------|-------|-------------|
| **Allow** | `allow.max` | 29 | 0-100 | Maximum score for safe content |
| **Light Sanitization** | `sanitize_light.min` | 30 | 0-100 | Start light content removal |
| **Light Sanitization** | `sanitize_light.max` | 55 | 0-100 | End light sanitization range |
| **Heavy Sanitization** | `sanitize_heavy.min` | 56 | 0-100 | Start aggressive removal |
| **Heavy Sanitization** | `sanitize_heavy.max` | 75 | 0-100 | End heavy sanitization range |
| **Block** | `block.min` | 76 | 0-100 | Minimum score to block content |

### **Bloom Filter Sensitivity**
```yaml
parameter: bloom_decisions
type: object
description: "Early detection thresholds for suspicious patterns"
```

| Setting | Field | Default | Range | Description |
|---------|-------|---------|-------|-------------|
| **Route to Additional Checks** | `route_to_ac_threshold` | 10 | 0-100 | % match to trigger extra validation |
| **Immediate Block** | `hard_block_threshold` | 50 | 0-100 | % match to block immediately |
| **Require Additional Signals** | `require_zusatz_signals` | true | boolean | Need multiple indicators to block |

---

## 2. Content Processing

### **Text Normalization**
```yaml
parameter: normalization
type: object
description: "How aggressively to normalize input text"
```

| Setting | Field | Default | Type | Description |
|---------|-------|---------|------|-------------|
| **Remove Invisible Characters** | `remove_zero_width` | true | boolean | Strip zero-width Unicode |
| **Normalize Spaces** | `collapse_whitespace` | true | boolean | Merge multiple spaces |
| **Decode HTML** | `decode_entities` | true | boolean | Convert &lt; to < etc. |
| **Unicode Form** | `unicode_form` | "NFKC" | select | Normalization strength |

**Unicode Form Options:**
- `NFC` - Basic composition
- `NFD` - Basic decomposition  
- `NFKC` - **Aggressive composition (default)**
- `NFKD` - Aggressive decomposition

### **Sanitization Policy**
```yaml
parameter: sanitization.heavy
type: object
description: "Behavior when content heavily sanitized"
```

| Setting | Field | Default | Type | Description |
|---------|-------|---------|------|-------------|
| **Max Removal Percent** | `max_removal_percent` | 60 | 0-100 | Maximum % of text removable |
| **Over-limit Policy** | `policy` | "sanitize_if_exceeds" | select | Action when exceeds limit |

**Policy Options:**
- `sanitize_if_exceeds` - **Continue sanitizing (default)**
- `block_if_exceeds` - Block if too much removed

---

## 3. Performance & Limits

### **Performance Settings**
```yaml
parameter: performance
type: object
description: "Resource and timing constraints"
```

| Setting | Field | Default | Range | Description |
|---------|-------|---------|-------|-------------|
| **Processing Timeout** | `timeout_ms` | 5000 | 100-30000 | Max milliseconds per request |
| **Max Input Length** | `max_input_length` | 10000 | 100-100000 | Maximum characters to process |
| **Cache Duration** | `cache_ttl_ms` | 60000 | 0-3600000 | Cache lifetime in milliseconds |

### **Bloom Filter Performance**
```yaml
parameter: bloom
type: object  
description: "Memory/accuracy tradeoff for pattern detection"
```

| Setting | Field | Default | Range | Description |
|---------|-------|---------|-------|-------------|
| **Filter Size** | `m` | 32768 | 8192-131072 | Bits allocated (affects memory) |
| **Hash Functions** | `k` | 5 | 3-10 | Number of hashes (affects accuracy) |

---

## 4. LLM Integration

### **Prompt Guard API**
```yaml
parameter: prompt_guard_policy
type: object
description: "External LLM validation settings"
```

| Setting | Field | Default | Type | Description |
|---------|-------|---------|------|-------------|
| **Enable Prompt Guard** | `enabled` | true | boolean | Use external LLM validation |
| **API Endpoint** | `api_endpoint` | http://localhost:8000 | string | Prompt Guard API URL |
| **Timeout** | `timeout_ms` | 3000 | number | API request timeout in milliseconds |

**Note**: Risk level policies for Prompt Guard are fixed in the workflow logic and are not user-configurable. The model returns a confidence score (0.0-1.0) which is integrated into the final routing decision.

---

## 5. User Feedback

### **Messaging**
```yaml
parameter: enforcement
type: object
description: "User-facing messages and logging"
```

| Setting | Field | Default | Type | Description |
|---------|-------|---------|------|-------------|
| **Block Message** | `block_message` | "Content blocked by security policy..." | string | Message shown to users |
| **Light Sanitization Token** | `sanitization.light.redact_token` | "[removed]" | string | Replace light removals |
| **Heavy Sanitization Token** | `sanitization.heavy.redact_token` | "[REDACTED]" | string | Replace heavy removals |

### **Audit & Testing**
```yaml
parameter: enforcement
type: object
description: "Logging and testing options"
```

| Setting | Field | Default | Type | Description |
|---------|-------|---------|------|-------------|
| **Test Mode** | `dry_run` | false | boolean | Test without enforcing |
| **Enable Logging** | `audit_log` | true | boolean | Log all decisions |

---

## 6. Pattern Categories Control

### **Enable/Disable Categories**
```yaml
parameter: pattern_categories
type: toggles
description: "Enable/disable detection categories"
```

| Category | Default | Severity | Description |
|----------|---------|----------|-------------|
| **CRITICAL_INJECTION** | ✅ On | Critical | Direct prompt injections |
| **JAILBREAK_ATTEMPT** | ✅ On | High | Jailbreak attempts |
| **DANGEROUS_CONTENT** | ✅ On | High | Harmful content requests |
| **PROMPT_LEAK_ATTEMPT** | ✅ On | Medium | Trying to reveal system prompt |
| **CONTROL_OVERRIDE** | ✅ On | High | Override instructions |
| **HEAVY_OBFUSCATION** | ✅ On | Medium | Unicode/encoding tricks |
| **FORMAT_COERCION** | ✅ On | Low | Force output format |
| **MILD_SUSPICIOUS** | ✅ On | Low | Mildly suspicious patterns |

---

## 7. Advanced Settings

### **N-gram Analysis**
```yaml
parameter: prefilter.ngram
type: object
description: "Substring analysis configuration"
```

| Setting | Field | Default | Range | Description |
|---------|-------|---------|-------|-------------|
| **Min N-gram Size** | `min` | 3 | 2-10 | Shortest substring to analyze |
| **Max N-gram Size** | `max` | 6 | 2-20 | Longest substring to analyze |
| **Sample Limit** | `sample_limit` | 800 | 100-10000 | Characters to analyze for patterns |

### **Whitelist**
```yaml
parameter: whitelist
type: object
description: "Always-allowed content"
```

| Setting | Field | Default | Type | Description |
|---------|-------|---------|------|-------------|
| **Allowed Domains** | `domains` | ["api.example.com"] | array | Trusted domain list |
| **Allowed Patterns** | `patterns` | ["^Example code:"] | array | Safe text patterns |

---

## Recommended GUI Layout

### Tab 1: Quick Settings
- Overall Sensitivity (slider)
- Test Mode (toggle)
- Enable Logging (toggle)
- Block Message (text field)

### Tab 2: Detection Tuning
- Scoring Ranges (range sliders)
- Bloom Filter Thresholds (sliders)
- Pattern Categories (toggles)

### Tab 3: Performance
- Timeout (slider)
- Max Input Length (slider)
- Cache Duration (slider)
- Bloom Filter Size (dropdown)

### Tab 4: Advanced
- Normalization Options
- Sanitization Policies
- N-gram Settings
- Whitelist Management

### Tab 5: LLM Integration
- Enable/Disable Prompt Guard
- Risk Level Policies
- API Settings

---

## Important Notes for GUI Implementation

1. **Validation Required**:
   - Ensure range minimums < maximums
   - Scoring ranges should not overlap
   - Percentages must be 0-100

2. **Apply Changes**:
   - Changes should require confirmation
   - Option to export/import configurations
   - Version control for config changes

3. **Presets**:
   - **Strict**: High security, more false positives
   - **Balanced**: Default settings
   - **Permissive**: Lower security, fewer false positives

4. **Help Text**:
   - Each setting should have tooltip with explanation
   - Show impact level (High/Medium/Low)
   - Indicate if restart required