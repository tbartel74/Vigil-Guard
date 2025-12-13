#!/usr/bin/env node
/**
 * Generate embeddings for Security Education patterns
 *
 * This script creates SAFE embeddings for security education queries
 * to reduce false positives in the Two-Phase Search.
 *
 * Usage:
 *   node scripts/generate-security-education-embeddings.js
 *   node scripts/generate-security-education-embeddings.js --output data/security_education_embeddings.jsonl
 */

const fs = require('fs');
const path = require('path');

// Paths - all datasets in data/datasets/ for consistency
const INPUT_FILE = path.join(__dirname, '../data/datasets/security_education_patterns.json');
const OUTPUT_FILE = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : path.join(__dirname, '../data/datasets/security_education_embeddings.jsonl');

async function main() {
    console.log('='.repeat(60));
    console.log('Security Education Embeddings Generator');
    console.log('='.repeat(60));

    // Input validation
    console.log(`\nLoading patterns from: ${INPUT_FILE}`);
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ ERROR: Input file not found: ${INPUT_FILE}`);
        process.exit(1);
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
    } catch (e) {
        console.error(`❌ ERROR: Failed to parse JSON: ${e.message}`);
        process.exit(1);
    }

    if (!data.patterns || !Array.isArray(data.patterns)) {
        console.error('❌ ERROR: Input file must contain a "patterns" array');
        process.exit(1);
    }

    if (data.patterns.length === 0) {
        console.error('❌ ERROR: patterns array is empty');
        process.exit(1);
    }

    const patterns = data.patterns;
    console.log(`Found ${patterns.length} patterns`);

    // Initialize embedding generator
    console.log('\nInitializing E5 embedding model...');
    const generator = require('../src/embedding/generator');
    await generator.initialize();
    console.log('Model ready');

    // Generate embeddings
    console.log('\nGenerating embeddings (passage mode)...');
    const startTime = Date.now();
    const output = fs.createWriteStream(OUTPUT_FILE);

    let processed = 0;
    let skipped = 0;
    const errorsByType = {};

    for (let i = 0; i < patterns.length; i++) {
        try {
            const patternText = patterns[i];

            if (typeof patternText !== 'string' || patternText.trim().length === 0) {
                console.warn(`[WARN] Pattern ${i + 1}: Not a valid string, skipping`);
                skipped++;
                continue;
            }

            // Generate embedding with passage prefix
            const embedding = await generator.generatePassage(patternText.trim());

            // Create record for SAFE embeddings table
            const record = {
                category: data.category || 'SAFE',
                subcategory: data.subcategory || 'security_education_query',
                pattern_text: patternText.trim(),
                embedding: embedding,
                embedding_model: 'multilingual-e5-small-int8',
                model_revision: '',
                prefix_type: 'passage',
                source_dataset: 'security_education_patterns',
                source: 'vigil-guard-manual',
                language: patternText.match(/[ąćęłńóśźż]/i) ? 'pl' : 'en',
                source_index: i
            };

            output.write(JSON.stringify(record) + '\n');
            processed++;

            // Progress
            if ((processed + skipped) % 10 === 0 || i === patterns.length - 1) {
                process.stdout.write(`\rProcessed: ${processed}/${patterns.length} (skipped: ${skipped})`);
            }
        } catch (e) {
            const errorType = e.message.includes('embedding') ? 'EMBEDDING' :
                              e.message.includes('ENOSPC') ? 'DISK_FULL' :
                              'UNKNOWN';

            console.error(`\n[ERROR] Pattern ${i + 1} (${errorType}): ${e.message.substring(0, 100)}`);
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
