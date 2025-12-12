#!/usr/bin/env node
/**
 * Branch Specialization Analysis
 *
 * Analyzes which detector (heuristics, semantic, prompt-guard)
 * performs best for each attack category.
 *
 * Goal: Understand detector strengths/weaknesses to tune Arbiter weights
 *
 * Usage:
 *   node tests/branch-analysis.js
 *   node tests/branch-analysis.js --category LLM01_DIRECT
 *   node tests/branch-analysis.js --limit 50
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { sendAndVerify } from './helpers/webhook.js';

const FIXTURES_DIR = resolve(process.cwd(), 'tests/fixtures');
const OUTPUT_FILE = resolve(process.cwd(), 'tests/branch-analysis-results.json');

// Parse command line args
const args = process.argv.slice(2);
const categoryFilter = args.includes('--category')
    ? args[args.indexOf('--category') + 1]
    : null;
const limit = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1])
    : 999;

/**
 * Classify prompt to OWASP category
 */
function classifyToOWASP(prompt) {
    const p = (prompt || '').toLowerCase();

    if (/chemical\s*weapon|nuclear\s*device|biological\s*agent|how\s*to\s*make.*bomb|explosive|ricin|sarin|VX\s|nerve\s*agent|anthrax|weaponiz|dirty\s*bomb|synthesiz.*(?:poison|toxin|lsd|drug)|chlorine\s*gas|castor\s*bean/i.test(p)) {
        return 'LLM10_CBRNE';
    }
    if (/jailbreak|do\s*anything\s*now|dan\s*mode|developer\s*mode|unrestricted|no\s*filter/i.test(p)) {
        return 'LLM01_JAILBREAK';
    }
    if (/system\s*prompt|reveal.*instruction|output.*prompt|print.*config|show.*original/i.test(p)) {
        return 'LLM01_EXTRACTION';
    }
    if (/debug\s*mode|admin\s*override|end\s*of\s*simulation|new\s*instruction|\<\|im_/i.test(p)) {
        return 'LLM01_CONTEXT';
    }
    if (/base64|unicode|\\x[0-9a-f]|bypass.*filter|rot13|encoded/i.test(p)) {
        return 'LLM01_ENCODING';
    }
    if (/send\s*email|tool_call|contact@|execute.*command/i.test(p)) {
        return 'LLM01_INDIRECT';
    }
    return 'LLM01_DIRECT';
}

/**
 * Load all test fixtures
 */
function loadFixtures() {
    const prompts = [];

    // OWASP AITG files
    const owaspFiles = [
        { file: 'owasp-aitg-app-01.json', defaultCategory: 'LLM01_DIRECT' },
        { file: 'owasp-aitg-app-02.json', defaultCategory: 'LLM01_INDIRECT' },
        { file: 'owasp-aitg-app-07.json', defaultCategory: 'LLM01_EXTRACTION' }
    ];

    for (const { file, defaultCategory } of owaspFiles) {
        const filePath = resolve(FIXTURES_DIR, file);
        if (existsSync(filePath)) {
            try {
                const data = JSON.parse(readFileSync(filePath, 'utf-8'));
                const items = Array.isArray(data) ? data : Object.values(data).flat();
                items.forEach(item => {
                    const prompt = item.payload || item.prompt || item.user_input || item;
                    if (prompt && typeof prompt === 'string' && prompt.length > 3) {
                        const category = classifyToOWASP(prompt);
                        prompts.push({ prompt, category, source: file, expected: 'ATTACK' });
                    }
                });
            } catch (e) { /* skip */ }
        }
    }

    // Malicious prompts
    const maliciousPath = resolve(FIXTURES_DIR, 'malicious-prompts.json');
    if (existsSync(maliciousPath)) {
        try {
            const data = JSON.parse(readFileSync(maliciousPath, 'utf-8'));
            for (const [group, items] of Object.entries(data)) {
                if (Array.isArray(items)) {
                    items.forEach(prompt => {
                        if (prompt && typeof prompt === 'string' && prompt.length > 3) {
                            const category = classifyToOWASP(prompt);
                            prompts.push({ prompt, category, source: 'malicious-prompts.json', expected: 'ATTACK' });
                        }
                    });
                }
            }
        } catch (e) { /* skip */ }
    }

    // Benign prompts (FP testing)
    const benignPath = resolve(FIXTURES_DIR, 'benign-prompts.json');
    if (existsSync(benignPath)) {
        try {
            const data = JSON.parse(readFileSync(benignPath, 'utf-8'));
            for (const [subcategory, items] of Object.entries(data)) {
                if (Array.isArray(items)) {
                    items.forEach(prompt => {
                        prompts.push({
                            prompt,
                            category: 'BENIGN_FP',
                            subcategory,
                            source: 'benign-prompts.json',
                            expected: 'SAFE'
                        });
                    });
                }
            }
        } catch (e) { /* skip */ }
    }

    return prompts;
}

