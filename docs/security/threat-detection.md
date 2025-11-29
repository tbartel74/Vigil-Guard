# Threat Detection

Last updated: 2025-11-26

## Branch A – Heuristics
- Obfuscation: zero-width, homoglyphs, mixed scripts, base64/hex, spacing anomalies.
- Structure: code fences, boundaries, newline ratio, segment variance.
- Whisper: roleplay, dividers, question repetition, pattern-based heuristics.
- Entropy (lang-aware): KL divergence vs EN/PL, bigram frequency (EN/PL), char-class diversity, Shannon, random segments, perplexity, repetition.
- Security keywords: SQLi (UNION, OR 1=1, DROP/DELETE, hex), XSS (script, handlers, javascript:), command injection (chaining, pipes, backticks), privilege escalation (sudo/root/admin, chmod 777, /etc/passwd).

## Branch B – Semantic
- Embedding similarity to known attacks; `high_similarity` signal can trigger arbiter boost.

## Branch C – NLP Safety
- Llama Guard-based threat classifier, returns `is_attack` or `risk_score`.

## Arbiter
- Weights: A 0.30, B 0.35, C 0.35; BLOCK threshold 50.
- Boosts: conservative override (C attack + high confidence), semantic high similarity, heuristics critical, llm_guard_high_confidence, unanimous_high.
- Degradation: offline branches down-weighted; all degraded → BLOCK.
