#!/usr/bin/env node
/**
 * Import Embeddings to ClickHouse
 * Semantic Service - Branch B
 * Version: 1.0.0
 *
 * Usage:
 *   node import-embeddings.js --input embeddings.jsonl
 *   node import-embeddings.js --input embeddings.jsonl --truncate
 *   node import-embeddings.js --help
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const http = require('http');
const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    clickhouse: {
        host: process.env.CLICKHOUSE_HOST || 'localhost',
        port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
        database: process.env.CLICKHOUSE_DATABASE || 'n8n_logs',
        user: process.env.CLICKHOUSE_USER || 'admin',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        table: 'pattern_embeddings'  // Will be overridden by --table argument
    },
    batchSize: parseInt(process.env.BATCH_SIZE || '100', 10),
    timeout: parseInt(process.env.TIMEOUT || '30000', 10)
};

// Table schema flags - auto-detected based on table name
let useV2Schema = false;
let useSafeSchema = false;

// ============================================================================
// ClickHouse Client
// ============================================================================

class ClickHouseClient {
    constructor(config) {
        this.config = config;
        this.baseUrl = `http://${config.host}:${config.port}`;
    }

    async query(sql, format = 'JSON') {
        const url = new URL(this.baseUrl);
        url.searchParams.set('database', this.config.database);
        url.searchParams.set('user', this.config.user);
        if (this.config.password) {
            url.searchParams.set('password', this.config.password);
        }

        // Add FORMAT to SQL if not already present (for SELECT queries)
        const sqlWithFormat = format !== 'text' && !sql.trim().toUpperCase().includes('FORMAT ') && sql.trim().toUpperCase().startsWith('SELECT')
            ? `${sql.trim()} FORMAT ${format}`
            : sql;

        return new Promise((resolve, reject) => {
            const options = {
                method: 'POST',
                hostname: this.config.host,
                port: this.config.port,
                path: url.search,
                headers: {
                    'Content-Type': 'text/plain'
                },
                timeout: CONFIG.timeout
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        reject(new Error(`ClickHouse error ${res.statusCode}: ${data}`));
                    } else {
                        try {
                            resolve(format === 'JSON' ? JSON.parse(data) : data);
                        } catch {
                            resolve(data);
                        }
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(sqlWithFormat);
            req.end();
        });
    }

    async insertBatch(records) {
        if (!records.length) return;

        if (useSafeSchema) {
            return this.insertBatchSafe(records);
        }

        if (useV2Schema) {
            return this.insertBatchV2(records);
        }

        const values = records.map(r => {
            const embedding = Array.isArray(r.embedding)
                ? `[${r.embedding.join(',')}]`
                : r.embedding;

            return `(
                '${this.escape(r.pattern_id)}',
                '${this.escape(r.category)}',
                '${this.escape(r.pattern_text)}',
                '${this.escape(r.pattern_norm || '')}',
                ${embedding},
                '${this.escape(r.embedding_model || 'all-MiniLM-L6-v2-int8')}',
                '${this.escape(r.source_dataset || '')}',
                ${r.source_index || 0},
                now(),
                now()
            )`;
        }).join(',\n');

        const sql = `
            INSERT INTO ${this.config.table} (
                pattern_id, category, pattern_text, pattern_norm,
                embedding, embedding_model, source_dataset, source_index,
                created_at, updated_at
            ) VALUES ${values}
        `;

        return this.query(sql, 'text');
    }

    async insertBatchV2(records) {
        // V2 schema: pattern_embeddings_v2 with E5-specific fields
        const values = records.map(r => {
            const embedding = Array.isArray(r.embedding)
                ? `[${r.embedding.join(',')}]`
                : r.embedding;

            // Map prefix_type string to enum value
            const prefixType = r.prefix_type === 'query' ? 'query' : 'passage';

            return `(
                '${this.escape(r.category)}',
                '${this.escape(r.pattern_text)}',
                ${embedding},
                '${this.escape(r.embedding_model || 'multilingual-e5-small-int8')}',
                '${this.escape(r.model_revision || '')}',
                '${prefixType}',
                '${this.escape(r.source_dataset || '')}',
                ${r.source_index || 0}
            )`;
        }).join(',\n');

        const sql = `
            INSERT INTO ${this.config.table} (
                category, pattern_text, embedding,
                embedding_model, model_revision, prefix_type,
                source_dataset, source_index
            ) VALUES ${values}
        `;

        return this.query(sql, 'text');
    }

    async insertBatchSafe(records) {
        // SAFE patterns table: semantic_safe_embeddings with subcategory, source, language
        const values = records.map(r => {
            const embedding = Array.isArray(r.embedding)
                ? `[${r.embedding.join(',')}]`
                : r.embedding;

            // Map prefix_type string to enum value
            const prefixType = r.prefix_type === 'query' ? 'query' : 'passage';

            // Extract subcategory from original data (e.g., 'code_instruction', 'dolly_classification')
            const subcategory = r.subcategory || r.source_dataset || 'unknown';

            // Extract source (e.g., 'dolly', 'code_alpaca')
            const source = r.source || '';

            // Language
            const language = r.language || 'en';

            return `(
                '${this.escape(r.category || 'SAFE')}',
                '${this.escape(subcategory)}',
                '${this.escape(r.pattern_text)}',
                ${embedding},
                '${this.escape(r.embedding_model || 'multilingual-e5-small-int8')}',
                '${this.escape(r.model_revision || '')}',
                '${prefixType}',
                '${this.escape(r.source_dataset || '')}',
                '${this.escape(source)}',
                '${this.escape(language)}',
                ${r.source_index || 0}
            )`;
        }).join(',\n');

        const sql = `
            INSERT INTO ${this.config.table} (
                category, subcategory, pattern_text, embedding,
                embedding_model, model_revision, prefix_type,
                source_dataset, source, language, source_index
            ) VALUES ${values}
        `;

        return this.query(sql, 'text');
    }

    escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    async truncate() {
        return this.query(`TRUNCATE TABLE ${this.config.table}`, 'text');
    }

    async count() {
        const result = await this.query(`SELECT count() as cnt FROM ${this.config.table}`);
        return result.data[0].cnt;
    }

    async healthCheck() {
        try {
            await this.query('SELECT 1', 'text');
            return true;
        } catch {
            return false;
        }
    }
}

// ============================================================================
// Import Logic
// ============================================================================

async function importEmbeddings(inputPath, options = {}) {
    const client = new ClickHouseClient(CONFIG.clickhouse);

    console.log('='.repeat(60));
    console.log('Embedding Importer - Semantic Service');
    console.log('='.repeat(60));
    console.log(`Input:      ${inputPath}`);
    console.log(`ClickHouse: ${CONFIG.clickhouse.host}:${CONFIG.clickhouse.port}`);
    console.log(`Database:   ${CONFIG.clickhouse.database}`);
    console.log(`Table:      ${CONFIG.clickhouse.table}`);
    console.log(`Batch size: ${CONFIG.batchSize}`);
    console.log('='.repeat(60));

    // Health check
    console.log('\nChecking ClickHouse connection...');
    if (!await client.healthCheck()) {
        console.error('ERROR: Cannot connect to ClickHouse');
        process.exit(1);
    }
    console.log('Connected to ClickHouse');

    // Truncate if requested
    if (options.truncate) {
        console.log('\nTruncating table...');
        await client.truncate();
        console.log('Table truncated');
    }

    // Get initial count
    const initialCount = await client.count();
    console.log(`Initial record count: ${initialCount}`);

    // Read and import
    console.log('\nImporting embeddings...');
    const startTime = Date.now();

    const rl = readline.createInterface({
        input: fs.createReadStream(inputPath),
        crlfDelay: Infinity
    });

    let batch = [];
    let totalImported = 0;
    let totalSkipped = 0;
    let lineNumber = 0;

    for await (const line of rl) {
        lineNumber++;
        if (!line.trim()) continue;

        try {
            const record = JSON.parse(line);

            // Validate embedding
            if (!record.embedding || !Array.isArray(record.embedding)) {
                console.warn(`Line ${lineNumber}: Missing or invalid embedding, skipping`);
                totalSkipped++;
                continue;
            }

            if (record.embedding.length !== 384) {
                console.warn(`Line ${lineNumber}: Invalid embedding dimension (${record.embedding.length}), skipping`);
                totalSkipped++;
                continue;
            }

            batch.push(record);

            if (batch.length >= CONFIG.batchSize) {
                await client.insertBatch(batch);
                totalImported += batch.length;
                process.stdout.write(`\rImported: ${totalImported}`);
                batch = [];
            }
        } catch (e) {
            console.warn(`\nLine ${lineNumber}: JSON parse error: ${e.message}`);
            totalSkipped++;
        }
    }

    // Import remaining batch
    if (batch.length > 0) {
        await client.insertBatch(batch);
        totalImported += batch.length;
    }

    const elapsed = Date.now() - startTime;
    const finalCount = await client.count();

    console.log('\n');
    console.log('='.repeat(60));
    console.log('Import Complete');
    console.log('='.repeat(60));
    console.log(`Total imported:  ${totalImported}`);
    console.log(`Total skipped:   ${totalSkipped}`);
    console.log(`Final count:     ${finalCount}`);
    console.log(`Import time:     ${elapsed}ms`);
    console.log(`Rate:            ${Math.round(totalImported / (elapsed / 1000))} records/sec`);
    console.log('='.repeat(60));

    // Update metadata
    await updateMetadata(client, totalImported);

    // Log audit entry
    await logAuditEntry(client, 'INSERT', totalImported, options.truncate);

    return { totalImported, totalSkipped, elapsed };
}

async function updateMetadata(client, count) {
    try {
        await client.query(`
            INSERT INTO embedding_metadata (id, key, value)
            VALUES
                (8, 'pattern_count', '${count}'),
                (10, 'last_import', '${new Date().toISOString()}')
        `, 'text');
    } catch (e) {
        console.warn('Warning: Could not update metadata:', e.message);
    }
}

async function logAuditEntry(client, action, count, truncated) {
    try {
        const details = JSON.stringify({
            records_imported: count,
            truncated: truncated || false,
            timestamp: new Date().toISOString()
        });

        await client.query(`
            INSERT INTO embedding_audit_log (action, details, user_id)
            VALUES ('${action}', '${client.escape(details)}', 'import-script')
        `, 'text');
    } catch (e) {
        console.warn('Warning: Could not log audit entry:', e.message);
    }
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
    console.log(`
Embedding Importer - Semantic Service

Usage:
    node import-embeddings.js --input <file> [options]

Options:
    --input, -i     Input JSONL file with embeddings (required)
    --truncate, -t  Truncate table before import
    --batch, -b     Batch size (default: 100)
    --help, -h      Show this help

Environment Variables:
    CLICKHOUSE_HOST      ClickHouse host (default: localhost)
    CLICKHOUSE_PORT      ClickHouse HTTP port (default: 8123)
    CLICKHOUSE_DATABASE  Database name (default: n8n_logs)
    CLICKHOUSE_USER      Username (default: admin)
    CLICKHOUSE_PASSWORD  Password (required)

Examples:
    node import-embeddings.js --input embeddings.jsonl
    node import-embeddings.js -i embeddings.jsonl --truncate
    CLICKHOUSE_PASSWORD=secret node import-embeddings.js -i data.jsonl
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        printHelp();
        process.exit(0);
    }

    let inputPath = null;
    let truncate = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--input' || arg === '-i') {
            inputPath = args[++i];
        } else if (arg === '--truncate' || arg === '-t') {
            truncate = true;
        } else if (arg === '--batch' || arg === '-b') {
            CONFIG.batchSize = parseInt(args[++i], 10);
        } else if (arg === '--table') {
            CONFIG.clickhouse.table = args[++i];
            // Auto-detect schema type
            useSafeSchema = CONFIG.clickhouse.table.includes('_safe_');
            useV2Schema = CONFIG.clickhouse.table.includes('_v2') && !useSafeSchema;
        }
    }

    if (!inputPath) {
        console.error('ERROR: --input is required');
        printHelp();
        process.exit(1);
    }

    if (!fs.existsSync(inputPath)) {
        console.error(`ERROR: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    if (!CONFIG.clickhouse.password) {
        console.error('ERROR: CLICKHOUSE_PASSWORD environment variable is required');
        process.exit(1);
    }

    try {
        await importEmbeddings(inputPath, { truncate });
        console.log('\nImport successful!');
    } catch (e) {
        console.error('\nImport failed:', e.message);
        process.exit(1);
    }
}

main();
