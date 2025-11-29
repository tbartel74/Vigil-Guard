/**
 * Embedding Generator using Transformers.js
 * Generates 384-dimensional embeddings using MiniLM-L6-v2
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

    // Dynamic import for ES module
    const { pipeline: pipelineFn, env } = await import('@xenova/transformers');

    // Configure cache directory
    env.cacheDir = config.paths.modelsDir;
    env.allowLocalModels = true;

    // Use local model path for offline capability, fallback to HuggingFace ID
    // Priority: MODEL_PATH env var > config.model.path (local bundled) > config.model.id (network)
    let modelId = process.env.MODEL_PATH || config.model.path;

    // Check if local model exists, fallback to network if not
    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(modelId)) {
        console.warn(`Local model not found at ${modelId}, falling back to HuggingFace: ${config.model.id}`);
        modelId = config.model.id;
    }

    console.log(`Loading embedding model: ${modelId}...`);

    // Create feature extraction pipeline
    extractor = await pipelineFn('feature-extraction', modelId, {
        quantized: true // Use quantized model for better performance
    });

    ready = true;
    console.log('Embedding generator ready');
}

/**
 * Mean pooling over token embeddings
 */
function meanPooling(embeddings) {
    const numTokens = embeddings.dims[1];
    const embeddingDim = embeddings.dims[2];
    const result = new Float32Array(embeddingDim);

    for (let i = 0; i < numTokens; i++) {
        for (let j = 0; j < embeddingDim; j++) {
            result[j] += embeddings.data[i * embeddingDim + j];
        }
    }

    for (let j = 0; j < embeddingDim; j++) {
        result[j] /= numTokens;
    }

    return Array.from(result);
}

/**
 * Generate embedding for a single text
 */
async function generate(text) {
    if (!ready) {
        await initialize();
    }

    if (!text || typeof text !== 'string') {
        throw new Error('Invalid input: text must be a non-empty string');
    }

    // Generate embedding
    const output = await extractor(text, { pooling: 'mean', normalize: true });

    // Convert to array
    return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts (batch)
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
        ready: ready
    };
}

module.exports = {
    initialize,
    generate,
    generateBatch,
    isReady,
    getInfo
};
