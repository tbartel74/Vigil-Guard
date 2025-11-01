#!/usr/bin/env python3
"""
Vigil Guard - Language Detection Microservice
Fast language detection using langdetect (Google's language-detection library port)

Supports 55+ languages with high accuracy
Handles Polish text without diacritics (e.g. "jeszcze" vs "jeszcze")
"""

from flask import Flask, request, jsonify
from langdetect import detect, detect_langs, LangDetectException
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Maximum text length to prevent memory exhaustion attacks
MAX_TEXT_LENGTH = 10000  # 10KB limit

# Supported languages (can expand)
SUPPORTED_LANGUAGES = {
    'pl': 'Polish',
    'en': 'English',
    'de': 'German',
    'fr': 'French',
    'es': 'Spanish',
    'it': 'Italian',
    'cs': 'Czech',
    'sk': 'Slovak',
    'uk': 'Ukrainian',
    'ru': 'Russian'
}


def detect_language_hybrid(text, detailed=False):
    """
    Hybrid language detection: entity-based hints + statistical fallback

    Priority:
    1. Polish entity patterns (PESEL, NIP, keywords) → 'pl'
    2. Statistical analysis via langdetect → any language
    3. Fallback to 'en' on error

    Args:
        text: Text to analyze
        detailed: Return detailed signals and reasoning

    Returns:
        dict with language, confidence, method, and optional signals
    """
    import re

    # Polish-specific signals
    polish_keywords = [
        'pesel', 'nip', 'regon', 'karta', 'kredytowa', 'kredytowej',
        'dowód', 'dowod', 'osobisty', 'podatku', 'jest', 'jeszcze'
    ]

    text_lower = text.lower()
    polish_score = sum(1 for kw in polish_keywords if kw in text_lower)

    # PESEL pattern (11 digits) = strong signal
    if re.search(r'\b\d{11}\b', text):
        polish_score += 3

    # NIP/REGON (10 digits) = medium signal
    if re.search(r'\b\d{10}\b', text):
        polish_score += 2

    # Strong Polish signals → return Polish
    if polish_score >= 2:
        result = {
            'language': 'pl',
            'confidence': 1.0,
            'method': 'entity_based'
        }

        if detailed:
            result['signals'] = {
                'polish_score': polish_score,
                'keywords_found': [kw for kw in polish_keywords if kw in text_lower],
                'pesel_pattern': bool(re.search(r'\b\d{11}\b', text)),
                'nip_pattern': bool(re.search(r'\b\d{10}\b', text))
            }

        return result

    # Fallback to langdetect
    try:
        lang = detect(text)
        langs_prob = detect_langs(text)
        confidence = next((l.prob for l in langs_prob if l.lang == lang), 0)

        # Low confidence + weak Polish hints → override
        if confidence < 0.7 and polish_score > 0:
            result = {
                'language': 'pl',
                'confidence': 0.6,
                'method': 'hybrid_override'
            }

            if detailed:
                result['signals'] = {
                    'langdetect_suggested': lang,
                    'langdetect_confidence': round(confidence, 4),
                    'polish_score': polish_score,
                    'override_reason': 'Low langdetect confidence + Polish hints present'
                }

            return result

        result = {
            'language': lang,
            'confidence': confidence,
            'method': 'statistical'
        }

        if detailed:
            result['signals'] = {
                'all_languages': [
                    {'lang': lp.lang, 'prob': round(lp.prob, 4)}
                    for lp in langs_prob
                ]
            }

        return result

    except LangDetectException as e:
        # Fallback to entity scoring
        result = {
            'language': 'pl' if polish_score > 0 else 'en',
            'confidence': 0.5,
            'method': 'fallback',
            'error': str(e)
        }
        return result


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'language-detector',
        'version': '1.0.1'
    }), 200


