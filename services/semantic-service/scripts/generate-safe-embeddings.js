#!/usr/bin/env node
/**
 * Generate Safe Pattern Embeddings for Two-Phase Search
 *
 * This script creates SAFE embeddings from the safe patterns dataset to populate
 * the semantic_safe_embeddings table for Two-Phase Search false positive reduction.
 *
 * Data source:
 *   - data/datasets/safe_patterns_small.jsonl (1445 patterns)
 *
 * Output format matches semantic_safe_embeddings schema:
 *   - category: 'SAFE'
 *   - subcategory: original subcategory from dataset
 *   - pattern_text: original text
 *   - embedding: 384-dim E5 embedding
 *   - embedding_model: 'multilingual-e5-small-int8'
 *   - prefix_type: 'passage' (for database patterns)
 *   - source_dataset: 'safe_patterns'
 *   - source: original source (dolly, alpaca, etc.)
 *   - language: 'en' or 'pl'
 *   - source_index: line number from source file
 *
 * Usage:
 *   node scripts/generate-safe-embeddings.js
 *   node scripts/generate-safe-embeddings.js --output data/datasets/safe_embeddings.jsonl
 */

const fs = require('fs');
const path = require('path');

// Paths - all datasets in data/datasets/ for consistency
const INPUT_FILE = path.join(__dirname, '../data/datasets/safe_patterns_small.jsonl');
const OUTPUT_FILE = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : path.join(__dirname, '../data/datasets/safe_embeddings.jsonl');

async function main() {
    console.log('='.repeat(60));
    console.log('Safe Pattern Embeddings Generator');
    console.log('Two-Phase Search v2.1.0');
    console.log('='.repeat(60));

    // Check input file exists
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`ERROR: Input file not found: ${INPUT_FILE}`);
        console.error('Please ensure safe_patterns_small.jsonl is in data/datasets/');
        process.exit(1);
    }

    // Count lines first
    console.log(`\nInput file: ${INPUT_FILE}`);
    const fileContent = fs.readFileSync(INPUT_FILE, 'utf-8');
    const lines = fileContent.trim().split('\n');
    const totalPatterns = lines.length;
    console.log(`Total patterns: ${totalPatterns}`);

    // Subcategory breakdown
    const subcategoryCount = {};
    const sourceCount = {};
    let metadataErrors = 0;
    for (const line of lines) {
        try {
            const record = JSON.parse(line);
            const subcat = record.subcategory || 'unknown';
            const source = record.source || 'unknown';
            subcategoryCount[subcat] = (subcategoryCount[subcat] || 0) + 1;
            sourceCount[source] = (sourceCount[source] || 0) + 1;
        } catch (e) {
            console.warn(`[WARN] Metadata line ${lines.indexOf(line) + 1}: ${e.message}`);
            metadataErrors++;
        }
    }
    if (metadataErrors > 0) {
        console.warn(`[WARN] ${metadataErrors} lines failed during metadata collection`);
    }
    console.log('\nSource breakdown:');
    for (const [src, count] of Object.entries(sourceCount).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${src}: ${count}`);
    }

    // Initialize embedding generator
    console.log('\nInitializing E5 embedding model...');
    const generator = require('../src/embedding/generator');
    await generator.initialize();
    console.log('Model ready');

    // Generate embeddings
    console.log('\nGenerating embeddings (passage mode for safe patterns)...');
    const startTime = Date.now();
    const output = fs.createWriteStream(OUTPUT_FILE);

    let processed = 0;
    let skipped = 0;
    const errorsByType = {};

    for (let i = 0; i < lines.length; i++) {
        try {
            const record = JSON.parse(lines[i]);
            const text = record.text || record.pattern_text;

            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                skipped++;
                continue;
            }

            // Generate embedding with passage prefix (for database patterns)
            const embedding = await generator.generatePassage(text.trim());

            // Create record for semantic_safe_embeddings table
            const outputRecord = {
                category: record.category || 'SAFE',
                subcategory: record.subcategory || 'unknown',
                pattern_text: text.trim(),
                embedding: embedding,
                embedding_model: 'multilingual-e5-small-int8',
                model_revision: '',
                prefix_type: 'passage',
                source_dataset: 'safe_patterns',
                source: record.source || '',
                language: record.language || 'en',
                source_index: i
            };

            output.write(JSON.stringify(outputRecord) + '\n');
            processed++;

            // Progress
            if ((processed) % 100 === 0 || i === lines.length - 1) {
                process.stdout.write(`\rProcessed: ${processed}/${totalPatterns} (skipped: ${skipped})`);
            }
        } catch (e) {
            const errorType = e.message.includes('JSON') ? 'JSON_PARSE' :
                              e.message.includes('embedding') ? 'EMBEDDING' :
                              e.message.includes('ENOSPC') ? 'DISK_FULL' :
                              'UNKNOWN';

            console.error(`\n[ERROR] Line ${i + 1} (${errorType}): ${e.message.substring(0, 100)}`);
            errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;

            // Fail-fast on critical errors
            if (errorType === 'DISK_FULL') {
                console.error('\n❌ FATAL: Disk full, aborting');
                process.exit(1);
            }

            skipped++;
        }
    }

    // Print error breakdown if any errors occurred
    if (Object.keys(errorsByType).length > 0) {
        console.log('\n⚠️  Processing errors:');
        for (const [type, count] of Object.entries(errorsByType)) {
            console.log(`   ${type}: ${count}`);
        }
    }

    output.end();

    const elapsed = Date.now() - startTime;
    console.log('\n');
    console.log('='.repeat(60));
    console.log('Generation Complete');
    console.log('='.repeat(60));
    console.log(`Output file:     ${OUTPUT_FILE}`);
    console.log(`Patterns:        ${processed}`);
    console.log(`Skipped:         ${skipped}`);
    console.log(`Sources:         ${Object.keys(sourceCount).length}`);
    console.log(`Time:            ${elapsed}ms`);
    console.log(`Rate:            ${Math.round(processed / (elapsed / 1000))} patterns/sec`);
    console.log('='.repeat(60));
    console.log(`\nNext step: Import to ClickHouse`);
    console.log(`  CLICKHOUSE_HOST=localhost CLICKHOUSE_PASSWORD='xxx' node scripts/import-embeddings.js \\`);
    console.log(`    --input ${OUTPUT_FILE} --table semantic_safe_embeddings`);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
