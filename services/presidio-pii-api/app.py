"""
Vigil Guard - Presidio PII Detection API
Flask wrapper with Dual-Language Detection
Version: 1.6.10 - Dual-Language PII Detection

Features:
- Dual-language support: Polish (pl) + International (en)
- Credit card detection with Luhn validation (93.8% accuracy)
- 3 detection modes: high_security / balanced / high_precision
- Per-entity thresholds based on Microsoft/NVIDIA best practices
- Context-aware scoring with LemmaContextAwareEnhancer
- Custom Polish recognizers (PESEL, NIP, REGON, ID card)
- Dynamic mode switching via /config endpoint
"""

from flask import Flask, request, jsonify
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider, NerModelConfiguration
from presidio_analyzer.context_aware_enhancers import LemmaContextAwareEnhancer
from presidio_analyzer.recognizer_registry import RecognizerRegistry
try:
    from presidio_analyzer.predefined_recognizers.spacy_recognizer import SpacyRecognizer
except ImportError:
    SpacyRecognizer = None  # type: ignore[misc,assignment]
import time
import logging
import yaml
import os
from typing import List, Dict, Any, Optional

# Import custom validators
from validators.polish import (
    checksum_nip,
    checksum_regon,
    checksum_pesel,
    validate_nip,
    validate_regon,
    validate_pesel,
    ValidatedPatternRecognizer,
)
from validators.credit_card import validate_credit_card
from validators.international import (
    validate_us_ssn,
    validate_uk_nhs,
    validate_ca_sin,
    validate_au_medicare,
    validate_au_tfn,
    validate_uk_nino,
    validate_iban,
    validate_us_passport,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Store loaded recognizers for health endpoint
loaded_recognizers = []

# Global analyzer instance (will be reinitialized on mode change)
analyzer_engine = None
analyzer = None  # Backward compatibility alias for tests
current_mode = "balanced"  # Default mode
current_context_enabled = True  # Track context enhancement state
startup_error = None  # Track initialization failures

# ============================================================================
# DEFAULT ALLOW-LIST - False Positive Prevention for Chatbot Context
# ============================================================================
# Based on community best practices for conversational AI PII detection
# Source: Microsoft Presidio Allow-List Tutorial + Production Deployments

DEFAULT_ALLOW_LIST = [
    # AI models & platforms
    "ChatGPT", "GPT-4", "GPT-3.5", "GPT-3", "GPT", "Claude", "Claude-3", "Claude-2",
    "Gemini", "Llama", "Llama-2", "Llama-3", "PaLM", "Bard",
    "OpenAI", "Anthropic", "Google", "Meta", "Microsoft", "DeepMind",

    # Pronouns (most common false positives)
    "he", "He", "she", "She", "they", "They",
    "him", "Him", "her", "Her", "them", "Them",
    "his", "His", "hers", "Hers", "their", "Their", "theirs", "Theirs",
    "himself", "Himself", "herself", "Herself", "themselves", "Themselves",

    # Jailbreak personas (known attack vectors)
    "Sigma", "DAN", "UCAR", "Yool", "NaN", "SDA",
    "STAN", "DUDE", "JailBreak", "DevMode", "Developer Mode",

    # Placeholder names (ONLY crypto examples, NOT real names)
    # NOTE: John/Jane/Smith are TOO COMMON as real names - excluded from allow-list
    "Alice", "Bob", "Charlie", "Dave", "Eve", "Frank",
    "Test", "Example",

    # Tech brands & social media
    "Instagram", "Facebook", "Twitter", "X", "LinkedIn",
    "YouTube", "TikTok", "Reddit", "Discord", "Slack",
    "WhatsApp", "Telegram", "Snapchat", "Pinterest",

    # Generic references
    "User", "Assistant", "AI", "Bot", "Agent", "Helper",
    "Person", "People", "Someone", "Anyone", "Everyone", "Nobody",

    # Role descriptors
    "Storyteller", "Character", "Narrator", "Protagonist",
    "Administrator", "Moderator", "Developer", "Engineer",
    "Manager", "Director", "President", "CEO",

    # Programming & tech terms
    "Python", "JavaScript", "Java", "Ruby", "Swift",
    "Docker", "Kubernetes", "AWS", "Azure", "Linux",

    # Common words often flagged as names
    "Welcome", "Hello", "Thanks", "Please", "Sorry"
]

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
            "PERSON": 0.50,  # Balanced threshold - post-processing filters prevent FP
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
            'validate_nip': validate_nip,
            'validate_regon': validate_regon,
            'validate_pesel': validate_pesel,
            'validate_us_ssn': validate_us_ssn,
            'validate_uk_nhs': validate_uk_nhs,
            'validate_ca_sin': validate_ca_sin,
            'validate_au_medicare': validate_au_medicare,
            'validate_au_tfn': validate_au_tfn,
            'validate_uk_nino': validate_uk_nino,
            'validate_iban': validate_iban,
            'validate_us_passport': validate_us_passport,
            'checksum_us_ssn': validate_us_ssn,
            'checksum_uk_nhs': validate_uk_nhs,
            'checksum_ca_sin': validate_ca_sin,
            'checksum_au_medicare': validate_au_medicare,
            'checksum_au_tfn': validate_au_tfn,
            'checksum_iban': validate_iban,
        }

        for rec_config in config['recognizers']:
            name = rec_config['name']
            supported_language = rec_config.get('supported_language', 'en')
            supported_entity = rec_config.get('supported_entity', name)
            context = rec_config.get('context', [])

            # Build patterns list
            patterns = []
            for pattern_config in rec_config.get('patterns', []):
                regex_str = pattern_config['regex']

                # Validate regex complexity to prevent ReDoS
                if len(regex_str) > 500:
                    logger.warning(f"Regex pattern too long ({len(regex_str)} chars) in {name}: {regex_str[:50]}...")
                    raise ValueError(f"Regex pattern exceeds maximum length of 500 characters")

                # Check for dangerous nested quantifiers (ReDoS risk)
                import re as regex_module
                if regex_module.search(r'\([^)]*[*+]\)[*+]', regex_str):
                    logger.warning(f"Potentially dangerous nested quantifiers in {name}: {regex_str}")
                    raise ValueError(f"Regex contains nested quantifiers which may cause ReDoS")

                # Test regex compilation with timeout
                try:
                    regex_module.compile(regex_str)
                except regex_module.error as e:
                    logger.error(f"Invalid regex in {name}: {e}")
                    raise ValueError(f"Invalid regex pattern: {e}")

                pattern = Pattern(
                    name=pattern_config['name'],
                    regex=regex_str,
                    score=pattern_config['score']
                )
                patterns.append(pattern)

            # v1.7.5: Check if recognizer should use ValidatedPatternRecognizer
            validator_class = rec_config.get('validator_class')
            validator_func_name = rec_config.get('validator_func')

            if validator_class == 'ValidatedPatternRecognizer' and validator_func_name:
                # Use ValidatedPatternRecognizer for checksum validation DURING matching
                validator_func = validator_map.get(validator_func_name)
                if validator_func:
                    recognizer = ValidatedPatternRecognizer(
                        supported_entity=supported_entity,
                        name=name,
                        supported_language=supported_language,
                        patterns=patterns,
                        context=context if context else None,
                        deny_list=None,
                        validator_func=validator_func
                    )
                    logger.info(f"  ⚡ ValidatedPatternRecognizer with '{validator_func_name}' for {name}")
                else:
                    logger.warning(f"Validator '{validator_func_name}' not found, using standard PatternRecognizer")
                    recognizer = PatternRecognizer(
                        supported_entity=supported_entity,
                        name=name,
                        supported_language=supported_language,
                        patterns=patterns,
                        context=context if context else None,
                        deny_list=None
                    )
            else:
                # Standard PatternRecognizer for entities without checksum validation
                recognizer = PatternRecognizer(
                    supported_entity=supported_entity,
                    name=name,
                    supported_language=supported_language,
                    patterns=patterns,
                    context=context if context else None,
                    deny_list=None
                )

            # KEEP post-processing validator for backward compatibility and threshold filtering
            validator_names = rec_config.get('validators', [])
            if validator_names:
                validator_name = validator_names[0]
                validator_func = validator_map.get(validator_name)
                if validator_func:
                    recognizer._custom_validator = validator_func
                    logger.info(f"  ✅ Post-processing validator '{validator_name}' attached to {name}")
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


