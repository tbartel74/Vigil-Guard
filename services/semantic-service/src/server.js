/**
 * Semantic Service - Express API Server
 * Branch B: Semantic similarity detection using MiniLM embeddings
 *
 * Endpoints:
 *   POST /analyze - Main analysis endpoint (branch_result contract)
 *   GET /health - Health check
 *   GET /metrics - Service metrics
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pino = require('pino');

const config = require('./config');
const embeddingGenerator = require('./embedding/generator');
const clickhouseClient = require('./clickhouse/client');
const { searchSimilar, getStats, checkEmbeddingHealth } = require('./clickhouse/queries');
const { buildBranchResult, buildDegradedResult } = require('./scoring/scorer');

// ============================================================================
// Logger
// ============================================================================

const logger = pino({
    level: config.logging.level,
    transport: config.logging.pretty ? {
        target: 'pino-pretty',
        options: { colorize: true }
    } : undefined
});

// ============================================================================
// Express App
// ============================================================================

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/analyze', limiter);

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info({
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: duration
        });
    });
    next();
});

// ============================================================================
// Service State
// ============================================================================

let serviceReady = false;
let modelReady = false;
let clickhouseReady = false;
let startupError = null;

// ============================================================================
// Endpoints
// ============================================================================

/**
 * POST /analyze
 * Main analysis endpoint - returns branch_result
 */
app.post('/analyze', async (req, res) => {
    const startTime = Date.now();

    try {
        const { text, request_id, lang } = req.body;

        // Validate input
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                error: 'Invalid input: text is required and must be a string'
            });
        }

        if (text.length > 10000) {
            return res.status(400).json({
                error: 'Text too long: maximum 10000 characters'
            });
        }

        // Check service readiness
        if (!serviceReady) {
            const timingMs = Date.now() - startTime;
            return res.status(503).json(
                buildDegradedResult('Service not ready', timingMs)
            );
        }

        // Generate embedding
        let embedding;
        try {
            embedding = await embeddingGenerator.generate(text);
        } catch (e) {
            logger.error({ error: e.message }, 'Embedding generation failed');
            const timingMs = Date.now() - startTime;
            return res.json(
                buildDegradedResult(`Embedding failed: ${e.message}`, timingMs)
            );
        }

        // Search similar patterns
        let results;
        try {
            results = await searchSimilar(embedding, config.search.topK);
        } catch (e) {
            logger.error({ error: e.message }, 'ClickHouse search failed');
            const timingMs = Date.now() - startTime;
            return res.json(
                buildDegradedResult(`Search failed: ${e.message}`, timingMs)
            );
        }

        // Build response
        const timingMs = Date.now() - startTime;
        const response = buildBranchResult(results, timingMs, false);

        // Add request_id if provided
        if (request_id) {
            response.request_id = request_id;
        }

        logger.info({
            request_id,
            score: response.score,
            threat_level: response.threat_level,
            timing_ms: timingMs
        }, 'Analysis complete');

        res.json(response);

    } catch (e) {
        logger.error({ error: e.message, stack: e.stack }, 'Unexpected error');
        const timingMs = Date.now() - startTime;
        res.status(500).json(
            buildDegradedResult(`Internal error: ${e.message}`, timingMs)
        );
    }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
    const health = {
        status: serviceReady ? 'healthy' : 'unhealthy',
        service: 'semantic-service',
        branch: config.branch,
        checks: {
            model: modelReady,
            clickhouse: clickhouseReady
        },
        uptime_ms: process.uptime() * 1000
    };

    // Deep health check if requested
    if (req.query.deep === 'true') {
        try {
            // Check ClickHouse
            const chHealth = await clickhouseClient.healthCheck();
            health.checks.clickhouse_live = chHealth;

            // Check embedding health
            if (chHealth) {
                const embHealth = await checkEmbeddingHealth();
                health.checks.embeddings = embHealth;
            }

            // Check model
            health.checks.model_ready = embeddingGenerator.isReady();
        } catch (e) {
            health.checks.error = e.message;
        }
    }

    if (startupError) {
        health.startup_error = startupError;
    }

    const statusCode = serviceReady ? 200 : 503;
    res.status(statusCode).json(health);
});

/**
 * GET /metrics
 * Service metrics endpoint
 */
app.get('/metrics', async (req, res) => {
    try {
        const stats = await getStats();
        const embeddingHealth = await checkEmbeddingHealth();

        res.json({
            service: 'semantic-service',
            database: {
                total_patterns: stats.totalPatterns,
                top_categories: stats.topCategories,
                embedding_health: embeddingHealth
            },
            model: embeddingGenerator.getInfo(),
            config: {
                search_top_k: config.search.topK,
                thresholds: config.scoring.thresholds
            },
            runtime: {
                uptime_ms: process.uptime() * 1000,
                memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /
 * Root endpoint - service info
 */
app.get('/', (req, res) => {
    res.json({
        service: 'semantic-service',
        version: '1.0.0',
        branch: config.branch,
        description: 'Semantic similarity detection using MiniLM embeddings',
        endpoints: {
            'POST /analyze': 'Analyze text for semantic similarity (branch_result)',
            'GET /health': 'Health check',
            'GET /metrics': 'Service metrics'
        }
    });
});

// ============================================================================
// Startup
// ============================================================================

async function startup() {
    logger.info('Starting Semantic Service...');

    // Initialize embedding generator
    logger.info('Loading embedding model...');
    try {
        await embeddingGenerator.initialize();
        modelReady = true;
        logger.info('Embedding model loaded');
    } catch (e) {
        startupError = `Model initialization failed: ${e.message}`;
        logger.error({ error: e.message }, startupError);
        // Continue - service will run in degraded mode
    }

    // Check ClickHouse connection
    logger.info('Checking ClickHouse connection...');
    try {
        clickhouseReady = await clickhouseClient.healthCheck();
        if (clickhouseReady) {
            const tableInfo = await clickhouseClient.checkTable();
            logger.info({
                table_exists: tableInfo.exists,
                pattern_count: tableInfo.count
            }, 'ClickHouse connected');
        }
    } catch (e) {
        startupError = `ClickHouse connection failed: ${e.message}`;
        logger.error({ error: e.message }, startupError);
        // Continue - service will run in degraded mode
    }

    // Set service ready status
    serviceReady = modelReady && clickhouseReady;

    if (serviceReady) {
        logger.info('Service ready');
    } else {
        logger.warn({ model: modelReady, clickhouse: clickhouseReady }, 'Service starting in degraded mode');
    }

    // Start server
    const server = app.listen(config.server.port, config.server.host, () => {
        logger.info({
            host: config.server.host,
            port: config.server.port,
            env: config.server.env
        }, `Semantic Service listening on ${config.server.host}:${config.server.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down...');
        server.close(() => {
            logger.info('Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        logger.info('SIGINT received, shutting down...');
        server.close(() => {
            logger.info('Server closed');
            process.exit(0);
        });
    });
}

// Start server
startup().catch(e => {
    logger.fatal({ error: e.message }, 'Fatal startup error');
    process.exit(1);
});

module.exports = app;
