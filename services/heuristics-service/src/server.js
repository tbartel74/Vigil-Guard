#!/usr/bin/env node

/**
 * Heuristics Service (Branch A) - v2.0.0
 *
 * Detection mechanisms:
 * - Obfuscation (zero-width, homoglyphs, base64/hex, mixed scripts)
 * - Structure (boundaries, code fences, newlines)
 * - Whisper/Narrative (phrases, dividers, role-play)
 * - Entropy (Shannon entropy, bigram anomalies)
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { config } from './config/index.js';
import { validateRequest } from './middleware/validation.js';
import { detectObfuscation } from './detectors/obfuscation.js';
import { detectStructure } from './detectors/structure.js';
import { detectWhisper } from './detectors/whisper.js';
import { detectEntropy } from './detectors/entropy.js';
import { detectSecurityKeywords, getPatternLoadingStatus as getSecurityPatternStatus } from './detectors/security.js';
import { calculateScore } from './scoring/scorer.js';
import { normalizeText, getNormalizeConfig } from './utils/normalizer.js';
import { getPatternLoadingStatus } from './utils/patterns.js';

// Load normalization config at startup
let normalizeConfig = null;
let normalizationReady = false;

/**
 * Get tiered timeout based on text length
 * @param {number} textLength - Length of input text
 * @returns {number} Timeout in milliseconds
 */
function getTieredTimeout(textLength) {
  const timeouts = config.timeouts;
  if (textLength < 500) return timeouts.short;
  if (textLength < 2000) return timeouts.medium;
  if (textLength < 5000) return timeouts.long;
  if (textLength < 50000) return timeouts.veryLong;
  return 1000; // > 50000 chars: extreme timeout
}

/**
 * Create a timeout promise that rejects after specified ms
 * @param {number} ms - Timeout in milliseconds
 * @param {string} operation - Name of the operation (for error message)
 * @returns {Promise} Promise that rejects with timeout error
 */
