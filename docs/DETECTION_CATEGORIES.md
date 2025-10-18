# Detection Categories Reference

**Last Updated**: 2025-10-18
**Version**: 1.3.1

This document describes all detection categories in Vigil Guard, their scoring weights, and the types of attacks they detect.

---

## Overview

Vigil Guard uses a rule-based detection system with **30+ categories** of attack patterns. Each category has:
- **base_weight**: Base score (0-100) assigned when pattern matches
- **multiplier**: Multiplies the base_weight for final score
- **patterns**: Regex patterns for detection

**Final score formula**: `score = base_weight × multiplier`

---

## Score-to-Action Mapping

| Score Range | Action | Description |
|-------------|--------|-------------|
| 0-29 | **ALLOW** | Content passes without modification |
| 30-64 | **SANITIZE_LIGHT** | Remove suspicious patterns, keep structure |
| 65-84 | **SANITIZE_HEAVY** | Aggressive removal, may alter meaning |
| 85-100 | **BLOCK** | Reject content entirely |

---

## Critical Attack Categories

### SQL_XSS_ATTACKS (CRITICAL)
**Score**: 50 × 1.3 = **65** → SANITIZE_HEAVY
**Updated**: 2025-10-18 (base_weight: 30→50, +24 patterns)

Detects SQL injection and Cross-Site Scripting (XSS) attacks.

**SQL Injection Patterns** (10 total):
- `DROP TABLE`, `DELETE FROM`, `UNION SELECT` - SQL commands
- `OR '1'='1'`, `OR "1"="1"` - Boolean injection
- `EXEC()`, `execute immediate` - Stored procedure execution
- `xp_cmdshell` - Windows command execution
- `INTO OUTFILE`, `LOAD_FILE()` - File operations
- `--` - SQL comment injection

**XSS Patterns** (26 total):
- **Script Tags**: `<script>`, `</script>`
- **Protocols**: `javascript:`, `vbscript:`, `data:text/html`
- **Event Handlers**: `onerror=`, `onload=`, `onclick=`, `onmouseover=`, `onmouseout=`, `onfocus=`, `onblur=`, `onchange=`
- **DOM Elements**: `<iframe>`, `<embed>`, `<object>`, `<img onerror>`
- **JavaScript Execution**: `eval()`, `setTimeout()`, `setInterval()`, `Function()`, `execScript`
- **DOM Manipulation**: `.innerHTML`, `.outerHTML`, `document.write()`, `document.writeln()`

**Examples**:
```javascript
// SQL Injection
"'; DROP TABLE users; --"
"1' OR '1'='1"
"UNION SELECT password FROM users"

// XSS Attacks
"<script>alert('XSS')</script>"
"<img src=x onerror=alert(1)>"
"javascript:alert(document.cookie)"
"eval('malicious code')"
```

**Impact**: SQL injection and XSS are OWASP Top 10 vulnerabilities. Score increased from 39 (SANITIZE_LIGHT) to 65 (SANITIZE_HEAVY) for stronger protection.

---

### PRIVILEGE_ESCALATION (HIGH)
**Score**: 55 × 1.5 = **82.5** → SANITIZE_HEAVY
**Updated**: 2025-10-18 (base_weight: 35→55)

Detects attempts to gain elevated privileges (admin, root, superuser).

**Patterns** (11 total):
- `unlock admin`, `grant root`, `escalate privileges`
- `elevate permissions`, `become root`
- `admin panel`, `root access`, `sudo privileges`
- `bypass authentication`, `bypass security`
- `enable debug mode`, `enable admin mode`

**Examples**:
```
"unlock admin access"
"grant me root privileges"
"enable developer mode"
"bypass authentication"
```

---

### COMMAND_INJECTION (HIGH)
**Score**: 50 × 1.4 = **70** → SANITIZE_HEAVY
**Updated**: 2025-10-18 (base_weight: 30→50)

Detects attempts to execute system commands or arbitrary code.

**Patterns** (15+ total):
- `execute command`, `run script`, `invoke payload`
- `execute system command`, `run arbitrary code`
- Shell execution patterns
- Code execution attempts

**Examples**:
```
"execute shell command ls -la"
"run system script malware.sh"
"invoke arbitrary code"
```

---

## Obfuscation & Encoding Categories

### ENCODING_SUSPICIOUS (MEDIUM)
**Score**: 30 × 1.2 = **36** → SANITIZE_LIGHT
**Updated**: Previous phase (base_weight: 20→30)

Detects base64, URL encoding, hex encoding, and JWT tokens.

**Patterns** (5 total):
- Base64 strings (20+ chars)
- JWT tokens (`eyJ...`)
- URL encoding sequences (`%20%20%20...`)
- Multi-part encoded strings

