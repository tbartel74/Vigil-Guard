/**
 * Semantic Service (Branch B) - E5 embedding similarity detection.
 * NOTE: Degraded responses return HTTP 200 with degraded:true (Arbiter contract).
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
const { searchSimilar, searchTwoPhase, getStats, checkEmbeddingHealth } = require('./clickhouse/queries');
const { buildBranchResult, buildTwoPhaseResult, buildDegradedResult } = require('./scoring/scorer');

// Logger
const logger = pino({
    level: config.logging.level,
    transport: config.logging.pretty ? {
        target: 'pino-pretty',
        options: { colorize: true }
    } : undefined
});

// Express App
const app = express();

// Middleware
app.use(helmet());
app.use(compression());

// CORS configuration with validation
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV !== 'production') {
    return /^http:\/\/localhost(:\d+)?$/;
  }
  const origins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean);
  if (!origins || origins.length === 0) {
    logger.warn('ALLOWED_ORIGINS not set in production! Using restrictive default.');
    return ['http://localhost'];
  }
  return origins;
};

app.use(cors({ origin: getAllowedOrigins() }));
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
app.use('/analyze-v2', limiter);

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

// Service State
let serviceReady = false;
let modelReady = false;
let clickhouseReady = false;
let startupError = null;

// Analysis Logging
function logAnalysis(entry) {
    // Fire-and-forget - don't await, don't block response
    clickhouseClient.insert('semantic_analysis_log', entry).catch(err => {
        logger.warn({ error: err.message }, 'Failed to log analysis to ClickHouse');
    });
}

// Endpoints

/**
 * POST /analyze-v2 - Two-Phase Semantic Analysis
 */
app.post('/analyze-v2', async (req, res) => {
    const startTime = Date.now();
    const embeddingStartTime = startTime;

    try {
        const { text, request_id, client_id } = req.body;

        // Validate input
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                error: 'Invalid input: text is required and must be a string'
            });
        }

        if (text.length > 100000) {
            return res.status(400).json({
                error: 'Text too long: maximum 100000 characters'
            });
        }

        // Check if Two-Phase is enabled
        if (!config.rollout?.enableTwoPhase) {
            return res.status(503).json({
                error: 'Two-Phase Search is not enabled',
                message: 'Use /analyze endpoint or set SEMANTIC_ENABLE_TWO_PHASE=true'
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
        let embeddingLatency;
        try {
            embedding = await embeddingGenerator.generate(text);
            embeddingLatency = Date.now() - embeddingStartTime;
        } catch (e) {
            const errorId = Date.now().toString(36);
            logger.error({ errorId, error: e.message, stack: e.stack }, 'Embedding generation failed');
            const timingMs = Date.now() - startTime;
            return res.json(
                buildDegradedResult('Embedding generation failed', timingMs)
            );
        }

        // Two-Phase Search
        const searchStartTime = Date.now();
        let twoPhaseResult;
        try {
            twoPhaseResult = await searchTwoPhase(embedding, config.search.topK);
        } catch (e) {
            const errorId = Date.now().toString(36);
            logger.error({ errorId, error: e.message, stack: e.stack }, 'Two-Phase search failed');
            const timingMs = Date.now() - startTime;
            return res.json(
                buildDegradedResult('Database search failed', timingMs)
            );
        }
        const searchLatency = Date.now() - searchStartTime;

        // Build response
        const timingMs = Date.now() - startTime;
        const response = buildTwoPhaseResult(twoPhaseResult, timingMs);

        // Add request_id if provided
        if (request_id) {
            response.request_id = request_id;
        }

        // Log analysis asynchronously (fire-and-forget)
        logAnalysis({
            request_id: request_id || null,
            client_id: client_id || '',
            input_text: text.substring(0, 500), // Truncate for storage
            input_length: text.length,
            classification: twoPhaseResult.classification,
            attack_max_similarity: twoPhaseResult.attack_max_similarity,
            safe_max_similarity: twoPhaseResult.safe_max_similarity,
            delta: twoPhaseResult.delta,
            adjusted_delta: twoPhaseResult.adjusted_delta || twoPhaseResult.delta,
            confidence_score: twoPhaseResult.confidence || 0,
            safe_is_instruction_type: twoPhaseResult.safe_is_instruction_type ? 1 : 0,
            classification_version: '2.3',
            latency_ms: timingMs,
            embedding_latency_ms: embeddingLatency,
            search_latency_ms: searchLatency,
            attack_matches: JSON.stringify(twoPhaseResult.attack_matches || []),
            safe_matches: JSON.stringify(twoPhaseResult.safe_matches || []),
            pipeline_version: '2.1.0',
            source: 'semantic-service'
        });

        logger.info({
            request_id,
            classification: twoPhaseResult.classification,
            score: response.score,
            threat_level: response.threat_level,
            delta: twoPhaseResult.delta?.toFixed(3),
            timing_ms: timingMs
        }, 'two-phase ok');

        res.json(response);

    } catch (e) {
        const errorId = Date.now().toString(36);
        logger.error({ errorId, error: e.message, stack: e.stack }, 'Unexpected error in analyze-v2');
        const timingMs = Date.now() - startTime;
        res.status(500).json(
            buildDegradedResult('Internal server error', timingMs)
        );
    }
});

