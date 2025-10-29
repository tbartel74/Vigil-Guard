"""
Vigil Guard - Presidio PII Detection API
Simple Flask wrapper for Presidio Analyzer
"""

from flask import Flask, request, jsonify
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Initialize Presidio Analyzer (offline mode - no network calls)
try:
    # Configure NLP engine to use pre-installed spaCy models (offline)
    nlp_configuration = {
        "nlp_engine_name": "spacy",
        "models": [
            {"lang_code": "en", "model_name": "en_core_web_sm"},
            {"lang_code": "pl", "model_name": "pl_core_news_sm"}
        ]
    }

    # Create NLP engine provider with offline models
    nlp_engine_provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
    nlp_engine = nlp_engine_provider.create_engine()

    # Initialize analyzer with pre-configured NLP engine
    analyzer = AnalyzerEngine(nlp_engine=nlp_engine)
    logger.info("✅ Presidio Analyzer initialized successfully (offline mode)")
except Exception as e:
    logger.error(f"❌ Failed to initialize Presidio Analyzer: {e}")
    raise

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'presidio-pii-api',
        'version': '1.6.0'
    }), 200

@app.route('/analyze', methods=['POST'])
def analyze():
    """
    Analyze text for PII entities

    Request body:
    {
        "text": "John Doe, email: john@example.com",
        "language": "en",
        "entities": ["PERSON", "EMAIL"],  # optional
        "score_threshold": 0.7  # optional
    }
    """
    start_time = time.time()

    try:
        data = request.get_json()

        if not data or 'text' not in data:
            return jsonify({'error': 'Missing required field: text'}), 400

        text = data['text']
        language = data.get('language', 'en')
        entities = data.get('entities')  # None means all entities
        score_threshold = data.get('score_threshold', 0.7)

        # Analyze text with Presidio
        results = analyzer.analyze(
            text=text,
            language=language,
            entities=entities,
            score_threshold=score_threshold
        )

        # Convert results to dict format
        entities_found = [
            {
                'type': result.entity_type,
                'start': result.start,
                'end': result.end,
                'score': result.score,
                'text': text[result.start:result.end]
            }
            for result in results
        ]

        processing_time_ms = int((time.time() - start_time) * 1000)

        return jsonify({
            'entities': entities_found,
            'detection_method': 'presidio',
            'processing_time_ms': processing_time_ms
        }), 200

    except Exception as e:
        logger.error(f"Error analyzing text: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Run Flask app
    app.run(host='0.0.0.0', port=5001, debug=False)