**Examples**:
```
"aGVsbG8gd29ybGQgdGhpcyBpcyBiYXNlNjQ="  // base64
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  // JWT
"%48%65%6C%6C%6F%20%57%6F%72%6C%64"  // URL encoded
```

---

### HOMOGLYPH_OBFUSCATION (MEDIUM)
**Score**: 25 × 1.3 = **32.5** → SANITIZE_LIGHT

Detects Unicode lookalike characters (Cyrillic, Greek) masquerading as Latin.

**Patterns** (15+ total):
- Cyrillic letters (А, Е, О, Р) in Latin context
- Greek letters (α, β, γ) mixed with English
- Mathematical symbols as letters

**Examples**:
```
"Аdmin"  // Cyrillic А instead of Latin A
"ρass"   // Greek ρ instead of Latin p
```

---

## Jailbreak & Manipulation Categories

### GODMODE_JAILBREAK (CRITICAL)
**Score**: 40 × 1.5 = **60** → SANITIZE_LIGHT

Detects "GODMODE", "DAN", jailbreak attempts, and system override commands.

**Patterns** (50+ total):
- `GODMODE: ENABLED`, `DAN mode activated`
- `ignore previous instructions`, `disregard safety`
- `bypass restrictions`, `unlock capabilities`
- Leet speak variants: `G0DM0D3`, `PWNED`

---

### CONTROL_OVERRIDE (HIGH)
**Score**: 30 × 1.4 = **42** → SANITIZE_LIGHT

Detects attempts to override system behavior or safety controls.

**Patterns** (20+ total):
- `ignore all previous`, `disregard instructions`
- `new instructions:`, `system override`
- `disable safety`, `turn off filters`

---

### PROMPT_TEMPLATING_MARKERS (MEDIUM)
**Score**: 18 × 1.2 = **21.6** → ALLOW

Detects formatting markers used to structure malicious prompts.

**Patterns** (15+ total):
- `Tone: highly`, `Format: the optimal format`
- `Start rebel response`, `ResponseFormat:`
- Template injection markers

---

## Additional Categories

### ROLEPLAY_ESCAPE (MEDIUM)
**Score**: 22 × 1.3 = **28.6** → ALLOW

Detects attempts to escape roleplay scenarios or system personas.

**Patterns**: Character roleplay escapes, persona switching

---

### SEPARATOR_ABUSE (LOW)
**Score**: 15 × 1.1 = **16.5** → ALLOW

Detects excessive use of separator characters (`---`, `===`, `...`).

**Patterns**: Repetitive dividers, visual noise

---

### DIVIDER_ABUSE (MEDIUM)
**Score**: 25 × 1.3 = **32.5** → SANITIZE_LIGHT

Detects dividers with embedded malicious content.

**Patterns**: `.-.-.-.-<LOVE PLINY LOVE>-.-.-.-`

---

## Configuration Files

Detection categories are defined in:
- **`services/workflow/config/rules.config.json`** - Category definitions, base_weight, multipliers, patterns

**Note**: These categories are **not configurable through the Web UI**. They are hardcoded in `rules.config.json` for consistency and security. Only threshold ranges (ALLOW, SANITIZE, BLOCK) are user-configurable.

---

## Recent Updates

### 2025-10-18: SQL/XSS Enhancement
- **SQL_XSS_ATTACKS**: 30→50 base_weight (+24 patterns)
- **PRIVILEGE_ESCALATION**: 35→55 base_weight
- **COMMAND_INJECTION**: 30→50 base_weight

**Rationale**: SQL injection and XSS are OWASP Top 10 critical vulnerabilities. Previous scores (39, 52.5, 42) landed in SANITIZE_LIGHT range, providing insufficient protection. New scores (65, 82.5, 70) ensure SANITIZE_HEAVY treatment.

**Coverage improvement**:
- Advanced SQL injection: `xp_cmdshell`, `LOAD_FILE()`, `execute immediate`
- DOM-based XSS: `.innerHTML`, `eval()`, `document.write()`
- Event handler XSS: All major event handlers covered
- JavaScript execution vectors: `setTimeout()`, `Function()`, `execScript`

---

## Testing

To verify detection categories:

```bash
# Run test suite
cd services/workflow
npm test

# Test specific attack type
npm run test:bypass -- --grep "SQL injection"
npm run test:bypass -- --grep "XSS"
```

---

## See Also

- [Configuration Guide](CONFIGURATION.md) - Web UI configurable settings
- [Security Guide](SECURITY.md) - Overall security architecture
- [CONFIG_VARIABLES.md](CONFIG_VARIABLES.md) - Web UI variable reference
