/**
 * Configuration loader for Heuristics Service
 * Supports environment variable overrides for all settings
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load default configuration
const defaultConfigPath = path.join(__dirname, '../../config/default.json');
let defaultConfig = {};

try {
  defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
} catch (error) {
  console.warn('Failed to load default config, using built-in defaults:', error.message);
  defaultConfig = {
    detection: {
      weights: { obfuscation: 0.25, structure: 0.20, whisper: 0.25, entropy: 0.15, security: 0.15 },
      thresholds: { low_max: 30, medium_max: 65 },
      obfuscation: { zero_width_threshold: 3, homoglyph_threshold: 5, mixed_script_threshold: 2 },
      structure: { code_fence_threshold: 2, boundary_threshold: 3 },
      whisper: { pattern_threshold: 2, divider_threshold: 2 },
      entropy: { enabled: true, shannon_threshold_high: 4.5, shannon_threshold_low: 1.5, bigram_anomaly_threshold: 0.3 },
      security: { sql_injection_threshold: 1, xss_threshold: 1, command_injection_threshold: 1, privilege_escalation_threshold: 2 }
    },
    performance: { target_latency_ms: 50, circuit_breaker: { enabled: true, timeout_ms: 1000 } },
    scoring: { priority_boosts: {}, confidence: { base: 0.6, signal_bonus: 0.1, max: 0.95 } }
  };
}

/**
 * Parse environment variable as float
 */
function envFloat(name, defaultValue) {
  const val = process.env[name];
  return val !== undefined ? parseFloat(val) : defaultValue;
}

/**
 * Parse environment variable as int
 */
function envInt(name, defaultValue) {
  const val = process.env[name];
  return val !== undefined ? parseInt(val, 10) : defaultValue;
}

/**
 * Parse environment variable as boolean
 */