@app.route('/detect', methods=['POST'])
def detect_language():
    """
    Detect language from text

    Request:
    {
        "text": "to jeszcze jeden test",
        "detailed": false  // Optional: return probabilities for all languages
    }

    Response:
    {
        "language": "pl",
        "language_name": "Polish",
        "confidence": 0.99,
        "processing_time_ms": 5
    }
    """
    start_time = time.time()

    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({
            'error': 'Missing required field: text'
        }), 400

    text = data['text'].strip()
    detailed = data.get('detailed', False)

    # Input validation: text length
    if len(text) < 3:
        return jsonify({
            'error': 'Text too short for reliable detection (minimum 3 characters)'
        }), 400

    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({
            'error': 'Text too long',
            'message': f'Maximum text length is {MAX_TEXT_LENGTH} characters',
            'received_length': len(text)
        }), 400

    try:
        # Use hybrid detection
        result = detect_language_hybrid(text, detailed)

        # Add metadata
        processing_time_ms = round((time.time() - start_time) * 1000, 2)
        result['processing_time_ms'] = processing_time_ms
        result['language_name'] = SUPPORTED_LANGUAGES.get(result['language'], result['language'].upper())

        text_preview = text[:50] + '...' if len(text) > 50 else text
        logger.info(
            f"Detected: {result['language']} via {result['method']} "
            f"({result['confidence']:.2%}) in {processing_time_ms}ms - "
            f"text_length: {len(text)} chars, preview: '{text_preview}'"
        )

        return jsonify(result), 200

    except LangDetectException as e:
        logger.error(f"Language detection failed: {e}", exc_info=True)
        return jsonify({
            'error': 'LANG_DETECTION_FAILED',
            'error_id': 'LANG_001',
            'message': f'Language detection library error: {str(e)}',
            'fallback_applied': True,
            'fallback_language': 'en',
            'warning': 'Results may be inaccurate - manual review recommended'
        }), 500  # Return error status to alert workflow

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@app.route('/batch', methods=['POST'])
def batch_detect():
    """
    Detect languages for multiple texts

    Request:
    {
        "texts": ["text1", "text2", "text3"]
    }

    Response:
    {
        "results": [
            {"text": "text1", "language": "pl", "confidence": 0.99},
            {"text": "text2", "language": "en", "confidence": 0.95}
        ]
    }
    """
    data = request.get_json()
    if not data or 'texts' not in data:
        return jsonify({
            'error': 'Missing required field: texts (array)'
        }), 400

    texts = data['texts']
    if not isinstance(texts, list):
        return jsonify({
            'error': 'texts must be an array'
        }), 400

    results = []
    for idx, text in enumerate(texts):
        try:
            # Validate input type
            if not isinstance(text, str):
                raise ValueError(f"Item {idx}: Expected string, got {type(text).__name__}")

            # Validate text length
            if len(text) > MAX_TEXT_LENGTH:
                raise ValueError(f"Item {idx}: Text exceeds maximum length of {MAX_TEXT_LENGTH} characters")

            lang = detect(text.strip())
            lang_probs = detect_langs(text.strip())
            confidence = next((lp.prob for lp in lang_probs if lp.lang == lang), 1.0)

            results.append({
                'text': text[:50] + '...' if len(text) > 50 else text,
                'language': lang,
                'language_name': SUPPORTED_LANGUAGES.get(lang, lang.upper()),
                'confidence': round(confidence, 4)
            })

        except LangDetectException as e:
            logger.warning(f"Batch item {idx} detection failed: {e}")
            results.append({
                'text': text[:50] + '...' if len(text) > 50 else text,
                'error': 'DETECTION_FAILED',
                'error_details': str(e),
                'fallback': 'en'
            })

        except ValueError as e:
            logger.error(f"Batch item {idx} validation error: {e}")
            results.append({
                'text': str(text)[:50] + '...' if len(str(text)) > 50 else str(text),
                'error': 'VALIDATION_ERROR',
                'error_details': str(e)
            })

        except Exception as e:
            logger.error(f"Batch item {idx} unexpected error: {e}", exc_info=True)
            results.append({
                'text': str(text)[:50] + '...' if len(str(text)) > 50 else str(text),
                'error': 'INTERNAL_ERROR',
                'error_details': str(e)
            })

    # Log batch summary
    failed_count = sum(1 for r in results if 'error' in r)
    if failed_count > 0:
        logger.warning(f"Batch detection: {failed_count}/{len(results)} items failed")

    return jsonify({'results': results, 'total': len(results), 'failed': failed_count}), 200


if __name__ == '__main__':
    logger.info("🚀 Starting Language Detection Service on port 5002")
    logger.info(f"   Supported languages: {len(SUPPORTED_LANGUAGES)}")
    app.run(host='0.0.0.0', port=5002, debug=False)
