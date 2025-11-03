"""
Vigil Guard - Presidio PII Detection API
Flask wrapper for Presidio Analyzer with custom Polish recognizers
Version: 1.6.0
"""

from flask import Flask, request, jsonify
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider
import time
import logging
import yaml
import os
from typing import List, Dict, Any

# Import custom Polish validators
from validators.polish import checksum_nip, checksum_regon, checksum_pesel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Store loaded recognizers for health endpoint
loaded_recognizers = []


def load_custom_recognizers(yaml_path: str) -> List[PatternRecognizer]:
    """
    Load custom recognizers from YAML configuration.

    Args:
        yaml_path: Path to recognizers.yaml file

    Returns:
        List of PatternRecognizer instances

    Raises:
        FileNotFoundError: If YAML file not found
        yaml.YAMLError: If YAML parsing fails
    """
    recognizers = []

    try:
        with open(yaml_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        if not config or 'recognizers' not in config:
            logger.warning("No recognizers found in YAML config")
            return recognizers

        validator_map = {
            'checksum_nip': checksum_nip,
            'checksum_regon': checksum_regon,
            'checksum_pesel': checksum_pesel,
        }

        for rec_config in config['recognizers']:
            name = rec_config['name']
            supported_language = rec_config.get('supported_language', 'en')
            supported_entity = rec_config.get('supported_entity', name)
            context = rec_config.get('context', [])

            # Build patterns list
            patterns = []
            for pattern_config in rec_config.get('patterns', []):
                pattern = Pattern(
                    name=pattern_config['name'],
                    regex=pattern_config['regex'],
                    score=pattern_config['score']
                )
                patterns.append(pattern)

            # Build validator function (if specified)
            # Note: PatternRecognizer in Presidio 2.2.355 doesn't support validation_fn parameter
            # Validators will be added post-analysis as a filter step
            validator_names = rec_config.get('validators', [])

            # Create PatternRecognizer (without validation_fn)
            recognizer = PatternRecognizer(
                supported_entity=supported_entity,
                name=name,
                supported_language=supported_language,
                patterns=patterns,
                context=context if context else None,
                deny_list=None
            )

            # Store validator mapping for post-processing (if needed)
            if validator_names:
                validator_name = validator_names[0]
                validator_func = validator_map.get(validator_name)
                if validator_func:
                    # Store for later use in analyze endpoint
                    recognizer._custom_validator = validator_func
                    logger.info(f"  ⚡ Validator '{validator_name}' attached to {name}")
                else:
                    logger.warning(f"Validator '{validator_name}' not found for recognizer '{name}'")

            recognizers.append(recognizer)
            logger.info(f"✅ Loaded custom recognizer: {name} ({supported_entity})")

        return recognizers

    except FileNotFoundError:
        logger.error(f"Recognizers YAML file not found: {yaml_path}")
        raise
    except yaml.YAMLError as e:
        logger.error(f"Failed to parse recognizers YAML: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error loading recognizers: {e}")
        raise


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

    # Load custom recognizers from YAML
    recognizers_yaml_path = os.path.join(
        os.path.dirname(__file__),
        'config',
        'recognizers.yaml'
    )

    if os.path.exists(recognizers_yaml_path):
        custom_recognizers = load_custom_recognizers(recognizers_yaml_path)

        # Add custom recognizers to analyzer registry
        for recognizer in custom_recognizers:
            analyzer.registry.add_recognizer(recognizer)
            loaded_recognizers.append({
                'name': recognizer.name,
                'entity': recognizer.supported_entities[0] if recognizer.supported_entities else 'UNKNOWN',
                'language': recognizer.supported_language
            })

        logger.info(f"✅ Loaded {len(custom_recognizers)} custom recognizers")
    else:
        logger.warning(f"Recognizers YAML not found: {recognizers_yaml_path}")

except Exception as e:
    logger.error(f"❌ Failed to initialize Presidio Analyzer: {e}")
    raise

@app.route('/health', methods=['GET'])
def health():
    """
    Health check endpoint with service info.

    Returns:
        JSON with service status, version, models, and custom recognizers
    """
    # Get uptime (simplified - could use process start time)
    import sys
    uptime_seconds = int(time.time())  # Placeholder

    return jsonify({
        'status': 'healthy',
        'version': '1.6.0',
        'service': 'presidio-pii-api',
        'models_loaded': ['en_core_web_sm', 'pl_core_news_sm'],
        'custom_recognizers': loaded_recognizers,
        'recognizers_count': len(loaded_recognizers),
        'offline_capable': True
    }), 200

@app.route('/analyze', methods=['POST'])
def analyze():
    """
    Analyze text for PII entities.

    Request body:
    {
        "text": "John Doe, email: john@example.com",
        "language": "pl",  # optional, default: "pl"
        "entities": ["PERSON", "EMAIL", "PL_NIP"],  # optional, default: all
        "score_threshold": 0.7,  # optional, default: 0.7
        "return_decision_process": false  # optional, default: false
    }

    Returns:
        JSON with detected entities, processing time, and optional decision process
    """
    start_time = time.time()

    try:
        data = request.get_json()

        # Validate request
        if not data:
            return jsonify({
                'error': 'Invalid request',
                'message': 'Request body must be JSON'
            }), 400

        if 'text' not in data:
            return jsonify({
                'error': 'Invalid request',
                'message': 'Text field is required'
            }), 400

        text = data['text']

        # Validate text is not empty
        if not text or not text.strip():
            return jsonify({
                'error': 'Invalid request',
                'message': 'Text field cannot be empty'
            }), 400

        # Validate text length (max 10,000 chars)
        if len(text) > 10000:
            return jsonify({
                'error': 'Text too long',
                'message': 'Maximum text length is 10,000 characters'
            }), 422

        # Extract parameters with defaults
        language = data.get('language', 'pl')
        entities = data.get('entities')  # None means all entities
        score_threshold = data.get('score_threshold', 0.7)
        return_decision_process = data.get('return_decision_process', False)

        # Validate score_threshold
        if not (0.0 <= score_threshold <= 1.0):
            return jsonify({
                'error': 'Invalid parameter',
                'message': 'score_threshold must be between 0.0 and 1.0'
            }), 400

        # Validate language
        if language not in ['pl', 'en']:
            logger.warning(f"Unsupported language '{language}', falling back to 'pl'")
            language = 'pl'

        # Analyze text with Presidio
        results = analyzer.analyze(
            text=text,
            language=language,
            entities=entities,
            score_threshold=score_threshold,
            return_decision_process=return_decision_process
        )

        # Post-process: Apply custom validators to filter invalid entities
        validated_results = []
        for result in results:
            # Check if we have a custom validator for this entity type
            # Access recognizers from registry
            matched_text = text[result.start:result.end]
            should_keep = True

            # Find matching recognizer with validator
            for recognizer in analyzer.registry.recognizers:
                if (hasattr(recognizer, 'supported_entities') and
                    result.entity_type in recognizer.supported_entities and
                    hasattr(recognizer, '_custom_validator')):
                    validator_func = recognizer._custom_validator
                    # Validate checksum
                    if not validator_func(matched_text):
                        should_keep = False
                        logger.debug(f"❌ Invalid checksum {result.entity_type}: {matched_text}")
                        break
                    else:
                        logger.debug(f"✅ Validated {result.entity_type}: {matched_text}")

            if should_keep:
                validated_results.append(result)

        # Convert results to dict format
        entities_found = []
        for result in validated_results:
            entity_dict = {
                'type': result.entity_type,
                'start': result.start,
                'end': result.end,
                'score': round(result.score, 3),
                'text': text[result.start:result.end]
            }

            # Add recognition metadata if available
            if hasattr(result, 'recognition_metadata') and result.recognition_metadata:
                entity_dict['recognition_metadata'] = {
                    'recognizer_name': result.recognition_metadata.get('recognizer_name', 'unknown'),
                    'recognizer_identifier': str(result.recognition_metadata.get('recognizer_identifier', ''))
                }

            # Add decision process if requested
            if return_decision_process and hasattr(result, 'analysis_explanation'):
                entity_dict['analysis_explanation'] = result.analysis_explanation

            entities_found.append(entity_dict)

        processing_time_ms = int((time.time() - start_time) * 1000)

        response = {
            'entities': entities_found,
            'detection_method': 'presidio',
            'processing_time_ms': processing_time_ms,
            'language': language
        }

        # Add optional fields if specified in request
        if entities is not None:
            response['entities_requested'] = entities

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Error analyzing text: {e}", exc_info=True)
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    # Run Flask app
    app.run(host='0.0.0.0', port=5001, debug=False)
