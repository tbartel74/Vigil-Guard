# Dashboard & Monitoring

<!-- GUI-HELP: Real-time security analytics and Grafana integration -->
<!-- GUI-SECTION: monitoring -->

**Version:** 2.0.0 | **Last Updated:** 2025-11-28

---

## Overview

The monitoring dashboard provides real-time security analytics through integrated Grafana panels and live statistics.

**Access:** Monitoring (sidebar) or http://localhost/ui/monitoring

---

## Quick Statistics

**Location:** Top of Monitoring page

| Metric | Description |
|--------|-------------|
| Requests Processed | Total prompts analyzed (24h) |
| Threats Blocked | Malicious requests stopped |
| Content Sanitized | Requests modified for safety |
| Prompt Guard Status | AI model health (Running/Down) |

**Auto-refresh:** Configurable (10s, 30s, 1m, 5m, or manual)

---

## Time Range Control

| Range | Use Case |
|-------|----------|
| 1 hour | Recent activity |
| 6 hours | Short-term trends |
| 12 hours | Half-day analysis |
| **24 hours** | Daily overview (default) |
| 7 days | Weekly trends |

---

## Grafana Analytics Panels

### 1. Input/Output Processing Table

**Purpose:** Real-time request monitoring

**Displays:**
- Original prompt text
- Sanitized output (if modified)
- Detection status (ALLOWED/SANITIZED/BLOCKED)
- Maliciousness score (0-100)
- Timestamp

**Use Case:** Monitor live system activity and verify sanitization

### 2. TOP-10 Detection Categories

**Purpose:** Identify dominant threat types

**Common Categories:**
| Category | Description |
|----------|-------------|
| `prompt_injection` | Direct instruction manipulation |
| `jailbreak` | System constraint bypass attempts |
| `sensitive_info_leak` | Data extraction attempts |
| `content_override` | Output control attempts |

**Use Case:** Understand attack patterns and adjust detection rules

### 3. Volume + Status Distribution

**Purpose:** Track system decision patterns

**Decision Colors:**
- ALLOWED (green)
- SANITIZED_LIGHT (yellow)
- SANITIZED_HEAVY (orange)
- BLOCKED (red)

**Use Case:** Evaluate system effectiveness and decision balance

### 4. Block Rate Percentage

**Purpose:** Early warning indicator

| Block Rate | Status |
|------------|--------|
| < 5% | Normal operation |
| 5-15% | Increased threat activity |
| > 15% | Attack in progress (investigate!) |

**Use Case:** Detect coordinated attacks or misconfigurations

### 5. Maliciousness Trend Analysis

**Purpose:** Risk trend monitoring

**Displays:**
- **Average Score** - Mean maliciousness across all requests
- **P95 Score** - 95th percentile (worst 5% of requests)

**Score Ranges:**
| Score | Risk Level | Action |
|-------|------------|--------|
| 0-29 | Low | ALLOW |
| 30-49 | Medium-Low | SANITIZE_LIGHT |
| 50-84 | Medium-High | SANITIZE_HEAVY |
| 85-100 | Critical | BLOCK |

**Use Case:** Monitor threat severity evolution

### 6. Histogram Time Series

**Purpose:** Score distribution visualization

**Displays:**
- Histogram buckets (10-point intervals)
- Request count per bucket
- Time-based evolution

**Use Case:** Identify score clustering patterns and anomalies

---

## Dashboard Controls

| Control | Description |
|---------|-------------|
| **Refresh Now** | Force immediate data reload |
| **Auto Refresh** | Off / 10s / 30s / 1m / 5m |

**Recommended:** 30 seconds for standard monitoring

---

## Grafana Direct Access

**URL:** http://localhost:3001

**Default credentials:** admin / [from install.sh]

**Available dashboards:**
- Vigil Guard Overview
- Detection Analytics
- PII Redaction Stats

---

**Screenshot:** `docs/pic/Monitoring-panel.png`

**Related:** [Investigation](investigation.md) | [Configuration](configuration.md)