function createTimeout(ms, operation) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timeout after ${ms}ms`)), ms);
  });
}

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'UTC:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname'
    }
  }
});

// Initialize Express
const app = express();

// Middleware - CORS configuration with validation
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

// Rate limiting - consistent with semantic service
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/analyze', limiter);

// Health check
app.get('/health', (req, res) => {
  const patternStatus = getPatternLoadingStatus();
  const securityPatternStatus = getSecurityPatternStatus();

  // Determine overall status
  const isDegraded = patternStatus.degraded || !securityPatternStatus.loaded || !normalizationReady;
  const status = isDegraded ? 'degraded' : 'ok';

  res.json({
    status,
    service: 'heuristics-service',
    branch_id: 'A',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    components: {
      patterns: {
        ready: patternStatus.loaded,
        errors: patternStatus.errors.length > 0 ? patternStatus.errors : undefined
      },
      security_patterns: {
        ready: securityPatternStatus.loaded,
        error: securityPatternStatus.error || undefined
      },
      normalization: {
        ready: normalizationReady
      }
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    requests_total: metrics.requests,
    latency_p95: metrics.latencyP95,
    degraded_rate: metrics.degradedRate,
    uptime_seconds: process.uptime()
  });
});

// Main analysis endpoint
app.post('/analyze', validateRequest, async (req, res) => {
  const startTime = Date.now();
  const { text, request_id, lang } = req.body;

  // Calculate tiered timeout based on text length
  const timeout = getTieredTimeout(text.length);

  try {
    logger.info({ request_id, text_length: text.length, timeout_ms: timeout }, 'Starting heuristics analysis');

    // INTERNAL NORMALIZATION (v2.0 - Arbiter sends original text)
    // Normalization is now internal to Heuristics Service
    const { normalizedText, signals: normSignals } = normalizeText(text, normalizeConfig);

    logger.debug({
      request_id,
      original_length: text.length,
      normalized_length: normalizedText.length,
      transformations: normSignals.total_transformations
    }, 'Normalization completed');

    // Run detectors in parallel with tiered timeout (on NORMALIZED text)
    const detectorsPromise = Promise.all([
      detectObfuscation(normalizedText),
      detectStructure(normalizedText),
      detectWhisper(normalizedText),
      detectEntropy(normalizedText, { lang }),
      detectSecurityKeywords(normalizedText)
    ]);

    const [obfuscation, structure, whisper, entropy, security] = await Promise.race([
      detectorsPromise,
      createTimeout(timeout, 'Detector analysis')
    ]);

    // Calculate final score (pass normalization signals for scoring boost)
    const result = calculateScore({
      obfuscation,
      structure,
      whisper,
      entropy,
      security
    }, normSignals);

    // Add critical_signals flag for Arbiter (unified contract v2.1)
    // Arbiter does NOT inspect internal features - only uses this flag
    const obfuscationDetected =
      normSignals.total_transformations >= 3 ||
      normSignals.zero_width_count >= 5 ||
      normSignals.encoding_layers >= 1 ||
      normSignals.template_markers_removed >= 1;

    result.critical_signals = {
      obfuscation_detected: obfuscationDetected
    };

    // Keep features for debugging/logging (Arbiter ignores this)
    result.features.obfuscation = {
      ...result.features.obfuscation,
      // Internal details (NOT used by Arbiter)
      zero_width_count: normSignals.zero_width_count,
      homoglyph_count: normSignals.homoglyph_count,
      leet_conversions: normSignals.leet_conversions,
      emoji_conversions: normSignals.emoji_conversions,
      encoding_layers: normSignals.encoding_layers,
      template_markers_removed: normSignals.template_markers_removed,
      total_transformations: normSignals.total_transformations
    };

    // Add metadata
    result.branch_id = 'A';
    result.name = 'heuristics';
    result.timing_ms = Date.now() - startTime;
    result.degraded = false;

    // Check if we exceeded timeout
    if (result.timing_ms > config.performance.target_latency_ms) {
      logger.warn({ request_id, timing: result.timing_ms }, 'Exceeded target latency');
    }

    // Update metrics
    updateMetrics(result.timing_ms, false);

    logger.info({ request_id, score: result.score, threat_level: result.threat_level },
                'Analysis completed');

    res.json(result);

  } catch (error) {
    const timing = Date.now() - startTime;
    const errorId = Date.now().toString(36);
    logger.error({ request_id, errorId, error: error.message, stack: error.stack }, 'Analysis failed');

    // Return fail-secure response on error (BLOCK instead of ALLOW)
    const degradedResult = {
      branch_id: 'A',
      name: 'heuristics',
      score: 100,
      threat_level: 'HIGH',
      decision: 'BLOCK',
      confidence: 0.0,
      features: {
        obfuscation: { score: 0, error: true },
        structure: { score: 0, error: true },
        whisper: { score: 0, error: true },
        entropy: { score: 0, error: true },
        security: { score: 0, error: true }
      },
      explanations: ['Service error - fail-secure mode activated'],
      reason: 'Service error - fail-secure mode',
      timing_ms: timing,
      degraded: true,
      errorId
    };

    updateMetrics(timing, true);
    res.status(500).json(degradedResult);
  }
});

// Metrics tracking
const metrics = {
  requests: 0,
  latencyP95: 0,
  degradedRate: 0,
  latencies: []
};

function updateMetrics(latency, degraded) {
  metrics.requests++;
  metrics.latencies.push(latency);

  // Keep only last 100 latencies for P95 calculation
  if (metrics.latencies.length > 100) {
    metrics.latencies.shift();
  }

  // Calculate P95
  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  metrics.latencyP95 = sorted[p95Index] || 0;

  // Update degraded rate
  if (degraded) {
    metrics.degradedRate = ((metrics.degradedRate * (metrics.requests - 1)) + 1) / metrics.requests;
  } else {
    metrics.degradedRate = (metrics.degradedRate * (metrics.requests - 1)) / metrics.requests;
  }
}

// Error handling
app.use((err, req, res, next) => {
  const errorId = Date.now().toString(36);
  logger.error({ errorId, error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    errorId,
    branch_id: 'A',
    degraded: true
  });
});

// Start server
const PORT = process.env.PORT || 5005;
app.listen(PORT, '0.0.0.0', () => {
  // Load normalization config
  try {
    normalizeConfig = getNormalizeConfig();
    normalizationReady = true;
    logger.info('Normalization config loaded successfully');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to load normalization config');
    normalizationReady = false;
    normalizeConfig = {
      zeroWidth: new Set(),
      templateMarkers: new Set(),
      charMap: new Map(),
      leetCharMap: new Map(),
      leetSingleMap: new Map(),
      leetPhraseMap: new Map(),
      emojiMap: new Map(),
      polishDiacritics: new Map(),
      repetitionPatterns: []
    };
  }

  logger.info(`Heuristics Service (Branch A) v2.0.0 listening on port ${PORT}`);
  logger.info(`Target latency: ${config.performance.target_latency_ms}ms`);
  logger.info(`Weights: Obf=${config.detection.weights.obfuscation}, Struct=${config.detection.weights.structure}, Whisper=${config.detection.weights.whisper}, Entropy=${config.detection.weights.entropy}, Security=${config.detection.weights.security}`);
  logger.info('Internal normalization: ENABLED (v2.0 architecture)');
});