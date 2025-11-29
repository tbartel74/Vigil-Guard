/**
 * Configuration loader for Semantic Service
 * Supports environment variables with sensible defaults
 */

const path = require('path');

const SERVICE_DIR = path.resolve(__dirname, '../..');

const config = {
    // Server
    server: {
        port: parseInt(process.env.PORT || '5006', 10),
        host: process.env.HOST || '0.0.0.0',
        env: process.env.NODE_ENV || 'development'
    },

    // ClickHouse
    clickhouse: {
        host: process.env.CLICKHOUSE_HOST || 'localhost',
        port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
        database: process.env.CLICKHOUSE_DATABASE || 'n8n_logs',
        user: process.env.CLICKHOUSE_USER || 'admin',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        table: process.env.CLICKHOUSE_TABLE || 'pattern_embeddings',
        timeout: parseInt(process.env.CLICKHOUSE_TIMEOUT || '5000', 10),
        keepAlive: process.env.CLICKHOUSE_KEEPALIVE !== 'false',
        maxSockets: parseInt(process.env.CLICKHOUSE_MAX_SOCKETS || '10', 10)
    },

    // Model
    model: {
        // Model ID for Transformers.js pipeline (can be HuggingFace ID or local path)
        id: process.env.MODEL_ID || 'Xenova/all-MiniLM-L6-v2',
        name: 'all-MiniLM-L6-v2-int8',
        path: process.env.MODEL_PATH || path.join(SERVICE_DIR, 'models', 'all-MiniLM-L6-v2-onnx-int8'),
        dimension: 384,
        maxLength: 512
    },

    // Search
    search: {
        topK: parseInt(process.env.SEARCH_TOP_K || '5', 10),
        minSimilarity: parseFloat(process.env.SEARCH_MIN_SIMILARITY || '0.0')
    },

    // Scoring thresholds (threat level mapping)
    scoring: {
        thresholds: {
            low: parseInt(process.env.THRESHOLD_LOW || '40', 10),
            medium: parseInt(process.env.THRESHOLD_MEDIUM || '70', 10)
        }
    },

    // Branch identification
    branch: {
        id: 'B',
        name: 'semantic'
    },

    // Rate limiting - increased for high-volume testing
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10)  // 1000 req/min for testing
    },

    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        pretty: process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV !== 'production'
    },

    // Health check
    health: {
        checkClickhouse: process.env.HEALTH_CHECK_CLICKHOUSE !== 'false',
        checkModel: process.env.HEALTH_CHECK_MODEL !== 'false'
    },

    // Paths
    paths: {
        serviceDir: SERVICE_DIR,
        modelsDir: path.join(SERVICE_DIR, 'models'),
        dataDir: path.join(SERVICE_DIR, 'data')
    }
};

/**
 * Validate configuration
 */
function validateConfig() {
    const errors = [];

    if (!config.clickhouse.password && process.env.NODE_ENV === 'production') {
        errors.push('CLICKHOUSE_PASSWORD is required in production');
    }

    if (config.model.dimension !== 384) {
        errors.push('Model dimension must be 384 for MiniLM');
    }

    if (config.scoring.thresholds.low >= config.scoring.thresholds.medium) {
        errors.push('THRESHOLD_LOW must be less than THRESHOLD_MEDIUM');
    }

    if (errors.length > 0) {
        console.error('Configuration errors:');
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    }
}

// Validate on load in production
if (process.env.NODE_ENV === 'production') {
    validateConfig();
}

module.exports = config;