/**
 * POST /analyze
 * Main analysis endpoint - returns branch_result
 * Uses Two-Phase Search (v2.0.0) by default for better accuracy
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

        if (text.length > 100000) {
            return res.status(400).json({
                error: 'Text too long: maximum 100000 characters'
            });
        }

        // Check service readiness
        if (!serviceReady) {
            const timingMs = Date.now() - startTime;
            return res.status(503).json(
                buildDegradedResult('Service not ready', timingMs)
            );
        }

        // Generate embedding using E5 model with query prefix
        let embedding;
        try {
            embedding = await embeddingGenerator.generate(text);
        } catch (e) {
            const errorId = Date.now().toString(36);
            logger.error({ errorId, error: e.message, stack: e.stack }, 'Embedding generation failed');
            const timingMs = Date.now() - startTime;
            return res.json(
                buildDegradedResult('Embedding generation failed', timingMs)
            );
        }

        // Determine search mode based on config
        const useTwoPhase = config.rollout.enableTwoPhase;
        let response;
        let searchMode = 'two-phase';

        if (useTwoPhase) {
            // Two-Phase Search: compare against attack AND safe patterns
            let twoPhaseResult;
            try {
                twoPhaseResult = await searchTwoPhase(embedding, config.search.topK);
            } catch (e) {
                const errorId = Date.now().toString(36);
                logger.error({
                    errorId,
                    error: e.message,
                    fallback_type: 'single-table'
                }, 'two-phase failed, fallback=single-table');

                // Fallback to single-table search (legacy mode) - raises FP risk
                try {
                    const singleTableResults = await searchSimilar(embedding, config.search.topK);
                    const timingMs = Date.now() - startTime;
                    response = buildBranchResult(singleTableResults, timingMs, false);
                    response.features.fallback_mode = true;
                    response.features.fallback_reason = 'Two-Phase search temporarily unavailable';
                    response.features.fallback_error_id = errorId;
                    searchMode = 'single-table-fallback';

                    logger.info({
                        request_id,
                        score: response.score,
                        threat_level: response.threat_level,
                        timing_ms: timingMs,
                        search_mode: searchMode
                    }, 'fallback ok');

                    if (request_id) {
                        response.request_id = request_id;
                    }
                    return res.json(response);
                } catch (fallbackError) {
                    logger.error({ errorId, error: fallbackError.message }, 'Single-table fallback also failed');
                    const timingMs = Date.now() - startTime;
                    return res.json(
                        buildDegradedResult('Database search failed (both Two-Phase and fallback)', timingMs)
                    );
                }
            }

            // Build Two-Phase response
            const timingMs = Date.now() - startTime;
            response = buildTwoPhaseResult(twoPhaseResult, timingMs);

            logger.info({
                request_id,
                score: response.score,
                threat_level: response.threat_level,
                classification: twoPhaseResult.classification,
                delta: twoPhaseResult.delta?.toFixed(3),
                timing_ms: timingMs,
                search_mode: searchMode
            }, 'two-phase ok');
        } else {
            // Single-table search (legacy mode or Two-Phase disabled)
            try {
                const results = await searchSimilar(embedding, config.search.topK);
                const timingMs = Date.now() - startTime;
                response = buildBranchResult(results, timingMs, false);
                searchMode = 'single-table';

                logger.info({
                    request_id,
                    score: response.score,
                    threat_level: response.threat_level,
                    timing_ms: timingMs,
                    search_mode: searchMode
                }, 'single-table ok');
            } catch (e) {
                const errorId = Date.now().toString(36);
                logger.error({ errorId, error: e.message, stack: e.stack }, 'Single-table search failed');
                const timingMs = Date.now() - startTime;
                return res.json(
                    buildDegradedResult('Database search failed', timingMs)
                );
            }
        }

        // Add request_id if provided
        if (request_id) {
            response.request_id = request_id;
        }

        res.json(response);

    } catch (e) {
        const errorId = Date.now().toString(36);
        logger.error({ errorId, error: e.message, stack: e.stack }, 'Unexpected error');
        const timingMs = Date.now() - startTime;
        res.status(500).json(
            buildDegradedResult('Internal server error', timingMs)
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
            // Check ClickHouse with detailed error info
            const chHealth = await clickhouseClient.healthCheck();
            health.checks.clickhouse_live = chHealth.healthy;
            health.checks.clickhouse_latency_ms = chHealth.latencyMs;
            if (!chHealth.healthy) {
                health.checks.clickhouse_error = chHealth.error;
                health.checks.clickhouse_error_type = chHealth.errorType;
            }

            // Check embedding health only if ClickHouse is healthy
            if (chHealth.healthy) {
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
        const errorId = Date.now().toString(36);
        logger.error({ errorId, error: e.message, stack: e.stack }, 'Metrics endpoint error');
        res.status(500).json({ error: 'Internal server error', errorId });
    }
});

/**
 * GET /
 * Root endpoint - service info
 */
