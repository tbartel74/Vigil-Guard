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

// Paths
const INPUT_FILE = path.join(__dirname, '../data/security_education_patterns.json');
const OUTPUT_FILE = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : path.join(__dirname, '../data/security_education_embeddings.jsonl');

async function main() {
    console.log('='.repeat(60));
    console.log('Security Education Embeddings Generator');
    console.log('='.repeat(60));

    // Load patterns
    console.log(`\nLoading patterns from: ${INPUT_FILE}`);
    const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
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

    for (let i = 0; i < patterns.length; i++) {
        const patternText = patterns[i];

        // Generate embedding with passage prefix
        const embedding = await generator.generatePassage(patternText);

        // Create record for SAFE embeddings table
        const record = {
            category: data.category || 'SAFE',
            subcategory: data.subcategory || 'security_education_query',
            pattern_text: patternText,
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

        // Progress
        if ((i + 1) % 10 === 0 || i === patterns.length - 1) {
            process.stdout.write(`\rProcessed: ${i + 1}/${patterns.length}`);
        }
    }

    output.end();

    const elapsed = Date.now() - startTime;
    console.log('\n');
    console.log('='.repeat(60));
    console.log('Generation Complete');
    console.log('='.repeat(60));
    console.log(`Output file:     ${OUTPUT_FILE}`);
    console.log(`Patterns:        ${patterns.length}`);
    console.log(`Time:            ${elapsed}ms`);
    console.log(`Rate:            ${Math.round(patterns.length / (elapsed / 1000))} patterns/sec`);
    console.log('='.repeat(60));
    console.log(`\nNext step: Import to ClickHouse`);
    console.log(`  CLICKHOUSE_HOST=localhost CLICKHOUSE_PASSWORD='xxx' node scripts/import-embeddings.js \\`);
    console.log(`    --input ${OUTPUT_FILE} --table semantic_safe_embeddings`);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
