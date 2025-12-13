/**
 * Configuration loader for Semantic Service
 * Supports environment variables with sensible defaults
 *
 * Model: multilingual-e5-small (replaces all-MiniLM-L6-v2)
 * Key difference: E5 requires query:/passage: prefixes
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
        table: process.env.CLICKHOUSE_TABLE || 'pattern_embeddings_v2',
        timeout: parseInt(process.env.CLICKHOUSE_TIMEOUT || '5000', 10),
        keepAlive: process.env.CLICKHOUSE_KEEPALIVE !== 'false',
        maxSockets: parseInt(process.env.CLICKHOUSE_MAX_SOCKETS || '10', 10)
    },

    // =============================================================================
    // Model: multilingual-e5-small
    // =============================================================================
    model: {
        // HuggingFace model ID (Xenova has ONNX for Transformers.js)
        id: process.env.MODEL_ID || 'Xenova/multilingual-e5-small',
        // Display name
        name: process.env.MODEL_NAME || 'multilingual-e5-small-int8',
        // Local path to ONNX quantized model
        path: process.env.MODEL_PATH || path.join(SERVICE_DIR, 'models', 'multilingual-e5-small-onnx-int8'),
        // Embedding dimensions (384 for E5-small)
        dimension: 384,
        // Max input sequence length
        maxLength: 512,
        // E5 REQUIRES prefixes for optimal performance
        prefix: {
            query: 'query: ',      // For user input (what we're checking)
            passage: 'passage: '   // For database patterns (malicious examples)
        },
        // Pinned revision SHA for security (REQ-SEC-001)
        revision: 'fce5169d6bd6e56c54b0ef02ae54b24ee5b44ed5'
    },

    // Search
    search: {
        topK: parseInt(process.env.SEARCH_TOP_K || '5', 10),
        minSimilarity: parseFloat(process.env.SEARCH_MIN_SIMILARITY || '0.0')
    },

    // Scoring thresholds (threat level mapping)
    // May need calibration for E5 model - different similarity distributions
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

    // A/B Testing / Feature Rollout (Phase 4)
    rollout: {
        // Enable Two-Phase Search v2.0 (vs legacy single-table)
        enableTwoPhase: process.env.SEMANTIC_ENABLE_TWO_PHASE !== 'false',
        // Percentage of traffic using Two-Phase (0-100)
        twoPhasePercent: parseInt(process.env.SEMANTIC_TWO_PHASE_PERCENT || '100', 10),
        // Enable A/B testing mode (logs both v1 and v2 results)
        abTestEnabled: process.env.SEMANTIC_AB_TEST_ENABLED === 'true',
        // Auto-rollback triggers
        autoRollback: {
            // Rollback if p95 latency exceeds this (ms)
            maxP95Latency: parseInt(process.env.ROLLBACK_MAX_P95_MS || '35', 10),
            // Rollback if error rate exceeds this (%)
            maxErrorRate: parseFloat(process.env.ROLLBACK_MAX_ERROR_RATE || '1.0'),
            // Window for measuring rollback triggers (ms)
            windowMs: parseInt(process.env.ROLLBACK_WINDOW_MS || '300000', 10)  // 5 min
        }
    },

    // Paths
    paths: {
        serviceDir: SERVICE_DIR,
        modelsDir: path.join(SERVICE_DIR, 'models'),
        dataDir: path.join(SERVICE_DIR, 'data')
    }
};

/**
 * Validate configuration at startup.
 */
function validateConfig() {
    const errors = [];

    // ClickHouse password required to avoid empty-auth startup
    if (!config.clickhouse.password) {
        console.error('FATAL: CLICKHOUSE_PASSWORD not set');
        process.exit(1);
    }

    if (config.model.dimension !== 384) {
        errors.push('Model dimension must be 384 for E5-small');
    }

    if (config.scoring.thresholds.low >= config.scoring.thresholds.medium) {
        errors.push('THRESHOLD_LOW must be less than THRESHOLD_MEDIUM');
    }

    if (config.rollout.twoPhasePercent < 0 || config.rollout.twoPhasePercent > 100) {
        errors.push('SEMANTIC_TWO_PHASE_PERCENT must be between 0 and 100');
    }

    if (errors.length > 0) {
        console.error('Configuration errors:');
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    }
}

validateConfig();

module.exports = config;