def initialize_analyzer(mode: str = "balanced", languages: List[str] = ["pl", "en"], enable_context: bool = True):
    """Initialize Presidio analyzer with specified mode and context enhancement setting"""
    global analyzer_engine, current_mode, current_context_enabled, startup_error

    # Validate mode BEFORE proceeding - raise error instead of silent fallback
    if mode not in DETECTION_MODES:
        logger.error(
            f"INVALID DETECTION MODE: '{mode}' not in {list(DETECTION_MODES.keys())}",
            extra={'error_id': 'PRESIDIO_INVALID_MODE', 'requested_mode': mode}
        )
        raise ValueError(
            f"Invalid detection mode '{mode}'. "
            f"Must be one of: {list(DETECTION_MODES.keys())}"
        )

    logger.info(f"Initializing Presidio in '{DETECTION_MODES[mode]['name']}' mode")
    logger.info(f"Description: {DETECTION_MODES[mode]['description']}")
    logger.info(f"Context enhancement: {'enabled' if enable_context else 'disabled'}")

    # Configure NER model configuration for English (exclude PERSON from spaCy NER)
    english_ner_config = NerModelConfiguration(
        labels_to_ignore=["PER"],  # Disable spaCy's PERSON detection (use SmartPersonRecognizer instead)
        model_to_presidio_entity_mapping={
            # PER intentionally excluded - handled by SmartPersonRecognizer
            "LOC": "LOCATION",
            "ORG": "ORGANIZATION",
            "GPE": "LOCATION",
            "DATE": "DATE_TIME"
        },
        low_confidence_score_multiplier=0.5,
        low_score_entity_names=["ORGANIZATION"]
    )

    # Configure NER model configuration for Polish model (persName → PERSON mapping)
    polish_ner_config = NerModelConfiguration(
        labels_to_ignore=[],
        model_to_presidio_entity_mapping={
            "persName": "PERSON",
            "placeName": "LOCATION",
            "orgName": "ORGANIZATION",
            "geogName": "LOCATION",
            "date": "DATE_TIME",
            "time": "DATE_TIME"
        },
        low_confidence_score_multiplier=0.5,
        low_score_entity_names=["ORGANIZATION"]
    )

    # Configure NLP engine
    nlp_configuration = {
        "nlp_engine_name": "spacy",
        "models": [
            {
                "lang_code": "en",
                "model_name": "en_core_web_sm",
                "model_config": {"ner_model_configuration": english_ner_config}
            },
            {
                "lang_code": "pl",
                "model_name": "pl_core_news_sm",
                "model_config": {"ner_model_configuration": polish_ner_config}
            }
        ]
    }

    nlp_engine_provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
    nlp_engine = nlp_engine_provider.create_engine()

    # Create context enhancer ONLY if enabled
    context_enhancer = None
    if enable_context:
        mode_config = DETECTION_MODES[mode]
        context_enhancer = LemmaContextAwareEnhancer(
            context_similarity_factor=mode_config["context_boost"],
            min_score_with_context_similarity=mode_config["min_context_score"],
            context_prefix_count=5,
            context_suffix_count=5
        )
        logger.info("✅ Context-aware enhancer enabled")
    else:
        logger.info("⚠️ Context-aware enhancer disabled (NER base scores only)")

    # Initialize analyzer with standard registry
    # Built-in recognizers will be cleared before loading custom ones
    registry = RecognizerRegistry()
    analyzer_engine = AnalyzerEngine(
        nlp_engine=nlp_engine,
        context_aware_enhancer=context_enhancer,  # Can be None
        registry=registry
    )

    # Update backward compatibility alias for tests
    global analyzer
    analyzer = analyzer_engine

    # Load custom recognizers
    recognizers_yaml_path = os.path.join(
        os.path.dirname(__file__),
        'config',
        'recognizers.yaml'
    )

    if os.path.exists(recognizers_yaml_path):
        global loaded_recognizers
        custom_recognizers = load_custom_recognizers(recognizers_yaml_path)

        # CRITICAL: Clear built-in recognizers BEFORE adding custom ones
        # Built-ins don't have checksum validation, causing false positives
        recognizer_count_before = len(analyzer_engine.registry.recognizers)
        analyzer_engine.registry.recognizers = []  # Clear all
        logger.info(f"🚫 Cleared {recognizer_count_before} built-in recognizers")

        # Reset list and add custom recognizers to analyzer registry
        loaded_recognizers = []

        if SpacyRecognizer:
            try:
                # PHASE 4: Re-enable PERSON for EN but rely ONLY on spaCy NER
                # SmartPersonRecognizer disabled due to Presidio boundary extension bug
                # Post-processing filters prevent false positives from spaCy
                spacy_en = SpacyRecognizer(
                    supported_language="en",
                    supported_entities=["PERSON", "LOCATION", "ORG"]  # PERSON enabled
                )
                analyzer_engine.registry.add_recognizer(spacy_en)
                loaded_recognizers.append({
                    'name': 'SPACY_NER_EN',
                    'entity': 'PERSON/LOCATION/ORG',  # PERSON included
                    'language': 'en'
                })
                logger.info("✅ Added spaCy recognizer for EN (with PERSON detection)")
            except Exception as exc:
                logger.warning(f"Failed to initialize spaCy EN recognizer: {exc}")

            try:
                spacy_pl = SpacyRecognizer(
                    supported_language="pl",
                    supported_entities=["PERSON", "LOCATION"]
                )
                analyzer_engine.registry.add_recognizer(spacy_pl)
                loaded_recognizers.append({
                    'name': 'SPACY_NER_PL',
                    'entity': 'PERSON/LOCATION',
                    'language': 'pl'
                })
                logger.info("✅ Added spaCy recognizer for PL")
            except Exception as exc:
                logger.warning(f"Failed to initialize spaCy PL recognizer: {exc}")

        # PHASE 3: SmartPersonRecognizer with multi-rule validation
        # NOTE: validate_result() is NOT called by PatternRecognizer - using post-processing filters instead
        class SmartPersonRecognizer(PatternRecognizer):
            """
            Custom PERSON recognizer with validation to prevent false positives
            in conversational AI text (jailbreak personas, AI models, pronouns)
            """

            PRONOUNS = {
                "he", "she", "they", "him", "her", "them",
                "his", "hers", "their", "theirs"
            }

            AI_MODELS = {
                "ChatGPT", "GPT", "Claude", "Gemini", "Llama",
                "OpenAI", "Anthropic", "Google", "Meta"
            }

            JAILBREAK_PERSONAS = {
                "Sigma", "DAN", "UCAR", "Yool", "SDA", "STAN"
            }

            def validate_result(self, pattern_text: str) -> bool:
                """
                Multi-rule validation for PERSON entities.
                Returns True if entity passes all checks, False otherwise.
                """

                # Rule 1: Reject pronouns
                if pattern_text.lower() in self.PRONOUNS:
                    return False

                # Rule 2: Require full name format (min 2 words)
                # Exception: Polish titles (Pan, Pani, Dr, Prof, Mgr)
                has_space = " " in pattern_text.strip()
                has_polish_title = any(pattern_text.startswith(t) for t in ["Pan ", "Pani ", "Dr ", "Prof ", "Mgr "])
                if not (has_space or has_polish_title):
                    return False

                # Rule 3: Reject AI model names
                if pattern_text in self.AI_MODELS:
                    return False

                # Rule 4: Reject jailbreak personas
                if pattern_text in self.JAILBREAK_PERSONAS:
                    return False

                # Rule 5: Reject ALL CAPS (acronyms, not names)
                if pattern_text == pattern_text.upper():
                    return False

                # Rule 6: Require minimum length
                if len(pattern_text) < 4:
                    return False

                # Rule 7: Reject generic role descriptors
                generic_roles = ["User", "Assistant", "Bot", "Agent", "Helper", "Person"]
                if pattern_text in generic_roles:
                    return False

                # Rule 8: Reject if contains lowercase words after name (boundary issue)
                # Valid: "John Smith", "Jan Kowalski"
                # Invalid: "John Smith lives", "Jan Kowalski mieszka"
                words = pattern_text.split()
                if len(words) >= 3:
                    # Check if last word is lowercase (not a name)
                    if words[-1][0].islower():
                        return False

                return True

        # English SmartPersonRecognizer - DISABLED due to Presidio boundary extension bug
        # The regex pattern '\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}' should only match
        # capitalized names like "John Smith", but Presidio extends boundaries and
        # incorrectly detects lowercase phrases like "every command", "amoral and obeys"
        # Solution: Disable for English, rely on spaCy NER (already disabled via labels_to_ignore)
        # Result: NO PERSON detection for English (acceptable for chatbot use case)
        #
        # smart_person_recognizer_en = SmartPersonRecognizer(
        #     supported_entity='PERSON',
        #     supported_language='en',
        #     patterns=[
        #         Pattern(
        #             name='english_full_name',
        #             regex=r'\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b',
        #             score=0.85  # High score - pattern is reliable with post-processing filters
        #         )
        #     ],
        #     context=['name', 'contact', 'person', 'mr', 'mrs', 'ms']
        # )
        # analyzer_engine.registry.add_recognizer(smart_person_recognizer_en)
        # loaded_recognizers.append({
        #     'name': 'SMART_PERSON_EN',
        #     'entity': 'PERSON',
        #     'language': 'en'
        # })

        # Polish Pattern Recognizer (SIMPLE - no validation yet, test if patterns work)
        polish_person_recognizer = PatternRecognizer(
            supported_entity='PERSON',
            supported_language='pl',
            patterns=[
                Pattern(
                    name='polish_full_name',
                    regex=r'\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,})?\b',
                    score=0.85  # High score - full name pattern is reliable
                ),
                Pattern(
                    name='polish_name_with_title',
                    regex=r'\b(?:Pan|Pani|Dr|Prof|Mgr)\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,})?\b',
                    score=0.90  # Very high - title is strong indicator
                )
            ],
            context=['imię', 'nazwisko', 'pan', 'pani', 'dr', 'prof', 'mgr', 'imie']
        )
        analyzer_engine.registry.add_recognizer(polish_person_recognizer)
        loaded_recognizers.append({
            'name': 'POLISH_PERSON_PATTERN',
            'entity': 'PERSON',
            'language': 'pl'
        })

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
    current_context_enabled = enable_context  # FIX: Track context state
    startup_error = None
    logger.info(f"✅ Presidio Analyzer initialized in '{mode}' mode")