/**
 * Determine which branch(es) would have caught this attack
 */
function analyzeBranchContribution(event, expected) {
    const a = event.branch_a_score || 0;  // heuristics
    const b = event.branch_b_score || 0;  // semantic
    const c = event.branch_c_score || 0;  // prompt-guard

    const THRESHOLD = 30;  // Detection threshold

    return {
        heuristics: { score: a, wouldCatch: a >= THRESHOLD },
        semantic: { score: b, wouldCatch: b >= THRESHOLD },
        promptGuard: { score: c, wouldCatch: c >= THRESHOLD },
        combined: event.threat_score || 0,
        detected: event.final_status === 'BLOCKED' || event.final_status === 'SANITIZED' || event.threat_score >= THRESHOLD,
        expected
    };
}

/**
 * Main analysis
 */
async function main() {
    console.log('=' .repeat(70));
    console.log('Branch Specialization Analysis');
    console.log('=' .repeat(70));

    // Load fixtures
    const allPrompts = loadFixtures();
    console.log(`\nLoaded ${allPrompts.length} test prompts`);

    // Filter by category if specified
    let prompts = categoryFilter
        ? allPrompts.filter(p => p.category === categoryFilter)
        : allPrompts;

    // Apply limit
    prompts = prompts.slice(0, limit);

    console.log(`Testing ${prompts.length} prompts${categoryFilter ? ` (category: ${categoryFilter})` : ''}`);

    // Group by category for analysis
    const results = {
        timestamp: new Date().toISOString(),
        totalPrompts: prompts.length,
        byCategory: {},
        branchStats: {
            heuristics: { caught: 0, missed: 0, fp: 0 },
            semantic: { caught: 0, missed: 0, fp: 0 },
            promptGuard: { caught: 0, missed: 0, fp: 0 },
            combined: { caught: 0, missed: 0, fp: 0 }
        },
        details: []
    };

    // Process each prompt
    let processed = 0;
    for (const item of prompts) {
        processed++;
        const preview = item.prompt.substring(0, 40).replace(/\n/g, ' ');
        process.stdout.write(`\r[${processed}/${prompts.length}] Testing: ${preview}...`);

        try {
            const event = await sendAndVerify(item.prompt, { maxWait: 15000 });
            const analysis = analyzeBranchContribution(event, item.expected);

            // Initialize category stats
            if (!results.byCategory[item.category]) {
                results.byCategory[item.category] = {
                    total: 0,
                    detected: 0,
                    missed: 0,
                    fp: 0,
                    heuristicsOnly: 0,
                    semanticOnly: 0,
                    promptGuardOnly: 0,
                    multipleDetectors: 0,
                    noneDetected: 0,
                    avgScores: { a: 0, b: 0, c: 0, combined: 0 },
                    examples: []
                };
            }

            const cat = results.byCategory[item.category];
            cat.total++;

            // Track scores for averaging
            cat.avgScores.a += analysis.heuristics.score;
            cat.avgScores.b += analysis.semantic.score;
            cat.avgScores.c += analysis.promptGuard.score;
            cat.avgScores.combined += analysis.combined;

            // Analyze detection
            if (item.expected === 'ATTACK') {
                if (analysis.detected) {
                    cat.detected++;
                    results.branchStats.combined.caught++;

                    // Which branch(es) caught it?
                    const catchers = [];
                    if (analysis.heuristics.wouldCatch) catchers.push('heuristics');
                    if (analysis.semantic.wouldCatch) catchers.push('semantic');
                    if (analysis.promptGuard.wouldCatch) catchers.push('promptGuard');

                    if (catchers.length === 1) {
                        if (catchers[0] === 'heuristics') cat.heuristicsOnly++;
                        if (catchers[0] === 'semantic') cat.semanticOnly++;
                        if (catchers[0] === 'promptGuard') cat.promptGuardOnly++;
                    } else if (catchers.length > 1) {
                        cat.multipleDetectors++;
                    }

                    // Branch stats
                    if (analysis.heuristics.wouldCatch) results.branchStats.heuristics.caught++;
                    else results.branchStats.heuristics.missed++;

                    if (analysis.semantic.wouldCatch) results.branchStats.semantic.caught++;
                    else results.branchStats.semantic.missed++;

                    if (analysis.promptGuard.wouldCatch) results.branchStats.promptGuard.caught++;
                    else results.branchStats.promptGuard.missed++;

                } else {
                    cat.missed++;
                    cat.noneDetected++;
                    results.branchStats.combined.missed++;
                    results.branchStats.heuristics.missed++;
                    results.branchStats.semantic.missed++;
                    results.branchStats.promptGuard.missed++;

                    // Store missed examples for analysis
                    if (cat.examples.length < 5) {
                        cat.examples.push({
                            prompt: item.prompt.substring(0, 100),
                            scores: { a: analysis.heuristics.score, b: analysis.semantic.score, c: analysis.promptGuard.score },
                            status: 'MISSED'
                        });
                    }
                }
            } else {
                // BENIGN - check for FP
                if (analysis.detected) {
                    cat.fp++;
                    results.branchStats.combined.fp++;

                    // Which branch caused the FP?
                    if (analysis.heuristics.wouldCatch) results.branchStats.heuristics.fp++;
                    if (analysis.semantic.wouldCatch) results.branchStats.semantic.fp++;
                    if (analysis.promptGuard.wouldCatch) results.branchStats.promptGuard.fp++;

                    // Store FP examples
                    if (cat.examples.length < 10) {
                        cat.examples.push({
                            prompt: item.prompt.substring(0, 100),
                            subcategory: item.subcategory,
                            scores: { a: analysis.heuristics.score, b: analysis.semantic.score, c: analysis.promptGuard.score },
                            status: 'FALSE_POSITIVE',
                            culprit: analysis.heuristics.wouldCatch ? 'heuristics' :
                                     analysis.semantic.wouldCatch ? 'semantic' : 'promptGuard'
                        });
                    }
                } else {
                    cat.detected++;  // Correctly identified as safe
                }
            }

            // Store detail
            results.details.push({
                prompt: item.prompt.substring(0, 100),
                category: item.category,
                expected: item.expected,
                detected: analysis.detected,
                scores: {
                    heuristics: analysis.heuristics.score,
                    semantic: analysis.semantic.score,
                    promptGuard: analysis.promptGuard.score,
                    combined: analysis.combined
                },
                wouldCatch: {
                    heuristics: analysis.heuristics.wouldCatch,
                    semantic: analysis.semantic.wouldCatch,
                    promptGuard: analysis.promptGuard.wouldCatch
                }
            });

        } catch (error) {
            console.error(`\n❌ Error testing prompt: ${error.message}`);
        }

        // Small delay to avoid overwhelming webhook
        await new Promise(r => setTimeout(r, 100));
    }

    // Calculate averages
    for (const [category, stats] of Object.entries(results.byCategory)) {
        if (stats.total > 0) {
            stats.avgScores.a = Math.round(stats.avgScores.a / stats.total);
            stats.avgScores.b = Math.round(stats.avgScores.b / stats.total);
            stats.avgScores.c = Math.round(stats.avgScores.c / stats.total);
            stats.avgScores.combined = Math.round(stats.avgScores.combined / stats.total);
        }
    }

    // Save results
    writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

    // Print summary
    console.log('\n\n' + '=' .repeat(70));
    console.log('RESULTS SUMMARY');
    console.log('=' .repeat(70));

    // Per-category stats
    console.log('\n📊 Detection by Category:');
    console.log('-'.repeat(70));
    console.log('Category'.padEnd(20) + 'Total'.padStart(8) + 'Detected'.padStart(10) + 'Rate'.padStart(8) + '  H-only  S-only  PG-only  Multi');
    console.log('-'.repeat(70));

    for (const [category, stats] of Object.entries(results.byCategory)) {
        if (category === 'BENIGN_FP') continue;
        const rate = stats.total > 0 ? ((stats.detected / stats.total) * 100).toFixed(1) : '0.0';
        console.log(
            category.padEnd(20) +
            stats.total.toString().padStart(8) +
            stats.detected.toString().padStart(10) +
            `${rate}%`.padStart(8) +
            stats.heuristicsOnly.toString().padStart(8) +
            stats.semanticOnly.toString().padStart(8) +
            stats.promptGuardOnly.toString().padStart(10) +
            stats.multipleDetectors.toString().padStart(7)
        );
    }

    // Benign (FP) stats
    const benign = results.byCategory['BENIGN_FP'];
    if (benign) {
        console.log('-'.repeat(70));
        const fpRate = benign.total > 0 ? ((benign.fp / benign.total) * 100).toFixed(1) : '0.0';
        console.log(`BENIGN_FP`.padEnd(20) + benign.total.toString().padStart(8) +
                    `${benign.fp} FP`.padStart(10) + `${fpRate}%`.padStart(8));
    }

    // Branch specialization summary
    console.log('\n📈 Branch Specialization:');
    console.log('-'.repeat(50));

    const hStats = results.branchStats.heuristics;
    const sStats = results.branchStats.semantic;
    const pgStats = results.branchStats.promptGuard;

    const hTotal = hStats.caught + hStats.missed;
    const sTotal = sStats.caught + sStats.missed;
    const pgTotal = pgStats.caught + pgStats.missed;

    console.log(`Heuristics:   ${hStats.caught}/${hTotal} caught (${hTotal > 0 ? ((hStats.caught/hTotal)*100).toFixed(1) : 0}%) | FP: ${hStats.fp}`);
    console.log(`Semantic:     ${sStats.caught}/${sTotal} caught (${sTotal > 0 ? ((sStats.caught/sTotal)*100).toFixed(1) : 0}%) | FP: ${sStats.fp}`);
    console.log(`Prompt Guard: ${pgStats.caught}/${pgTotal} caught (${pgTotal > 0 ? ((pgStats.caught/pgTotal)*100).toFixed(1) : 0}%) | FP: ${pgStats.fp}`);

    // Average scores by category
    console.log('\n📉 Average Branch Scores by Category:');
    console.log('-'.repeat(70));
    console.log('Category'.padEnd(20) + 'Heuristics'.padStart(12) + 'Semantic'.padStart(12) + 'PromptGuard'.padStart(12) + 'Combined'.padStart(12));
    console.log('-'.repeat(70));

    for (const [category, stats] of Object.entries(results.byCategory)) {
        console.log(
            category.padEnd(20) +
            stats.avgScores.a.toString().padStart(12) +
            stats.avgScores.b.toString().padStart(12) +
            stats.avgScores.c.toString().padStart(12) +
            stats.avgScores.combined.toString().padStart(12)
        );
    }

    // FP analysis
    if (benign && benign.examples.length > 0) {
        console.log('\n⚠️  False Positive Examples:');
        console.log('-'.repeat(70));
        for (const ex of benign.examples) {
            console.log(`[${ex.culprit}] (H:${ex.scores.a} S:${ex.scores.b} PG:${ex.scores.c})`);
            console.log(`   ${ex.subcategory}: "${ex.prompt}..."`);
        }
    }

    // Missed attack examples
    console.log('\n❌ Missed Attack Examples (by category):');
    for (const [category, stats] of Object.entries(results.byCategory)) {
        if (category === 'BENIGN_FP') continue;
        const missed = stats.examples.filter(e => e.status === 'MISSED');
        if (missed.length > 0) {
            console.log(`\n${category}:`);
            for (const ex of missed.slice(0, 3)) {
                console.log(`   (H:${ex.scores.a} S:${ex.scores.b} PG:${ex.scores.c}) "${ex.prompt}..."`);
            }
        }
    }

    console.log('\n' + '=' .repeat(70));
    console.log(`Full results saved to: ${OUTPUT_FILE}`);
    console.log('=' .repeat(70));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
