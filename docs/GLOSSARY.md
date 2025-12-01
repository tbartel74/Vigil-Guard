# Glossary

Technical terms and concepts used in Vigil Guard.

## A

### Aho-Corasick Prefilter
High-performance string matching algorithm used in Branch A. Scans 993 keywords simultaneously in linear time, enabling O(n) detection regardless of pattern count.

### Arbiter
The decision fusion component that combines scores from all three detection branches using weighted voting. Applies boost policies for high-confidence matches.

### ALLOW
Decision status indicating content passed all checks. Score: 0-29 points.

## B

### BLOCK
Decision status indicating content was rejected. Score: 85+ points. User receives error message instead of forwarding to LLM.

### Bloom Prefilter
Probabilistic data structure for fast negative lookups. Quickly eliminates clean content before expensive pattern matching.

### Boost Policy
Score multiplier applied when a branch reports high confidence. Ensures dangerous content isn't diluted by other branch scores.

### Branch A (Heuristics)
Pattern-based detection using Aho-Corasick prefilter and regex patterns. Port 5005. Weight: 0.30.

### Branch B (Semantic)
Embedding-based detection using sentence transformers. Measures cosine similarity to known threat categories. Port 5006. Weight: 0.35.

### Branch C (LLM Safety Engine)
Machine learning classification using Meta Llama Guard 2 model. Detects novel attacks that bypass pattern matching. Port 8000. Weight: 0.35.

## C

### Categories (Detection)
44 threat categories including: SQL_XSS_ATTACKS, PROMPT_INJECTION, JAILBREAK_ATTEMPT, SOCIAL_ENGINEERING, PII_LEAK, etc.

### ClickHouse
Column-oriented analytics database storing detection events. Optimized for time-series queries and aggregations.

### Confidence Score
0.0-1.0 value indicating detection certainty. Higher values = more confident detection.

### Context Enhancement
PII detection feature that uses surrounding text to improve entity recognition accuracy.

## D

### Decision
Final determination: ALLOW, SANITIZE, or BLOCK. Based on Arbiter's combined score.

### Dual-Language Detection
PII detection capability processing both Polish and English entities simultaneously. Uses separate Presidio models for each language.

## E

### Entity (PII)
Personal information detected by Presidio: EMAIL, PHONE_NUMBER, PESEL, NIP, CREDIT_CARD, etc.

### ETag
HTTP header for concurrency control. Prevents configuration overwrites when multiple users edit simultaneously.

### events_v2
Primary ClickHouse table storing detection events. Schema includes: timestamp, event_id, branch scores, categories, PII flags.

## F

### False Positive
Clean content incorrectly flagged as malicious. Reported via Feedback API for system improvement.

### Final Score
Combined detection score (0-100) after Arbiter fusion. Determines final decision.

## G

### Grafana
Monitoring dashboard system. Displays detection metrics, trends, and alerts.

## H

### Heavy Sanitization
Aggressive content cleaning for scores 65-84. Removes all detected patterns, inserts placeholders.

### Heuristics
Pattern-based detection approach. Fast and deterministic. Branch A uses heuristics.

### Hybrid Language Detection
Language identification using both statistical analysis (langdetect) and entity-based hints (PESEL → Polish).

## I

### Investigation Panel
Web UI component for searching and analyzing past detections. Shows score breakdowns and matched patterns.

## J

### Jailbreak
Attack attempting to bypass LLM safety guidelines. Common category: JAILBREAK_ATTEMPT.

### JWT (JSON Web Token)
Authentication mechanism for Web UI and API. 24-hour expiration, signed with JWT_SECRET.

## L

### Light Sanitization
Minimal content cleaning for scores 30-64. Removes obvious threats, preserves content structure.

### Llama Guard 2
Meta's safety classification model. Powers Branch C for ML-based threat detection.

## M

### MergeTree
ClickHouse table engine. Optimized for high-volume inserts and aggregation queries.

## N

### n8n
Workflow automation platform hosting the detection pipeline. Contains 40+ nodes for processing.

### NIP (Numer Identyfikacji Podatkowej)
Polish tax identification number. 10-digit format with checksum validation.

## O

### OWASP AITG
Open Web Application Security Project - AI Testing Guidelines. Framework for LLM security testing.

## P

### PESEL
Polish national identification number. 11-digit format encoding birth date and gender.

### PII (Personally Identifiable Information)
Data that can identify an individual: names, emails, phone numbers, government IDs.

### Pipeline
The 40-node detection workflow processing input from webhook to final decision.

### Presidio
Microsoft's PII detection framework. Supports 50+ entity types with ML and rule-based recognizers.

### Prompt Injection
Attack where user input manipulates LLM behavior. Primary threat category.

## R

### RBAC (Role-Based Access Control)
Permission system: can_view_monitoring, can_view_configuration, can_manage_users.

### REGON
Polish statistical number for businesses. 9 or 14 digits.

### rules.config.json
Pattern definition file. Contains 993 keywords across 44 categories. Edit via Web UI only.

## S

### SANITIZE
Decision status indicating content was cleaned before forwarding. Light (30-64) or Heavy (65-84).

### Score Breakdown
Per-branch scoring details showing which patterns matched and their individual contributions.

### Semantic Similarity
Cosine distance between text embeddings. Used by Branch B to match threat categories.

### Session ID
Unique identifier linking related requests. Used for conversation tracking.

## T

### Threshold
Score boundary for decisions:
- `sanitize_light_threshold`: 30 (default)
- `sanitize_heavy_threshold`: 65 (default)
- `block_threshold`: 50 (default, 85 for actual blocking)

### TTL (Time-To-Live)
Data retention period. Events expire after configured days (default: 90).

## U

### unified_config.json
Main configuration file. Contains thresholds, weights, category settings, PII options.

## V

### Vigil Guard
The complete prompt injection detection and defense platform.

### vigil-net
Docker network connecting all 9 services. Internal DNS resolution for container communication.

## W

### Webhook
HTTP endpoint receiving prompts for analysis: `/webhook/vigil-guard-2`

### Weight
Branch contribution to final score. A=0.30, B=0.35, C=0.35.

### Workflow
n8n automation containing the detection pipeline. File: `Vigil Guard v2.0.0.json`

---

## Related Documentation

- [Architecture](ARCHITECTURE.md)
- [Detection Categories](DETECTION_CATEGORIES.md)
- [API Reference](API.md)
