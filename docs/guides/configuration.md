# Configuration Management

<!-- GUI-HELP: Detection rules, thresholds, and security policy management -->
<!-- GUI-SECTION: configuration -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Overview

Dynamic security policy management through web interface with real-time validation.

**Location:** Configuration (sidebar)
**Permission:** `can_view_configuration`

---

## Configuration Sections

### Overview

**Purpose:** Quick access to critical settings

| Setting | Description |
|---------|-------------|
| Test Mode | Enable dry-run (no blocking) |
| Debug Logging | Verbose logging |
| Block Messages | Customize rejection text |

### Detection & Sensitivity

**Purpose:** Configure threat detection thresholds

**Score Thresholds:**
| Range | Decision | Description |
|-------|----------|-------------|
| 0-29 | ALLOW | Safe, pass through |
| 30-49 | SANITIZE_LIGHT | Low risk, minimal redaction |
| 50-84 | SANITIZE_HEAVY | Medium risk, aggressive redaction |
| 85-100 | BLOCK | High risk, reject request |

**Arbiter Weights:**
| Branch | Default | Description |
|--------|---------|-------------|
| A (Heuristics) | 0.30 | Pattern detection weight |
| B (Semantic) | 0.35 | Embedding similarity weight |
| C (NLP Safety) | 0.35 | LLM classification weight |

**Weights must sum to 1.0**

**Boost Policies:**
| Boost | Points | Trigger |
|-------|--------|---------|
| Conservative Override | +50 | Branch C attack + high confidence |
| Semantic High | +20 | Branch B similarity > 0.8 |
| Heuristics Critical | +30 | Branch A score > 80 |
| Unanimous High | +25 | All branches > 60 |

### Performance & Limits

**Purpose:** Resource management and optimization

| Setting | Default | Description |
|---------|---------|-------------|
| Branch A Timeout | 1000ms | Heuristics timeout |
| Branch B Timeout | 2000ms | Semantic timeout |
| Branch C Timeout | 3000ms | NLP Safety timeout |
| Max Input Length | 10000 | Max characters |
| Max Tokens | 2000 | Max tokens (approx) |

### Advanced Processing

**Purpose:** Text normalization and sanitization

**Normalization:**
| Setting | Default | Description |
|---------|---------|-------------|
| Unicode Form | NFKC | Unicode normalization |
| Remove Zero-Width | true | Strip zero-width chars |
| Collapse Whitespace | true | Normalize whitespace |
| Decode Entities | true | Decode HTML entities |

**Sanitization Modes:**
- **Light** (score 30-49): Minimal redaction, 16 patterns
- **Heavy** (score 50-84): Aggressive redaction, 30+ patterns

---

## PII Detection

**Location:** Configuration → PII Detection

| Setting | Default | Range |
|---------|---------|-------|
| Mode | balanced | strict/balanced/permissive |
| Min Confidence | 0.5 | 0.0-1.0 |

**Entity Types:**
| Category | Types |
|----------|-------|
| Polish | PESEL, NIP, REGON, ID_CARD |
| International | SSN, CREDIT_CARD, IBAN |
| General | EMAIL, PHONE, URL, IP_ADDRESS |

---

## How to Modify Configuration

1. Navigate to Configuration → Select section
2. Modify values in input fields
3. **Save Changes** button becomes enabled
4. Click Save - changes applied atomically
5. Verify success message
6. Test changes in Investigation panel

---

## Validation

**Real-time Validation:**
- Field-level validation (type, range, format)
- Cross-field validation (threshold consistency)
- Visual indicators (green/yellow/red)

**Save-time Validation:**
- JSON syntax check
- Schema compliance
- Dependency validation

**Error Handling:**
- Detailed error messages
- Rollback on failure
- Atomic operations (no partial updates)

---

## Version History & Rollback

**Location:** Configuration → "Version History" button

**Features:**
- Every save creates a version entry
- Maximum 50 versions retained
- Single-click rollback capability

**Version Entry Shows:**
- Tag: `YYYYMMDD_HHMMSS-username`
- Timestamp
- Author (from JWT)
- Files modified

**How to Rollback:**
1. Open Version History
2. Find desired version
3. Click "Rollback"
4. Confirm action
5. System restores all files atomically

**Safety Features:**
- Pre-rollback backup created
- Atomic operations
- Complete audit trail
- Permission controlled

---

## Data Retention Policy

**Location:** Configuration → System → Data Retention

**Dashboard Shows:**
- Total/Used/Free disk space
- Per-table statistics (rows, size, compression)
- Partition info and date ranges

**TTL Configuration:**
| Table | Default | Purpose |
|-------|---------|---------|
| events_raw | 90 days | Debug data |
| events_v2 | 365 days | Analysis data |

**Thresholds:**
- Warning: 80% disk usage (yellow)
- Critical: 90% disk usage (red)

**Force Cleanup:**
- Execute `OPTIMIZE TABLE FINAL`
- Immediately deletes expired data
- Use after TTL changes

---

## Configuration Files

| File | Purpose | Edit Via |
|------|---------|----------|
| `unified_config.json` | Main configuration | Web UI |
| `pii.conf` | PII patterns | Web UI → PII |
| `allowlist.schema.json` | Whitelisted patterns | File Manager |

**Location:** `services/workflow/config/`

**Never edit directly** - use Web UI for ETag concurrency control and audit logging.

---

## Best Practices

### Threshold Tuning
1. Start conservative (lower thresholds)
2. Monitor false positive rate in Grafana
3. Adjust incrementally (+/- 5 points)
4. Test with real traffic samples

### Arbiter Weight Optimization
| Scenario | Weights (A/B/C) |
|----------|-----------------|
| High security | 0.20 / 0.30 / 0.50 |
| Balanced | 0.30 / 0.35 / 0.35 |
| Low latency | 0.50 / 0.30 / 0.20 |
| Semantic focus | 0.20 / 0.50 / 0.30 |

### PII Configuration
1. Enable only needed entities
2. Adjust confidence per entity type
3. Test with sample data
4. Monitor false positives

---

**Screenshot:** `docs/pic/Arbiter-Configuration-dashboard.png`

**Related:** [Dashboard](dashboard.md) | [Administration](administration.md)