function envBool(name, defaultValue) {
  const val = process.env[name];
  if (val === undefined) return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

// Build configuration with environment overrides
export const config = {
  detection: {
    weights: {
      obfuscation: envFloat('WEIGHT_OBFUSCATION', defaultConfig.detection?.weights?.obfuscation ?? 0.25),
      structure: envFloat('WEIGHT_STRUCTURE', defaultConfig.detection?.weights?.structure ?? 0.20),
      whisper: envFloat('WEIGHT_WHISPER', defaultConfig.detection?.weights?.whisper ?? 0.25),
      entropy: envFloat('WEIGHT_ENTROPY', defaultConfig.detection?.weights?.entropy ?? 0.15),
      security: envFloat('WEIGHT_SECURITY', defaultConfig.detection?.weights?.security ?? 0.15)
    },
    thresholds: {
      low_max: envInt('THRESHOLD_LOW_MAX', defaultConfig.detection?.thresholds?.low_max ?? 39),
      medium_max: envInt('THRESHOLD_MEDIUM_MAX', defaultConfig.detection?.thresholds?.medium_max ?? 69)
    },
    obfuscation: {
      zero_width_threshold: envInt('OBFUSCATION_ZERO_WIDTH_THRESHOLD',
        defaultConfig.detection?.obfuscation?.zero_width_threshold ?? 3),
      homoglyph_threshold: envInt('OBFUSCATION_HOMOGLYPH_THRESHOLD',
        defaultConfig.detection?.obfuscation?.homoglyph_threshold ?? 5),
      mixed_script_threshold: envInt('OBFUSCATION_MIXED_SCRIPT_THRESHOLD',
        defaultConfig.detection?.obfuscation?.mixed_script_threshold ?? 2),
      base64_min_length: envInt('OBFUSCATION_BASE64_MIN_LENGTH',
        defaultConfig.detection?.obfuscation?.base64_min_length ?? 20),
      hex_min_length: envInt('OBFUSCATION_HEX_MIN_LENGTH',
        defaultConfig.detection?.obfuscation?.hex_min_length ?? 16),
      spacing_anomaly_ratio: envFloat('OBFUSCATION_SPACING_ANOMALY_RATIO',
        defaultConfig.detection?.obfuscation?.spacing_anomaly_ratio ?? 0.01)
    },
    structure: {
      code_fence_threshold: envInt('STRUCTURE_CODE_FENCE_THRESHOLD',
        defaultConfig.detection?.structure?.code_fence_threshold ?? 2),
      boundary_threshold: envInt('STRUCTURE_BOUNDARY_THRESHOLD',
        defaultConfig.detection?.structure?.boundary_threshold ?? 3),
      newline_ratio_threshold: envFloat('STRUCTURE_NEWLINE_RATIO_THRESHOLD',
        defaultConfig.detection?.structure?.newline_ratio_threshold ?? 0.3),
      segment_variance_threshold: envInt('STRUCTURE_SEGMENT_VARIANCE_THRESHOLD',
        defaultConfig.detection?.structure?.segment_variance_threshold ?? 100)
    },
    whisper: {
      pattern_threshold: envInt('WHISPER_PATTERN_THRESHOLD',
        defaultConfig.detection?.whisper?.pattern_threshold ?? 2),
      divider_threshold: envInt('WHISPER_DIVIDER_THRESHOLD',
        defaultConfig.detection?.whisper?.divider_threshold ?? 2),
      roleplay_threshold: envInt('WHISPER_ROLEPLAY_THRESHOLD',
        defaultConfig.detection?.whisper?.roleplay_threshold ?? 2),
      question_repetition_threshold: envInt('WHISPER_QUESTION_REPETITION_THRESHOLD',
        defaultConfig.detection?.whisper?.question_repetition_threshold ?? 2),
      divider_weight: envInt('WHISPER_DIVIDER_WEIGHT',
        defaultConfig.detection?.whisper?.divider_weight ?? 50),
      pattern_weight_multiplier: envFloat('WHISPER_PATTERN_WEIGHT_MULTIPLIER',
        defaultConfig.detection?.whisper?.pattern_weight_multiplier ?? 1.0)
    },
    entropy: {
      enabled: envBool('ENTROPY_ENABLED',
        defaultConfig.detection?.entropy?.enabled ?? true),
      shannon_threshold_high: envFloat('ENTROPY_HIGH_THRESHOLD',
        defaultConfig.detection?.entropy?.shannon_threshold_high ?? 4.5),
      shannon_threshold_low: envFloat('ENTROPY_LOW_THRESHOLD',
        defaultConfig.detection?.entropy?.shannon_threshold_low ?? 1.5),
      bigram_anomaly_threshold: envFloat('ENTROPY_BIGRAM_ANOMALY_THRESHOLD',
        defaultConfig.detection?.entropy?.bigram_anomaly_threshold ?? 0.3),
      bigram_language_detection: envBool('BIGRAM_LANGUAGE_DETECTION',
        defaultConfig.detection?.entropy?.bigram_language_detection ?? true),
      bigram_fallback_language: process.env.BIGRAM_FALLBACK_LANGUAGE ||
        defaultConfig.detection?.entropy?.bigram_fallback_language || 'en',
      bigram_sets: defaultConfig.detection?.entropy?.bigram_sets || {
        en: {
          bigrams: [
            'th', 'he', 'in', 'er', 'an', 're', 'ed', 'on', 'es', 'st',
            'en', 'at', 'to', 'nt', 'ha', 'nd', 'ou', 'ea', 'ng', 'as',
            'or', 'ti', 'is', 'et', 'it', 'ar', 'te', 'se', 'hi', 'of'
          ],
          weight: 1.0,
          min_frequency_threshold: 0.001
        }
      }
    },
    security: {
      sql_injection_threshold: envInt('SECURITY_SQL_INJECTION_THRESHOLD',
        defaultConfig.detection?.security?.sql_injection_threshold ?? 1),
      xss_threshold: envInt('SECURITY_XSS_THRESHOLD',
        defaultConfig.detection?.security?.xss_threshold ?? 1),
      command_injection_threshold: envInt('SECURITY_COMMAND_INJECTION_THRESHOLD',
        defaultConfig.detection?.security?.command_injection_threshold ?? 1),
      privilege_escalation_threshold: envInt('SECURITY_PRIVILEGE_ESCALATION_THRESHOLD',
        defaultConfig.detection?.security?.privilege_escalation_threshold ?? 2)
    }
  },
  performance: {
    target_latency_ms: envInt('TARGET_LATENCY_MS', defaultConfig.performance?.target_latency_ms ?? 50),
    circuit_breaker: {
      enabled: envBool('CIRCUIT_BREAKER_ENABLED', defaultConfig.performance?.circuit_breaker?.enabled ?? true),
      timeout_ms: envInt('CIRCUIT_BREAKER_TIMEOUT_MS',
        defaultConfig.performance?.circuit_breaker?.timeout_ms ?? 1000),
      reset_ms: envInt('CIRCUIT_BREAKER_RESET_MS',
        defaultConfig.performance?.circuit_breaker?.reset_ms ?? 30000)
    }
  },
  scoring: {
    priority_boosts: defaultConfig.scoring?.priority_boosts ?? {},
    confidence: {
      base: envFloat('CONFIDENCE_BASE', defaultConfig.scoring?.confidence?.base ?? 0.6),
      signal_bonus: envFloat('CONFIDENCE_SIGNAL_BONUS',
        defaultConfig.scoring?.confidence?.signal_bonus ?? 0.1),
      max: envFloat('CONFIDENCE_MAX', defaultConfig.scoring?.confidence?.max ?? 0.95)
    }
  },
  // Rate limiting - consistent with semantic service
  rateLimit: {
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60000),  // 1 minute window
    max: envInt('RATE_LIMIT_MAX', 1000)  // 1000 requests per window (high for testing)
  },
  // Tiered timeouts based on text length (in ms)
  timeouts: {
    short: envInt('TIMEOUT_SHORT', 50),      // < 500 chars
    medium: envInt('TIMEOUT_MEDIUM', 100),   // 500-2000 chars
    long: envInt('TIMEOUT_LONG', 200),       // 2000-5000 chars
    veryLong: envInt('TIMEOUT_VERY_LONG', 500)  // > 5000 chars
  }
};

// Normalize weights to ensure they sum to 1.0
const weightSum = config.detection.weights.obfuscation +
                  config.detection.weights.structure +
                  config.detection.weights.whisper +
                  config.detection.weights.entropy +
                  config.detection.weights.security;

if (Math.abs(weightSum - 1.0) > 0.001) {
  console.warn(`Weight sum is ${weightSum}, normalizing to 1.0`);
  config.detection.weights.obfuscation /= weightSum;
  config.detection.weights.structure /= weightSum;
  config.detection.weights.whisper /= weightSum;
  config.detection.weights.entropy /= weightSum;
  config.detection.weights.security /= weightSum;
}

export default config;
