/**
 * Request validation middleware
 */

import Joi from 'joi';
import { randomUUID } from 'crypto';

// Request schema
const analyzeSchema = Joi.object({
  text: Joi.string()
    .required()
    .min(1)
    .max(100000)
    .messages({
      'string.empty': 'Text cannot be empty',
      'string.max': 'Text exceeds maximum length of 100,000 characters'
    }),
  request_id: Joi.string()
    .trim()
    .max(128)
    .allow(null)
    .optional()
    .messages({
      'string.max': 'request_id exceeds maximum length of 128 characters'
    }),
  lang: Joi.string()
    .valid('pl', 'en', null)
    .allow(null)
    .optional()
    .messages({
      'any.only': 'Language must be pl, en, or null'
    })
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate request body
 */
export function validateRequest(req, res, next) {
  const { error, value } = analyzeSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map(d => d.message),
      branch_id: 'A',
      degraded: false
    });
  }

  const sanitized = { ...value };
  let generatedRequestId = false;

  if (!sanitized.request_id || !UUID_REGEX.test(sanitized.request_id)) {
    sanitized.request_id = randomUUID();
    generatedRequestId = true;
  }

  if (generatedRequestId) {
    console.warn('Heuristics validation: normalized missing/invalid request_id');
  }

  req.body = sanitized;
  next();
}
