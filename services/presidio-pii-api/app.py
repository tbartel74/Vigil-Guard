"""
Vigil Guard - Presidio PII Detection API
Flask wrapper with Optimized Per-Entity Thresholds
Version: 1.6.8 - False Positives Fix

Features:
- 3 detection modes: high_security / balanced / high_precision
- Per-entity thresholds based on Microsoft/NVIDIA best practices
- Context-aware scoring with LemmaContextAwareEnhancer
- Custom Polish recognizers (PESEL, NIP, REGON, ID card)
- Dynamic mode switching via /config endpoint
"""

from flask import Flask, request, jsonify
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_analyzer.context_aware_enhancers import LemmaContextAwareEnhancer
import time
import logging
import yaml
import os
from typing import List, Dict, Any, Optional

# Import custom validators
from validators.polish import checksum_nip, checksum_regon, checksum_pesel
from validators.credit_card import validate_credit_card

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Store loaded recognizers for health endpoint
loaded_recognizers = []

# Global analyzer instance (will be reinitialized on mode change)
analyzer_engine = None
current_mode = "balanced"  # Default mode

# ============================================================================
# DETECTION MODES - Based on Microsoft/NVIDIA Best Practices
# ============================================================================

DETECTION_MODES = {
    "high_security": {
        "name": "High Security",
        "description": "Banking, Healthcare, Legal - catch all PII, accept false positives",
        "thresholds": {
            # Structural data with checksum
            "CREDIT_CARD": 0.75,
            "IBAN_CODE": 0.80,
            "PL_PESEL": 0.85,
            "PL_NIP": 0.80,
            "PL_REGON": 0.75,
            "US_SSN": 0.75,
            "IP_ADDRESS": 0.85,

            # Contact data
            "EMAIL_ADDRESS": 0.60,
            "PHONE_NUMBER": 0.50,
            "PL_PHONE_NUMBER": 0.55,
            "URL": 0.65,

            # NER-based entities (low certainty, accepts without context)
            "PERSON": 0.35,  # Accepts base pattern score (0.45 > 0.35)
            "LOCATION": 0.40,
            "ORGANIZATION": 0.40,
            "DATE_TIME": 0.45,

            # Identifiers
            "US_DRIVER_LICENSE": 0.55,
            "US_PASSPORT": 0.70,
            "MEDICAL_LICENSE": 0.65,
            "PL_ID_CARD": 0.70,

            # Financial
            "CRYPTO": 0.80,
            "US_BANK_NUMBER": 0.65,

            "GLOBAL": 0.35
        },
        "context_boost": 0.35,
        "min_context_score": 0.4
    },

    "balanced": {
        "name": "Balanced",
        "description": "Most B2B applications - optimal precision/recall",
        "thresholds": {
            # Structural data with checksum
            "CREDIT_CARD": 0.85,
            "IBAN_CODE": 0.85,
            "PL_PESEL": 0.90,
            "PL_NIP": 0.85,
            "PL_REGON": 0.80,
            "US_SSN": 0.80,
            "IP_ADDRESS": 0.90,

            # Contact data
            "EMAIL_ADDRESS": 0.70,
            "PHONE_NUMBER": 0.65,
            "PL_PHONE_NUMBER": 0.65,
            "URL": 0.75,

            # NER-based entities
            "PERSON": 0.60,  # HIGH threshold to prevent FP (requires explicit context keywords)
            "LOCATION": 0.50,
            "ORGANIZATION": 0.50,
            "DATE_TIME": 0.55,

            # Identifiers
            "US_DRIVER_LICENSE": 0.65,
            "US_PASSPORT": 0.80,
            "MEDICAL_LICENSE": 0.70,
            "PL_ID_CARD": 0.75,

            # Financial
            "CRYPTO": 0.85,
            "US_BANK_NUMBER": 0.70,

            "GLOBAL": 0.50  # NVIDIA Guardrails uses 0.6
        },
        "context_boost": 0.35,
        "min_context_score": 0.4
    },

    "high_precision": {
        "name": "High Precision",
        "description": "Chatbots, UX-critical - minimize false positives",
        "thresholds": {
            # Structural data with checksum
            "CREDIT_CARD": 0.95,
            "IBAN_CODE": 0.95,
            "PL_PESEL": 0.95,
            "PL_NIP": 0.90,
            "PL_REGON": 0.85,
            "US_SSN": 0.90,
            "IP_ADDRESS": 0.95,

            # Contact data
            "EMAIL_ADDRESS": 0.80,
            "PHONE_NUMBER": 0.75,
            "PL_PHONE_NUMBER": 0.75,
            "URL": 0.80,

            # NER-based entities
            "PERSON": 0.65,  # High threshold - only obvious cases
            "LOCATION": 0.70,
            "ORGANIZATION": 0.70,
            "DATE_TIME": 0.65,

            # Identifiers
            "US_DRIVER_LICENSE": 0.80,
            "US_PASSPORT": 0.90,
            "MEDICAL_LICENSE": 0.80,
            "PL_ID_CARD": 0.85,

            # Financial
            "CRYPTO": 0.90,
            "US_BANK_NUMBER": 0.80,

            "GLOBAL": 0.70
        },
        "context_boost": 0.30,  # Less boost for higher precision
        "min_context_score": 0.5
    }
}