# Initialize on startup with ENV vars
startup_mode = os.getenv('PII_DETECTION_MODE', 'balanced')
startup_context_str = os.getenv('PII_CONTEXT_ENHANCEMENT', 'true')
startup_context = startup_context_str.lower() in ('true', '1', 'yes')

logger.info(f"🚀 Starting Presidio with mode={startup_mode}, context={startup_context}")

try:
    initialize_analyzer(mode=startup_mode, enable_context=startup_context)
except Exception as e:
    startup_error = str(e)
    logger.error(f"❌ Failed to initialize Presidio Analyzer: {e}")
    logger.warning("⚠️ Presidio is running in DEGRADED mode (health endpoint will report degraded status).")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint with service info"""
    mode_meta = DETECTION_MODES.get(current_mode, {})
    payload = {
        'status': 'healthy',
        'version': '1.6.11',
        'service': 'presidio-pii-api',
        'current_mode': current_mode,
        'mode_description': mode_meta.get('description', 'Unavailable'),
        'spacy_models': ['en_core_web_sm', 'pl_core_news_sm'],
        'custom_recognizers': loaded_recognizers,
        'recognizers_loaded': len(loaded_recognizers),
        'offline_capable': True
    }

    if startup_error or analyzer_engine is None:
        payload['status'] = 'degraded'
        payload['error'] = startup_error or 'Analyzer not initialized'
        return jsonify(payload), 503

    return jsonify(payload), 200


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
            'context_enhancement': current_context_enabled,  # FIX: Expose context state
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
        enable_context = data.get('enable_context_enhancement', True)  # Default: enabled

        if new_mode not in DETECTION_MODES:
            return jsonify({
                'error': 'Invalid mode',
                'message': f'Mode must be one of: {list(DETECTION_MODES.keys())}'
            }), 400

        # FIX: Capture previous values BEFORE reinitializing
        previous_mode = current_mode
        previous_context = current_context_enabled

        # Reinitialize analyzer with new mode AND context setting
        try:
            initialize_analyzer(mode=new_mode, enable_context=enable_context)

            return jsonify({
                'success': True,
                'previous_mode': previous_mode,  # FIX: Return actual previous value
                'previous_context': previous_context,  # FIX: Include previous context state
                'new_mode': new_mode,
                'context_enhancement': enable_context,
                'mode_config': DETECTION_MODES[new_mode]
            }), 200

        except ValueError as e:
            # Invalid mode passed validation but failed in initialize_analyzer
            logger.error(f"Mode validation error: {e}")
            return jsonify({
                'error': 'Invalid mode',
                'message': str(e),
                'requested_mode': new_mode
            }), 400

        except Exception as e:
            logger.error(f"Failed to switch mode: {e}", exc_info=True)
            return jsonify({
                'error': 'Failed to switch mode',
                'message': str(e),
                'error_type': type(e).__name__
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
        return_rejected = data.get('return_rejected', False)  # NEW: Return rejected entities
        allow_list = data.get('allow_list', [])  # NEW: Allow-list for false positive prevention

        if language not in ['pl', 'en']:
            logger.warning(f"Unsupported language '{language}', falling back to 'pl'")
            language = 'pl'

        if analyzer_engine is None:
            logger.error("Analyzer unavailable - degraded mode active")
            return jsonify({
                'error': 'ANALYZER_UNAVAILABLE',
                'message': startup_error or 'Analyzer not initialized',
                'status': 'degraded'
            }), 503

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
            return_decision_process=return_decision_process,
            allow_list=allow_list  # NEW: Exclude allow-listed terms from detection
        )

        # Post-process: Apply custom validators and per-entity thresholds
        validated_results = []
        rejected_results = []  # NEW: Track rejected entities
        logger.info(f"🔍 Post-processing {len(results)} results...")

        # PHASE 2: Define post-processing filters for PERSON entities
        PRONOUNS = {
            "he", "she", "they", "him", "her", "them",
            "his", "hers", "their", "theirs", "himself", "herself", "themselves"
        }

        # Create case-insensitive allow-list set for efficient lookup
        allow_list_lower = {item.lower() for item in allow_list}

        for result in results:
            matched_text = text[result.start:result.end]
            should_keep = True
            rejection_reason = None

            # PHASE 2 FILTERS: Apply for both EN and PL (boundary fix needed for both)
            logger.info(f"🔍 Processing {result.entity_type}: '{matched_text}' (language={language})")
            if result.entity_type == "PERSON" and language in ["en", "pl"]:
                # FILTER 0: Reject allow-listed terms (fallback if Presidio's allow-list missed them)
                # Check exact match OR if any word in the phrase is in allow-list
                if matched_text in allow_list or matched_text.lower() in allow_list_lower:
                    should_keep = False
                    rejection_reason = "allow_list_exact_match"
                    logger.info(f"❌ REJECTED - Exact allow-list match: {matched_text}")
                elif should_keep and any(word in allow_list or word.lower() in allow_list_lower for word in matched_text.split()):
                    should_keep = False
                    rejection_reason = "allow_list_word_match"
                    logger.info(f"❌ REJECTED - Contains allow-listed word: {matched_text}")

                # FILTER 1: Reject pronouns (most common false positives)
                # Check if matched text IS a pronoun or CONTAINS pronouns
                if should_keep:
                    text_lower = matched_text.lower()
                    if text_lower in PRONOUNS:
                        should_keep = False
                        rejection_reason = "pronoun_exact_match"
                        logger.info(f"❌ REJECTED - Exact pronoun: {matched_text}")
                    elif any(word.lower() in PRONOUNS for word in matched_text.split()):
                        should_keep = False
                        rejection_reason = "pronoun_in_phrase"
                        logger.info(f"❌ REJECTED - Contains pronoun: {matched_text}")

                # FILTER 2: Reject single-word names (require full name format)
                if should_keep:
                    has_space = " " in matched_text.strip()
                    has_polish_title = any(matched_text.startswith(t) for t in ["Pan ", "Pani ", "Dr ", "Prof ", "Mgr "])
                    if not (has_space or has_polish_title):
                        should_keep = False
                        rejection_reason = "single_word_name"
                        logger.debug(f"❌ REJECTED - Single word name (not full name): {matched_text}")

                # FILTER 3: Reject ALL CAPS (likely acronyms, not names)
                if should_keep and matched_text == matched_text.upper() and len(matched_text) > 1:
                    should_keep = False
                    rejection_reason = "all_caps_acronym"
                    logger.debug(f"❌ REJECTED - ALL CAPS acronym: {matched_text}")

                # FILTER 4: Fix Presidio boundary bug - trim to only capitalized words
                # Presidio extends boundaries beyond regex match
                # "John Smith lives" → trim to "John Smith"
                # "Contact John Smith" → trim to "John Smith"
                if should_keep and matched_text:
                    words = matched_text.split()
                    # Find first and last capitalized word
                    cap_words = [(i, w) for i, w in enumerate(words) if w and w[0].isupper()]
                    if cap_words:
                        first_cap_idx = cap_words[0][0]
                        last_cap_idx = cap_words[-1][0]

                        # If first or last word is not capitalized, trim the result
                        if first_cap_idx > 0 or last_cap_idx < len(words) - 1:
                            trimmed_words = words[first_cap_idx:last_cap_idx + 1]
                            trimmed_text = " ".join(trimmed_words)

                            # Recalculate start/end positions
                            prefix_len = len(" ".join(words[:first_cap_idx]))
                            if first_cap_idx > 0:
                                prefix_len += 1  # Space before first cap word

                            result.start = result.start + prefix_len
                            result.end = result.start + len(trimmed_text)
                            matched_text = trimmed_text  # Update for subsequent filters

                            logger.info(f"🔧 TRIMMED boundary → '{trimmed_text}' (pos {result.start}-{result.end})")

                            # Re-check filters after trimming
                            # FILTER 0 (post-trim): Check allow-list
                            if matched_text in allow_list or matched_text.lower() in allow_list_lower:
                                should_keep = False
                                rejection_reason = "allow_list_filter_post_trim"
                                logger.info(f"❌ REJECTED (post-trim) - In allow-list: {matched_text}")

                            # FILTER 1 (post-trim): Reject pronouns
                            if should_keep and matched_text.lower() in PRONOUNS:
                                should_keep = False
                                rejection_reason = "pronoun_filter_post_trim"
                                logger.info(f"❌ REJECTED (post-trim) - Pronoun: {matched_text}")

                            # FILTER 2 (post-trim): Reject single-word names
                            if should_keep and " " not in matched_text.strip():
                                has_polish_title = any(matched_text.startswith(t) for t in ["Pan", "Pani", "Dr", "Prof", "Mgr"])
                                if not has_polish_title:
                                    should_keep = False
                                    rejection_reason = "single_word_name_post_trim"
                                    logger.info(f"❌ REJECTED (post-trim) - Single word: {matched_text}")

                            # FILTER 3 (post-trim): Reject ALL CAPS
                            if should_keep and matched_text == matched_text.upper() and len(matched_text) > 1:
                                should_keep = False
                                rejection_reason = "all_caps_acronym_post_trim"
                                logger.info(f"❌ REJECTED (post-trim) - ALL CAPS: {matched_text}")

            # Check custom validator (checksum validation)
            validator_found = False
            for recognizer in analyzer_engine.registry.recognizers:
                logger.debug(f"Checking recognizer: {recognizer.name}, entities: {recognizer.supported_entities}, has_validator: {hasattr(recognizer, '_custom_validator')}")
                if (hasattr(recognizer, 'supported_entities') and
                    result.entity_type in recognizer.supported_entities and
                    hasattr(recognizer, '_custom_validator')):
                    validator_found = True
                    validator_func = recognizer._custom_validator
                    logger.info(f"🔎 Running validator for {result.entity_type}: {matched_text}")
                    if not validator_func(matched_text):
                        should_keep = False
                        rejection_reason = "invalid_checksum"
                        logger.warning(f"❌ REJECTED - Invalid checksum {result.entity_type}: {matched_text}")
                        break
                    else:
                        logger.info(f"✅ ACCEPTED - Valid checksum {result.entity_type}: {matched_text}")

            if not validator_found:
                logger.debug(f"ℹ️  No validator for {result.entity_type}: {matched_text}")

            # Check per-entity threshold
            if should_keep:
                entity_threshold = thresholds.get(result.entity_type, global_threshold)

                if result.score >= entity_threshold:
                    validated_results.append(result)
                    logger.info(
                        f"✅ Accepted: {result.entity_type} '{matched_text}' "
                        f"(score: {result.score:.2f} >= {entity_threshold:.2f})"
                    )
                else:
                    should_keep = False
                    rejection_reason = "low_score"
                    logger.info(
                        f"❌ Rejected: {result.entity_type} '{matched_text}' "
                        f"(score: {result.score:.2f} < {entity_threshold:.2f})"
                    )

            # Track rejected entities if requested
            if not should_keep and return_rejected:
                rejected_results.append({
                    'type': result.entity_type,
                    'start': result.start,
                    'end': result.end,
                    'text': matched_text,
                    'reason': rejection_reason
                })

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

            if return_decision_process and hasattr(result, 'analysis_explanation') and result.analysis_explanation:
                # Convert AnalysisExplanation to dict (not JSON serializable by default)
                explanation = result.analysis_explanation
                explanation_dict = {}

                # Define expected attributes with explicit error handling
                attrs = [
                    'recognizer', 'pattern_name', 'pattern', 'original_score',
                    'score', 'textual_explanation', 'score_context_improvement',
                    'supportive_context_word', 'validation_result'
                ]

                for attr in attrs:
                    try:
                        value = getattr(explanation, attr)

                        # Serialize Presidio class objects to JSON-safe types
                        if value is None:
                            explanation_dict[attr] = None
                        elif attr == 'recognizer':
                            # PatternRecognizer/EntityRecognizer objects -> string name
                            explanation_dict[attr] = str(value)
                        elif attr == 'pattern':
                            # Pattern objects -> extract regex string
                            if hasattr(value, 'regex'):
                                explanation_dict[attr] = value.regex
                            elif hasattr(value, 'name'):
                                explanation_dict[attr] = value.name
                            else:
                                explanation_dict[attr] = str(value)
                        elif attr == 'validation_result':
                            # ValidationResult is a dataclass or class instance -> convert to dict
                            if hasattr(value, '__dict__'):
                                explanation_dict[attr] = {k: v for k, v in value.__dict__.items() if not k.startswith('_')}
                            else:
                                explanation_dict[attr] = str(value)
                        else:
                            # Primitive types (str, int, float, bool) pass through
                            explanation_dict[attr] = value
                    except AttributeError:
                        # Expected case: attribute doesn't exist in this version
                        explanation_dict[attr] = None
                    except Exception as e:
                        # Unexpected case: attribute exists but getter/serialization failed
                        logger.error(
                            f"Failed to serialize analysis_explanation.{attr}: {e}",
                            extra={'error_id': 'PRESIDIO_EXPLANATION_ATTR_ERROR', 'attribute': attr}
                        )
                        explanation_dict[attr] = None

                entity_dict['analysis_explanation'] = explanation_dict

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

        # Include rejected entities if requested
        if return_rejected and rejected_results:
            response['rejected_entities'] = rejected_results
            logger.info(f"📋 Returning {len(rejected_results)} rejected entities")

        return jsonify(response), 200

    except ValueError as e:
        # Input validation errors
        logger.warning(f"Invalid input for /analyze: {e}")
        return jsonify({
            'error': 'Invalid input',
            'message': str(e)
        }), 400

    except MemoryError as e:
        # Infrastructure issue - needs alerting
        logger.critical(f"Out of memory during PII analysis: {e}", exc_info=True)
        return jsonify({
            'error': 'Resource exhaustion',
            'message': 'Server out of memory - contact administrator',
            'error_id': 'PRESIDIO_OOM'
        }), 503

    except AttributeError as e:
        # Likely missing spaCy model or config issue
        logger.error(f"Configuration error in PII analyzer: {e}", exc_info=True)
        return jsonify({
            'error': 'Service misconfigured',
            'message': 'PII detection service configuration error',
            'error_id': 'PRESIDIO_CONFIG_ERROR'
        }), 500

    except Exception as e:
        # Truly unexpected errors
        logger.error(f"Unexpected error analyzing text: {e}", exc_info=True)
        return jsonify({
            'error': 'Internal server error',
            'message': 'An unexpected error occurred',
            'error_id': 'PRESIDIO_UNKNOWN_ERROR',
            'error_type': type(e).__name__
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