app.get('/', (req, res) => {
    res.json({
        service: 'semantic-service',
        version: '2.0.0',
        branch: config.branch,
        description: 'Semantic similarity detection using E5 multilingual embeddings',
        endpoints: {
            'POST /analyze': 'Analyze text (legacy single-table or gradual Two-Phase rollout)',
            'POST /analyze-v2': 'Analyze text with Two-Phase Search (attack + safe patterns)',
            'GET /health': 'Health check',
            'GET /metrics': 'Service metrics'
        },
        rollout: {
            two_phase_enabled: config.rollout?.enableTwoPhase || false,
            two_phase_percent: config.rollout?.twoPhasePercent || 0
        }
    });
});

// Startup

/**
 * Wait for ClickHouse with retry and exponential backoff
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} initialDelayMs - Initial delay between retries
 * @returns {Promise<boolean>} - True if connected successfully
 */
async function waitForClickHouse(maxRetries = 10, initialDelayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const healthResult = await clickhouseClient.healthCheck();
            if (healthResult.healthy) {
                const tableInfo = await clickhouseClient.checkTable();
                logger.info({
                    attempt,
                    table_exists: tableInfo.exists,
                    pattern_count: tableInfo.count,
                    latency_ms: healthResult.latencyMs
                }, 'clickhouse ok');
                return true;
            } else {
                // healthCheck returned unhealthy but didn't throw
                const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), 30000);
                logger.warn({
                    attempt,
                    maxRetries,
                    error: healthResult.error,
                    errorType: healthResult.errorType,
                    nextRetryMs: delay
                }, 'ClickHouse not ready, retrying...');

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } catch (e) {
            const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), 30000);
            logger.warn({
                attempt,
                maxRetries,
                error: e.message,
                nextRetryMs: delay
            }, 'ClickHouse not ready, retrying...');

            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return false;
}

/**
 * Periodic health check to recover from transient failures
 * Updates clickhouseReady and serviceReady flags
 */
function startPeriodicHealthCheck(intervalMs = 30000) {
    setInterval(async () => {
        if (!clickhouseReady) {
            try {
                const healthResult = await clickhouseClient.healthCheck();
                if (healthResult.healthy) {
                    clickhouseReady = true;
                    serviceReady = modelReady && clickhouseReady;
                    logger.info({
                        latency_ms: healthResult.latencyMs
                    }, 'clickhouse recovered');
                } else {
                    logger.warn({
                        error: healthResult.error,
                        errorType: healthResult.errorType,
                        latency_ms: healthResult.latencyMs
                    }, 'ClickHouse still unhealthy');
                }
            } catch (error) {
                logger.error({ error: error.message }, 'Periodic health check failed');
            }
        }
    }, intervalMs);
}

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

    // Check ClickHouse connection with retry
    logger.info('Waiting for ClickHouse connection...');
    clickhouseReady = await waitForClickHouse(10, 2000);

    if (!clickhouseReady) {
        startupError = 'ClickHouse connection failed after retries';
        logger.error(startupError);
    }

    // Set service ready status
    serviceReady = modelReady && clickhouseReady;

    if (serviceReady) {
        logger.info('Service ready');
    } else {
        logger.warn({ model: modelReady, clickhouse: clickhouseReady }, 'Service starting in degraded mode');
        // Start periodic health check to recover from degraded mode
        startPeriodicHealthCheck(30000);
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
