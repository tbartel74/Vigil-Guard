# Threat Detection

Last updated: 2025-12-12

## Branch A – Heuristics
- Obfuscation: zero-width, homoglyphs, mixed scripts, base64/hex, spacing anomalies.
- Structure: code fences, boundaries, newline ratio, segment variance.
- Whisper: roleplay, dividers, question repetition, pattern-based heuristics.
- Entropy (lang-aware): KL divergence vs EN/PL, bigram frequency (EN/PL), char-class diversity, Shannon, random segments, perplexity, repetition.
- Security keywords: SQLi (UNION, OR 1=1, DROP/DELETE, hex), XSS (script, handlers, javascript:), command injection (chaining, pipes, backticks), privilege escalation (sudo/root/admin, chmod 777, /etc/passwd).

## Branch B – Semantic
- Embedding similarity to known attacks; `high_similarity` signal can trigger arbiter boost.
- Two-Phase search: attack embeddings + SAFE embeddings for educational content.

## Branch C – LLM Safety Engine
- Llama Guard-based threat classifier, returns `is_attack` or `risk_score`.

## Arbiter (v2.1.0)
- Weights: A 0.30, B 0.40, C 0.30; BLOCK threshold 50.
- Solo-PG exception: When only PG is high (≥70) and H<15 AND S<15, reduce to score=45 (SANITIZE).
- Boosts: CONSERVATIVE_OVERRIDE (with solo-PG exception), SEMANTIC_CORROBORATION, LLM_GUARD_VETO (requires corroboration), UNANIMOUS_LOW, SEMANTIC_HIGH_SIMILARITY.
- Degradation: offline branches down-weighted; all degraded → BLOCK.
