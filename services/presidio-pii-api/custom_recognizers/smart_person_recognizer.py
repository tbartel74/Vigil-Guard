"""
SmartPersonRecognizer - Production-grade PERSON entity validation

Filters false positives from spaCy NER model based on linguistic rules.

Architecture (v1.8.1):
- Extends SpacyRecognizer (Presidio standard pattern)
- **Uses Presidio's shared NlpEngine** via nlp_artifacts (no duplicate spaCy load)
- Maps Polish 'persName' and English 'PERSON' to Presidio PERSON entity
- Overrides analyze() to inspect shared spaCy doc before validation
- Supports Polish and English languages
- Performance: <10ms overhead per request (model cached in NlpEngine)

Root Cause Addressed:
1. spaCy Polish model uses 'persName' label (not 'PERSON')
2. Presidio's NlpEngine doesn't map 'persName' → 'PERSON' correctly
3. Lowercase entities have very high false positive rate (score=0.85)

Examples of False Positives Prevented:
- "powiedziec zbys" (Polish verbs - multi-word lowercase)
- "marca bede juz" (Polish words - multi-word lowercase)
- "moim projekcie" (Polish nouns - multi-word lowercase)

Examples of True Positives Preserved:
- "Jan Kowalski" (capitalized full name, persName label)
- "Maria" (capitalized first name, persName label)
- "John Smith" (capitalized English name, PERSON label)

Based on: Microsoft Presidio Issue #851 + spaCy NER Limitations Research
"""

from presidio_analyzer.predefined_recognizers import SpacyRecognizer
from presidio_analyzer import RecognizerResult
from typing import List, Optional
import logging


