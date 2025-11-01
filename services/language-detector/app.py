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


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'language-detector',
        'version': '1.0.0'
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

    # Minimum text length for reliable detection
    if len(text) < 3:
        return jsonify({
            'error': 'Text too short for reliable detection (minimum 3 characters)'
        }), 400

    try:
        # Detect language
        lang = detect(text)

        # Get detailed probabilities if requested
        probabilities = []
        confidence = 1.0

        if detailed:
            lang_probs = detect_langs(text)
            probabilities = [
                {
                    'language': lp.lang,
                    'language_name': SUPPORTED_LANGUAGES.get(lp.lang, lp.lang.upper()),
                    'probability': round(lp.prob, 4)
                }
                for lp in lang_probs
            ]
            # Confidence is the probability of the detected language
            confidence = next((lp.prob for lp in lang_probs if lp.lang == lang), 1.0)

        processing_time_ms = round((time.time() - start_time) * 1000, 2)

        response = {
            'language': lang,
            'language_name': SUPPORTED_LANGUAGES.get(lang, lang.upper()),
            'confidence': round(confidence, 4),
            'processing_time_ms': processing_time_ms
        }

        if detailed:
            response['all_languages'] = probabilities

        logger.info(f"Detected: {lang} ({confidence:.2%}) in {processing_time_ms}ms - text: '{text[:50]}...'")

        return jsonify(response), 200

    except LangDetectException as e:
        logger.warning(f"Language detection failed: {e}")
        return jsonify({
            'error': 'Language detection failed',
            'message': str(e),
            'fallback': 'en'  # Default to English
        }), 200  # Still return 200 to allow workflow to continue

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
    for text in texts:
        try:
            lang = detect(text.strip())
            lang_probs = detect_langs(text.strip())
            confidence = next((lp.prob for lp in lang_probs if lp.lang == lang), 1.0)

            results.append({
                'text': text[:50] + '...' if len(text) > 50 else text,
                'language': lang,
                'language_name': SUPPORTED_LANGUAGES.get(lang, lang.upper()),
                'confidence': round(confidence, 4)
            })
        except Exception as e:
            results.append({
                'text': text[:50] + '...' if len(text) > 50 else text,
                'error': str(e),
                'fallback': 'en'
            })

    return jsonify({'results': results}), 200


if __name__ == '__main__':
    logger.info("🚀 Starting Language Detection Service on port 5002")
    logger.info(f"   Supported languages: {len(SUPPORTED_LANGUAGES)}")
    app.run(host='0.0.0.0', port=5002, debug=False)