def load_custom_recognizers(yaml_path: str) -> List[PatternRecognizer]:
    """Load custom recognizers from YAML configuration"""
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
            'validate_credit_card': validate_credit_card,
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

            # Create PatternRecognizer
            recognizer = PatternRecognizer(
                supported_entity=supported_entity,
                name=name,
                supported_language=supported_language,
                patterns=patterns,
                context=context if context else None,
                deny_list=None
            )

            # Store validator mapping for post-processing
            validator_names = rec_config.get('validators', [])
            if validator_names:
                validator_name = validator_names[0]
                validator_func = validator_map.get(validator_name)
                if validator_func:
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


def initialize_analyzer(mode: str = "balanced", languages: List[str] = ["pl", "en"]):
    """Initialize Presidio analyzer with specified mode"""
    global analyzer_engine, current_mode

    logger.info(f"Initializing Presidio in '{DETECTION_MODES[mode]['name']}' mode")
    logger.info(f"Description: {DETECTION_MODES[mode]['description']}")

    # Configure NLP engine
    nlp_configuration = {
        "nlp_engine_name": "spacy",
        "models": [
            {"lang_code": "en", "model_name": "en_core_web_sm"},
            {"lang_code": "pl", "model_name": "pl_core_news_sm"}
        ]
    }

    nlp_engine_provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
    nlp_engine = nlp_engine_provider.create_engine()

    # Create context enhancer with mode-specific parameters
    mode_config = DETECTION_MODES[mode]
    context_enhancer = LemmaContextAwareEnhancer(
        context_similarity_factor=mode_config["context_boost"],
        min_score_with_context_similarity=mode_config["min_context_score"],
        context_prefix_count=5,
        context_suffix_count=5
    )

    # Initialize analyzer
    analyzer_engine = AnalyzerEngine(
        nlp_engine=nlp_engine,
        context_aware_enhancer=context_enhancer
    )

    # Load custom recognizers
    recognizers_yaml_path = os.path.join(
        os.path.dirname(__file__),
        'config',
        'recognizers.yaml'
    )

    if os.path.exists(recognizers_yaml_path):
        custom_recognizers = load_custom_recognizers(recognizers_yaml_path)

        # Add custom recognizers to analyzer registry
        global loaded_recognizers
        loaded_recognizers = []
        for recognizer in custom_recognizers:
            analyzer_engine.registry.add_recognizer(recognizer)
            loaded_recognizers.append({
                'name': recognizer.name,
                'entity': recognizer.supported_entities[0] if recognizer.supported_entities else 'UNKNOWN',
                'language': recognizer.supported_language
            })

        logger.info(f"✅ Loaded {len(custom_recognizers)} custom recognizers")
    else:
        logger.warning(f"Recognizers YAML not found: {recognizers_yaml_path}")

    current_mode = mode
    logger.info(f"✅ Presidio Analyzer initialized in '{mode}' mode")


# Initialize on startup
try:
    initialize_analyzer(mode="balanced")
