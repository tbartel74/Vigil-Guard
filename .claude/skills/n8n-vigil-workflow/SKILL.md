---
name: n8n-vigil-workflow
description: Expert guidance for n8n workflow development in Vigil Guard. Use when working with detection patterns, threat categories, sanitization engine, 40-node processing pipeline, workflow configuration, or managing rules.config.json and unified_config.json files.
version: 1.0.0
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# n8n Vigil Guard Workflow Development

## Overview
Comprehensive guidance for developing and maintaining the Vigil Guard n8n workflow engine - a 40-node sequential pipeline that detects prompt injection attacks, applies sanitization, and logs threats to ClickHouse.

## When to Use This Skill
- Adding new detection patterns to rules.config.json
- Modifying threat categories or base weights
- Configuring decision thresholds (ALLOW/SANITIZE/BLOCK)
- Troubleshooting workflow nodes
- Understanding detection scoring algorithms
- Working with configuration files (NEVER modify directly!)
- Testing patterns via n8n chat interface

## ⚠️ Critical Constraints
**NEVER modify files in `services/workflow/config/` directly**
✅ **ALWAYS use the Web GUI** at http://localhost/ui/config/
- Configuration changes tracked with audit logs
- ETag concurrency control prevents conflicts
- Backup rotation maintains version history

## Detection Architecture

### 40-Node Processing Pipeline
```
Chat Input → Input_Validator → PII_Redactor → Normalize_Node
  → Bloom_Prefilter → Allowlist_Validator → Pattern_Matching_Engine
  → Unified Decision Engine → Correlation_Engine → Sanitization_Enforcement
  → [Optional: Prompt Guard API] → Finale Decision
  → Build+Sanitize NDJSON → Logging to ClickHouse → Clean Output
```

### Decision Matrix
| Score Range | Action | Severity |
|------------|--------|----------|
| 0-29 | ALLOW | Clean |
| 30-64 | SANITIZE_LIGHT | Low |
| 65-84 | SANITIZE_HEAVY | Medium |
| 85-100 | BLOCK | Critical |

### 29+ Detection Categories
**Critical Threats**: CRITICAL_INJECTION, JAILBREAK_ATTEMPT, CONTROL_OVERRIDE, PROMPT_LEAK_ATTEMPT, GODMODE_JAILBREAK
**Security**: PRIVILEGE_ESCALATION, COMMAND_INJECTION, CREDENTIAL_HARVESTING
**Obfuscation**: HEAVY_OBFUSCATION, FORMAT_COERCION, ENCODING_SUSPICIOUS

See: `docs/detection-categories.md` for complete list

## Common Tasks

### Add Detection Pattern
**TDD Approach** (Recommended):
```bash
cd services/workflow

# 1. Create test first
cat > tests/fixtures/my-attack.json << 'EOF'
{
  "prompt": "malicious payload here",
  "expected": "BLOCKED"
}
EOF

# 2. Add to test suite (tests/e2e/bypass-scenarios.test.js)
# 3. Run test (should FAIL)
npm test -- bypass-scenarios.test.js

# 4. Add pattern via GUI at http://localhost/ui/config/
#    Navigate to: Detection Tuning → rules.config.json
#    Add pattern to appropriate category

# 5. Re-run test (should PASS)
npm test
```

### Modify Threshold Ranges
Access via GUI: http://localhost/ui/config/ → Quick Settings
- ALLOW_MAX: 0-29 (default)
- SANITIZE_LIGHT_MAX: 30-64
- SANITIZE_HEAVY_MAX: 65-84
- BLOCK_MIN: 85+

### Test Pattern Effectiveness
```bash
# Option 1: n8n Chat Interface
# 1. Open http://localhost:5678
# 2. Open Vigil-Guard-v1.4.json workflow
# 3. Click "Test workflow" → "Chat" tab
# 4. Send test prompts
# 5. Review detection scores

# Option 2: Automated Test Suite
cd services/workflow
npm test -- --grep "SQL injection"
```

## Configuration Files Reference

### unified_config.json
```json
{
  "normalization": { "unicode_form": "NFKC", "max_iterations": 3 },
  "sanitization": { "light": {}, "heavy": {} },
  "bloom_filter": { "enabled": true, "size": 1000 },
  "thresholds": { "allow_max": 29, "sanitize_light_max": 64 }
}
```

### rules.config.json
```json
{
  "categories": {
    "SQL_XSS_ATTACKS": {
      "base_weight": 50,
      "multiplier": 1.3,
      "patterns": ["SELECT.*FROM", "DROP TABLE", "<script>"]
    }
  }
}
```

Access editing via GUI only!

## Workflow Nodes (Key)

### Pattern_Matching_Engine
- Regex matching against 29+ categories
- Encoding detection bonus (+45 base64, +30 URL, +35 hex)
- Score accumulation across categories
- Logs to `scoreBreakdown.ENCODING_DETECTED`

### Unified Decision Engine
- Evaluates total score vs thresholds
- Returns: ALLOW/SANITIZE_LIGHT/SANITIZE_HEAVY/BLOCK
- Factors: base_weight × multiplier per category

### Sanitization_Enforcement
- LIGHT: Removes LOW/MEDIUM severity patterns (10 categories)
- HEAVY: Removes ALL detected patterns (33 categories)
- Uses patterns from Pattern_Matching_Engine (not hardcoded)

## Best Practices
1. **Always write tests first** (TDD approach)
2. **Use GUI for all config changes** (never edit files directly)
3. **Test in n8n chat** before production
4. **Monitor ClickHouse logs** for false positives
5. **Document pattern rationale** in git commits
6. **Keep base_weight conservative** (30-60 range)
7. **Use multipliers** for severity adjustment (1.0-2.0)

## Integration Points
- **ClickHouse**: Logs to `n8n_logs.events_processed` table
- **Prompt Guard API**: External LLM validation (optional)
- **Web UI**: Configuration management via REST API
- **Browser Extension**: Webhook endpoint for client-side protection

## Troubleshooting

### Pattern Not Triggering
```bash
# 1. Verify pattern syntax
echo "test payload" | grep -P "your_regex_pattern"

# 2. Check category is enabled
curl http://localhost:8787/api/parse/rules.config.json

# 3. Verify scoring in n8n chat
# Send test prompt → check scoreBreakdown in response
```

### False Positives
```bash
# Report via GUI:
# http://localhost/ui/monitoring → Investigation Panel
# → Search for prompt → Click "Report False Positive"

# Check stats:
# GET /api/feedback/stats
```

## Related Skills
- `vigil-testing-e2e` - For writing comprehensive tests
- `clickhouse-grafana-monitoring` - For analyzing detection metrics
- `react-tailwind-vigil-ui` - For GUI configuration interface
- `vigil-security-patterns` - For security best practices

## References
- Workflow JSON: `services/workflow/workflows/Vigil-Guard-v1.4.json`
- Config docs: `docs/CONFIGURATION.md`
- Detection guide: `docs/DETECTION_CATEGORIES.md`
- Sanitization fix: `docs/SANITIZATION_FIX_2025-10-20.md`