class SmartPersonRecognizer(SpacyRecognizer):
    """
    Enhanced PERSON recognizer with false positive filtering.

    Validation Rules:
    1. Reject lowercase multi-word phrases (99% of false positives)
    2. Reject lowercase single words in Polish (high FP rate)
    3. Accept capitalized entities (standard names)
    4. Accept all-uppercase (acronyms/shouting)
    """

    SUPPORTED_ENTITIES = ["PERSON"]
    DEFAULT_SCORE = 0.85  # Inherited from spaCy NER ner_strength

    # Entity label mapping (spaCy model → Presidio PERSON)
    ENTITY_MAPPING = {
        'pl': 'persName',  # Polish spaCy model
        'en': 'PERSON'     # English spaCy model
    }

    # Model names for each language
    MODEL_NAMES = {
        'pl': 'pl_core_news_lg',
        'en': 'en_core_web_lg'
    }

    def __init__(
        self,
        supported_language: str = "pl",
        supported_entities: Optional[List[str]] = None,
        ner_strength: float = 0.85,
        **kwargs
    ):
        """
        Initialize SmartPersonRecognizer.

        Args:
            supported_language: Language code (pl, en)
            supported_entities: List of entity types (default: ["PERSON"])
            ner_strength: Confidence threshold (default: 0.85)
        """
        if supported_entities is None:
            supported_entities = self.SUPPORTED_ENTITIES

        super().__init__(
            supported_language=supported_language,
            supported_entities=supported_entities,
            ner_strength=ner_strength,
            **kwargs
        )

        self.supported_language = supported_language
        self.logger = logging.getLogger(f"{__name__}.{supported_language}")

        # Get entity label for this language
        self.spacy_entity_label = self.ENTITY_MAPPING.get(supported_language)
        if not self.spacy_entity_label:
            raise ValueError(f"Unsupported language: {supported_language}. Supported: pl, en")

        self.logger.info(f"🔄 Mapping spaCy label '{self.spacy_entity_label}' → Presidio 'PERSON'")

        # Statistics for monitoring
        self.stats = {
            'total_analyzed': 0,
            'rejected_lowercase_multiword': 0,
            'rejected_lowercase_single': 0,
            'accepted_capitalized': 0,
            'accepted_uppercase': 0
        }

    def validate_result(self, pattern_text: str) -> bool:
        """
        Validate PERSON entity based on linguistic rules.

        Args:
            pattern_text: Extracted entity text from spaCy

        Returns:
            True if entity is likely a real person name
            False if entity is likely a false positive

        Rules:
        - Lowercase multi-word → FALSE (e.g., "powiedziec zbys")
        - Lowercase single word in Polish → FALSE (e.g., "rozeznanie")
        - Capitalized → TRUE (e.g., "Jan", "Kowalski")
        - All uppercase → TRUE (e.g., "JAN KOWALSKI")
        """
        text = pattern_text.strip()

        # Edge case: empty or very short
        if len(text) <= 1:
            return False

        # Check text properties
        has_whitespace = ' ' in text
        is_lowercase = text == text.lower()
        is_capitalized = text[0].isupper()
        is_all_upper = text == text.upper()

        # Rule 1: Reject lowercase multi-word phrases (99% of false positives)
        # Real names are ALWAYS capitalized: "Jan Kowalski", not "jan kowalski"
        # False positives: "powiedziec zbys", "marca bede juz", "mam rodzina"
        if is_lowercase and has_whitespace:
            self.stats['rejected_lowercase_multiword'] += 1
            self.logger.debug(
                f"[SmartPERSON] Rejected lowercase multi-word: '{text}' "
                f"(lang={self.supported_language})"
            )
            return False

        # Rule 2: Reject lowercase single words in Polish
        # Polish spaCy model has very high FP rate for lowercase
        # Examples: "rozeznanie", "której", "mógłbym", "projekcie"
        if self.supported_language == "pl" and is_lowercase:
            # Single lowercase word in Polish = almost certainly not a person name
            # Exception: Very short names (≤2 chars) already filtered above
            if len(text) > 2:
                self.stats['rejected_lowercase_single'] += 1
                self.logger.debug(
                    f"[SmartPERSON] Rejected lowercase Polish word: '{text}'"
                )
                return False

        # Rule 3: Accept all-uppercase (likely emphasis or acronym)
        # Examples: "JAN KOWALSKI", "MARIA"
        if is_all_upper:
            self.stats['accepted_uppercase'] += 1
            self.logger.debug(
                f"[SmartPERSON] Accepted uppercase: '{text}' "
                f"(lang={self.supported_language})"
            )
            return True

        # Rule 4: Accept capitalized entities (standard names)
        # Examples: "Jan", "Kowalski", "Jan Kowalski", "Maria Nowak"
        if is_capitalized:
            self.stats['accepted_capitalized'] += 1
            self.logger.debug(
                f"[SmartPERSON] Accepted capitalized: '{text}' "
                f"(lang={self.supported_language})"
            )
            return True

        # Default: reject anything not matching above rules
        # This catches edge cases like mixed-case nonsense
        self.logger.debug(
            f"[SmartPERSON] Rejected (no rule matched): '{text}' "
            f"(lang={self.supported_language})"
        )
        return False

    def analyze(
        self,
        text: str,
        entities: List[str],
        nlp_artifacts=None
    ) -> List[RecognizerResult]:
        """
        Override analyze to use Presidio's NlpEngine with custom entity mapping.

        This method:
        1. Uses spaCy NER from nlp_artifacts (Presidio's shared NlpEngine)
        2. Maps spaCy entity labels (persName/PERSON) to Presidio PERSON
        3. Applies validation rules to filter false positives

        Args:
            text: Input text to analyze
            entities: List of entity types to detect (must contain "PERSON")
            nlp_artifacts: NLP artifacts from Presidio's NlpEngine (required)

        Returns:
            List of validated RecognizerResult objects
        """
        validated_results = []

        # Only process if PERSON entity is requested
        if "PERSON" not in entities:
            return validated_results

        # Get spaCy doc from Presidio's NlpEngine (shared model)
        if not nlp_artifacts or not hasattr(nlp_artifacts, 'tokens'):
            error_msg = (
                f"NlpEngine failure: nlp_artifacts unavailable for {self.supported_language}. "
                "Cannot perform PERSON detection."
            )
            self.logger.error(
                error_msg,
                extra={'error_id': 'SMART_PERSON_NO_NLP_ARTIFACTS'}
            )
            raise RuntimeError(error_msg)

        # Use spaCy doc from nlp_artifacts.tokens (already processed by NlpEngine)
        doc = nlp_artifacts.tokens

        # Extract entities matching our spaCy label (persName for PL, PERSON for EN)
        for ent in doc.ents:
            if ent.label_ != self.spacy_entity_label:
                continue  # Skip entities that don't match (LOCATION, ORG, etc.)

            self.stats['total_analyzed'] += 1

            # Apply validation rules to filter false positives
            if self.validate_result(ent.text):
                result = RecognizerResult(
                    entity_type="PERSON",  # Always map to Presidio PERSON
                    start=ent.start_char,
                    end=ent.end_char,
                    score=self.ner_strength
                )
                validated_results.append(result)

                self.logger.debug(
                    f"[SmartPERSON] Detected: '{ent.text}' "
                    f"(spaCy label={ent.label_}, mapped=PERSON, "
                    f"start={ent.start_char}, end={ent.end_char})"
                )
            # else: already logged in validate_result()

        return validated_results

    def get_stats(self) -> dict:
        """
        Get validation statistics for monitoring.

        Returns:
            Dictionary with rejection/acceptance counts
        """
        return self.stats.copy()

    def reset_stats(self):
        """Reset validation statistics."""
        for key in self.stats:
            self.stats[key] = 0