except Exception as e:
    logger.error(f"❌ Failed to initialize Presidio Analyzer: {e}")
    raise


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint with service info"""
    return jsonify({
        'status': 'healthy',
        'version': '1.6.8',
        'service': 'presidio-pii-api',
        'current_mode': current_mode,
        'mode_description': DETECTION_MODES[current_mode]['description'],
        'models_loaded': ['en_core_web_sm', 'pl_core_news_sm'],
        'custom_recognizers': loaded_recognizers,
        'recognizers_count': len(loaded_recognizers),
        'offline_capable': True
    }), 200


@app.route('/config', methods=['GET', 'POST'])
def config():
    """
    GET: Return current mode and thresholds
    POST: Change detection mode

    Request body (POST):
    {
        "mode": "balanced" | "high_security" | "high_precision"
    }
    """
    global current_mode

    if request.method == 'GET':
        return jsonify({
            'current_mode': current_mode,
            'available_modes': list(DETECTION_MODES.keys()),
            'mode_config': DETECTION_MODES[current_mode],
            'thresholds': DETECTION_MODES[current_mode]['thresholds']
        }), 200

    elif request.method == 'POST':
        data = request.get_json()

        if not data or 'mode' not in data:
            return jsonify({
                'error': 'Invalid request',
                'message': 'Mode field is required'
            }), 400

        new_mode = data['mode']

        if new_mode not in DETECTION_MODES:
            return jsonify({
                'error': 'Invalid mode',
                'message': f'Mode must be one of: {list(DETECTION_MODES.keys())}'
            }), 400

        # Reinitialize analyzer with new mode
        try:
            initialize_analyzer(mode=new_mode)

            return jsonify({
                'success': True,
                'previous_mode': current_mode,
                'new_mode': new_mode,
                'mode_config': DETECTION_MODES[new_mode]
            }), 200

        except Exception as e:
            logger.error(f"Failed to switch mode: {e}")
            return jsonify({
                'error': 'Failed to switch mode',
                'message': str(e)
            }), 500


@app.route('/analyze', methods=['POST'])
def analyze():
    """
    Analyze text for PII entities with per-entity thresholds

    Request body:
    {
        "text": "John Doe, email: john@example.com",
        "language": "pl",  # optional
        "entities": ["PERSON", "EMAIL"],  # optional
        "return_decision_process": false  # optional
    }
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

        if not text or not text.strip():
            return jsonify({
                'error': 'Invalid request',
                'message': 'Text field cannot be empty'
            }), 400

        if len(text) > 10000:
            return jsonify({
                'error': 'Text too long',
                'message': 'Maximum text length is 10,000 characters'
            }), 422

        # Extract parameters
        language = data.get('language', 'pl')
        entities = data.get('entities')
        return_decision_process = data.get('return_decision_process', False)

        if language not in ['pl', 'en']:
            logger.warning(f"Unsupported language '{language}', falling back to 'pl'")
            language = 'pl'

        # Get thresholds for current mode
        mode_config = DETECTION_MODES[current_mode]
        thresholds = mode_config['thresholds']
        global_threshold = thresholds.get('GLOBAL', 0.5)

        # Analyze with low initial threshold (will filter later)
        results = analyzer_engine.analyze(
            text=text,
            language=language,
            entities=entities,
            score_threshold=0.3,  # Low initial threshold
            return_decision_process=return_decision_process
        )

        # Post-process: Apply custom validators and per-entity thresholds
        validated_results = []
        for result in results:
            matched_text = text[result.start:result.end]
            should_keep = True

            # Check custom validator (checksum validation)
            for recognizer in analyzer_engine.registry.recognizers:
                if (hasattr(recognizer, 'supported_entities') and
                    result.entity_type in recognizer.supported_entities and
                    hasattr(recognizer, '_custom_validator')):
                    validator_func = recognizer._custom_validator
                    if not validator_func(matched_text):
                        should_keep = False
                        logger.debug(f"❌ Invalid checksum {result.entity_type}: {matched_text}")
                        break
                    else:
                        logger.debug(f"✅ Validated {result.entity_type}: {matched_text}")

            # Check per-entity threshold
            if should_keep:
                entity_threshold = thresholds.get(result.entity_type, global_threshold)

                if result.score >= entity_threshold:
                    validated_results.append(result)
                    logger.debug(
                        f"Accepted: {result.entity_type} "
                        f"(score: {result.score:.2f} >= {entity_threshold:.2f})"
                    )
                else:
                    logger.debug(
                        f"Rejected: {result.entity_type} "
                        f"(score: {result.score:.2f} < {entity_threshold:.2f})"
                    )

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

            if hasattr(result, 'recognition_metadata') and result.recognition_metadata:
                entity_dict['recognition_metadata'] = {
                    'recognizer_name': result.recognition_metadata.get('recognizer_name', 'unknown'),
                    'recognizer_identifier': str(result.recognition_metadata.get('recognizer_identifier', ''))
                }

            if return_decision_process and hasattr(result, 'analysis_explanation'):
                entity_dict['analysis_explanation'] = result.analysis_explanation

            entities_found.append(entity_dict)

        processing_time_ms = int((time.time() - start_time) * 1000)

        response = {
            'entities': entities_found,
            'detection_method': 'presidio',
            'processing_time_ms': processing_time_ms,
            'language': language,
            'mode': current_mode,
            'mode_description': DETECTION_MODES[current_mode]['description']
        }

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
    app.run(host='0.0.0.0', port=5001, debug=False)
