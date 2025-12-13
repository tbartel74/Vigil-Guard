/**
 * Embedding Generator - multilingual-e5-small (384 dim), cached in models/.
 * E5 requires "query:" prefix for input, "passage:" for patterns.
 */

const config = require('../config');

let pipeline = null;
let extractor = null;
let ready = false;

/**
 * Initialize the embedding pipeline
 */
async function initialize() {
    if (ready) return;

    // Skip model loading for CI smoke tests (service runs in degraded mode)
    if (process.env.SKIP_MODEL_LOAD === 'true') {
        console.log('SKIP_MODEL_LOAD=true - skipping model initialization (degraded mode)');
        return;
    }

    // Dynamic import for ES module
    const { pipeline: pipelineFn, env } = await import('@xenova/transformers');

    // Configure cache directory
    env.cacheDir = config.paths.modelsDir;
    env.allowLocalModels = true;

    // Use HuggingFace model ID format - Transformers.js will check cacheDir first
    // Priority: MODEL_ID env var > config.model.id (Xenova/multilingual-e5-small)
    const modelId = process.env.MODEL_ID || config.model.id;

    // Check if model is cached locally in modelsDir
    const fs = require('fs');
    const path = require('path');
    const cachedModelPath = path.join(config.paths.modelsDir, ...modelId.split('/'));
    const isLocallyAvailable = fs.existsSync(cachedModelPath);

    console.log(`Loading embedding model: ${modelId}`);
    console.log(`  Cache dir: ${config.paths.modelsDir}`);
    console.log(`  Local cache: ${isLocallyAvailable ? 'FOUND' : 'not found'} at ${cachedModelPath}`);

    // Create feature extraction pipeline
    // Transformers.js will first check cacheDir for the model, then fetch if not found
    // In CI/test environments without model cache, skip network fetch to avoid crashes
    const skipNetworkFetch = !isLocallyAvailable && (process.env.NODE_ENV === 'test' || process.env.CI === 'true');
    if (skipNetworkFetch) {
        throw new Error('Model not cached and network fetch disabled in test/CI environment');
    }

    extractor = await pipelineFn('feature-extraction', modelId, {
        quantized: true,
        local_files_only: isLocallyAvailable,
        revision: config.model.revision
    });

    ready = true;
    console.log('Embedding generator ready');
    console.log(`E5 prefixes enabled - query: "${config.model.prefix.query}", passage: "${config.model.prefix.passage}"`);
}

/**
 * Apply E5 prefix to text
 *
 * @param {string} text - Raw input text
 * @param {string} type - 'query' for user input, 'passage' for patterns
 * @returns {string} - Text with appropriate prefix
 */
function applyPrefix(text, type = 'query') {
    const prefix = type === 'passage'
        ? config.model.prefix.passage
        : config.model.prefix.query;

    return prefix + text;
}

/**
 * Generate embedding for a single text (query mode - for user input)
 *
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - 384-dimensional embedding array
 */
async function generate(text) {
    if (!ready) {
        await initialize();
    }

    if (!text || typeof text !== 'string') {
        throw new Error('Invalid input: text must be a non-empty string');
    }

    // Apply query prefix for E5 model
    const prefixedText = applyPrefix(text, 'query');

    // Generate embedding
    const output = await extractor(prefixedText, { pooling: 'mean', normalize: true });

    // Convert to array
    return Array.from(output.data);
}

/**
 * Generate embedding for a pattern (passage mode - for database patterns)
 *
 * @param {string} text - Pattern text to embed
 * @returns {Promise<number[]>} - 384-dimensional embedding array
 */
async function generatePassage(text) {
    if (!ready) {
        await initialize();
    }

    if (!text || typeof text !== 'string') {
        throw new Error('Invalid input: text must be a non-empty string');
    }

    // Apply passage prefix for E5 model
    const prefixedText = applyPrefix(text, 'passage');

    // Generate embedding
    const output = await extractor(prefixedText, { pooling: 'mean', normalize: true });

    // Convert to array
    return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts (batch, query mode)
 *
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of 384-dimensional embeddings
 */
async function generateBatch(texts) {
    if (!Array.isArray(texts)) {
        throw new Error('Invalid input: texts must be an array');
    }

    const embeddings = [];
    for (const text of texts) {
        const embedding = await generate(text);
        embeddings.push(embedding);
    }
    return embeddings;
}

/**
 * Generate embeddings for multiple patterns (batch, passage mode)
 *
 * @param {string[]} texts - Array of pattern texts to embed
 * @returns {Promise<number[][]>} - Array of 384-dimensional embeddings
 */
async function generatePassageBatch(texts) {
    if (!Array.isArray(texts)) {
        throw new Error('Invalid input: texts must be an array');
    }

    const embeddings = [];
    for (const text of texts) {
        const embedding = await generatePassage(text);
        embeddings.push(embedding);
    }
    return embeddings;
}

/**
 * Check if model is ready
 */
function isReady() {
    return ready;
}

/**
 * Get model info
 */
function getInfo() {
    return {
        name: config.model.name,
        dimension: config.model.dimension,
        maxLength: config.model.maxLength,
        prefix: config.model.prefix,
        ready: ready
    };
}

module.exports = {
    initialize,
    generate,           // Query mode (user input)
    generatePassage,    // Passage mode (database patterns)
    generateBatch,      // Batch query mode
    generatePassageBatch, // Batch passage mode
    applyPrefix,        // Utility for prefix application
    isReady,
    getInfo
};
