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
        table: 'pattern_embeddings_v2'  // Will be overridden by --table argument
    },
    batchSize: parseInt(process.env.BATCH_SIZE || '100', 10),
    timeout: parseInt(process.env.TIMEOUT || '30000', 10)
};

// Table schema flags - auto-detected based on table name
let useV2Schema = false;
let useSafeSchema = false;

// Valid table names whitelist (SQL injection prevention)
const VALID_TABLES = [
    'pattern_embeddings',
    'pattern_embeddings_v2',
    'semantic_safe_embeddings'
];

function validateTableName(table) {
    if (!VALID_TABLES.includes(table)) {
        throw new Error(`Invalid table name: ${table}. Allowed: ${VALID_TABLES.join(', ')}`);
    }
    return table;
}

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
                        } catch (parseError) {
                            console.error(`[ERROR] ClickHouse JSON parse failed: ${parseError.message}`);
                            console.error(`[ERROR] Raw response (first 200 chars): ${data.substring(0, 200)}`);
                            // Reject instead of resolve with wrong data type
                            reject(new Error(`ClickHouse returned invalid JSON: ${parseError.message}`));
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

        // Legacy schema - use JSONEachRow for SQL injection prevention
        validateTableName(this.config.table);

        const jsonLines = records.map(r => JSON.stringify({
            pattern_id: r.pattern_id || '',
            category: r.category || '',
            pattern_text: r.pattern_text || '',
            pattern_norm: r.pattern_norm || '',
            embedding: Array.isArray(r.embedding) ? r.embedding : [],
            embedding_model: r.embedding_model || 'multilingual-e5-small-int8',
            source_dataset: r.source_dataset || '',
            source_index: r.source_index || 0
        })).join('\n');

        const sql = `INSERT INTO ${this.config.table} FORMAT JSONEachRow\n${jsonLines}`;
        return this.query(sql, 'text');
    }

    async insertBatchV2(records) {
        // V2 schema: pattern_embeddings_v2 with E5-specific fields
        // Uses JSONEachRow format for SQL injection prevention
        validateTableName(this.config.table);

        const jsonLines = records.map(r => JSON.stringify({
            category: r.category || '',
            pattern_text: r.pattern_text || '',
            embedding: Array.isArray(r.embedding) ? r.embedding : [],
            embedding_model: r.embedding_model || 'multilingual-e5-small-int8',
            model_revision: r.model_revision || '',
            prefix_type: r.prefix_type === 'query' ? 'query' : 'passage',
            source_dataset: r.source_dataset || '',
            source_index: r.source_index || 0
        })).join('\n');

        const sql = `INSERT INTO ${this.config.table} FORMAT JSONEachRow\n${jsonLines}`;
        return this.query(sql, 'text');
    }

    async insertBatchSafe(records) {
        // SAFE patterns table: semantic_safe_embeddings with subcategory, source, language
        // Uses JSONEachRow format for SQL injection prevention
        validateTableName(this.config.table);

        const jsonLines = records.map(r => JSON.stringify({
            category: r.category || 'SAFE',
            subcategory: r.subcategory || r.source_dataset || 'unknown',
            pattern_text: r.pattern_text || '',
            embedding: Array.isArray(r.embedding) ? r.embedding : [],
            embedding_model: r.embedding_model || 'multilingual-e5-small-int8',
            model_revision: r.model_revision || '',
            prefix_type: r.prefix_type === 'query' ? 'query' : 'passage',
            source_dataset: r.source_dataset || '',
            source: r.source || '',
            language: r.language || 'en',
            source_index: r.source_index || 0
        })).join('\n');

        const sql = `INSERT INTO ${this.config.table} FORMAT JSONEachRow\n${jsonLines}`;
        return this.query(sql, 'text');
    }

    /**
     * @deprecated No longer needed - JSONEachRow handles escaping natively
     */
    escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/\0/g, '');
    }

    async truncate() {
        validateTableName(this.config.table);
        return this.query(`TRUNCATE TABLE ${this.config.table}`, 'text');
    }

    async count() {
        validateTableName(this.config.table);
        const result = await this.query(`SELECT count() as cnt FROM ${this.config.table}`);
        if (result && result.data && result.data[0] && 'cnt' in result.data[0]) {
            return result.data[0].cnt;
        }
        throw new Error(`Unexpected count response from ${this.config.table}`);
    }

    async healthCheck() {
        const startTime = Date.now();
        try {
            await this.query('SELECT 1', 'text');
            return {
                healthy: true,
                latencyMs: Date.now() - startTime
            };
        } catch (error) {
            const errorType = error.code === 'ECONNREFUSED' ? 'CONNECTION_REFUSED'
                : error.code === 'ENOTFOUND' ? 'DNS_ERROR'
                : error.message?.includes('auth') ? 'AUTH_FAILED'
                : error.message?.includes('timeout') ? 'TIMEOUT'
                : 'UNKNOWN';

            return {
                healthy: false,
                error: error.message,
                errorType,
                latencyMs: Date.now() - startTime
            };
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
    const health = await client.healthCheck();
    if (!health.healthy) {
        console.error(`ERROR: Cannot connect to ClickHouse: ${health.error} (${health.errorType})`);
        if (health.errorType === 'CONNECTION_REFUSED') {
            console.error('Hint: Is ClickHouse container running? docker ps | grep clickhouse');
        } else if (health.errorType === 'AUTH_FAILED') {
            console.error('Hint: Check CLICKHOUSE_PASSWORD environment variable');
        } else if (health.errorType === 'DNS_ERROR') {
            console.error('Hint: Check CLICKHOUSE_HOST environment variable');
        }
        process.exit(1);
    }
    console.log(`Connected to ClickHouse (${health.latencyMs}ms)`);

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
    const errorsByType = {};

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
            const errorType = e instanceof SyntaxError ? 'JSON_PARSE' : 'PROCESSING';
            console.error(`[ERROR] Line ${lineNumber} (${errorType}): ${e.message}`);
            errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
            totalSkipped++;
        }
    }

    // Print error breakdown if any errors occurred
    if (Object.keys(errorsByType).length > 0) {
        console.log('\n⚠️  Error breakdown:');
        for (const [type, count] of Object.entries(errorsByType)) {
            console.log(`   ${type}: ${count}`);
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
