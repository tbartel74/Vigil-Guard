# Quick Verification Scripts

This directory contains manual testing scripts for quick verification and debugging of specific Vigil Guard features.

## Purpose

These scripts are designed for:
- **Quick manual testing** - Fast verification without running full test suite
- **Smoke tests** - Pre-deployment sanity checks
- **Feature debugging** - Isolated testing of specific mechanisms
- **Ad-hoc verification** - One-off checks during development

**Note**: For automated testing and CI/CD, use the main test suite in `tests/e2e/` instead.

## Available Scripts

### `verify-encoding-bonus.sh`
Tests the encoding bonus mechanism in Pattern_Matching_Engine.

**What it tests**:
- Base64 encoding detection (+45 bonus points)
- URL encoding detection (+30 bonus points)
- Multi-layer encoding (stacked bonuses)
- Score breakdown includes `ENCODING_DETECTED` key

**Prerequisites**:
- n8n workflow must be running and active
- Webhook endpoint must be accessible at `http://localhost:5678/webhook-test/vigil`

**Usage**:
```bash
cd /Users/tomaszbartel/Documents/Projects/Vigil-Guard
./services/workflow/tests/scripts/verify-encoding-bonus.sh
```

**Expected output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Testing Encoding Bonus Mechanism (P1-6)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Testing Base64 Detection (should get +45 bonus points)
   ✅ Encoding bonus detected: 45 points

2. Testing URL Encoding Detection (should get +30 bonus points)
   ✅ Encoding bonus detected: 30 points

3. Testing Multi-Layer Encoding (should stack bonuses)
   ✅ Encoding bonus detected: 60 points
   Layers: 2
```

## Adding New Scripts

When adding new verification scripts:

1. **Follow naming convention**: `verify-{feature-name}.sh`
2. **Add documentation** to this README with:
   - What it tests
   - Prerequisites
   - Usage example
   - Expected output
3. **Make executable**: `chmod +x verify-{feature-name}.sh`
4. **Add error handling**: Use `set -euo pipefail` at the top
5. **Include clear output**: Use echo with visual separators

## Related Documentation

- Main test suite: `tests/e2e/`
- Test documentation: `tests/OWASP_AITG_TESTS.md`
- Encoding mechanism: `docs/OWASP_AITG_ANALYSIS.md`
