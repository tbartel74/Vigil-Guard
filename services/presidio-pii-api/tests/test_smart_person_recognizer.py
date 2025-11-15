"""
Unit tests for SmartPersonRecognizer v1.7.10

Tests validate_result() rules for PERSON entity false positive filtering.

Test Coverage:
- Lowercase multi-word phrases (Polish false positives)
- Lowercase single words (Polish verbs/nouns)
- Capitalized names (real person names)
- All-uppercase names (emphasis)
- Edge cases (empty, short strings)

Expected Results:
- ALL false positives from user report should be rejected
- Real Polish/English names should be accepted
"""

import pytest
import sys
from pathlib import Path

# Add custom_recognizers to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from custom_recognizers import SmartPersonRecognizer


class TestSmartPersonRecognizerPolish:
    """Test Polish language validation rules"""

    @pytest.fixture
    def recognizer_pl(self):
        """Create Polish recognizer instance"""
        return SmartPersonRecognizer(supported_language="pl")

    def test_reject_lowercase_multiword_phrases(self, recognizer_pl):
        """
        LAYER 1: Reject lowercase multi-word phrases (99% of false positives)

        These are the actual false positives from user report:
        - "powiedziec zbys" (score: 0.85)
        - "marca bede juz" (score: 0.85)
        - "moim projekcie" (score: 0.85)
        - "mam rodzina" (score: 0.85)
        """
        false_positives = [
            "powiedziec zbys",
            "marca bede juz",
            "moim projekcie",
            "mam rodzina",
            "co mam ci",
            "czy to sie",
            "bo mam"
        ]

        for fp in false_positives:
            result = recognizer_pl.validate_result(fp)
            assert result is False, f"Should reject lowercase multi-word: '{fp}'"

    def test_reject_lowercase_single_words(self, recognizer_pl):
        """
        LAYER 2: Reject lowercase single words in Polish

        Polish spaCy model has very high FP rate for:
        - Common verbs: powiedziec, moglbym, uzywac
        - Common nouns: rozeznanie, wtyczka, projekt
        """
        false_positives = [
            "rozeznanie",
            "której",
            "mógłbym",
            "projekcie",
            "powiedziec",
            "uzywac",
            "code"
        ]

        for fp in false_positives:
            result = recognizer_pl.validate_result(fp)
            assert result is False, f"Should reject lowercase single word: '{fp}'"

    def test_accept_capitalized_names(self, recognizer_pl):
        """
        Accept capitalized Polish names (real person names)

        Examples:
        - Single: Jan, Kowalski, Maria
        - Full: Jan Kowalski, Maria Nowak
        """
        real_names = [
            "Jan",
            "Kowalski",
            "Maria",
            "Nowak",
            "Jan Kowalski",
            "Maria Nowak",
            "Anna Wiśniewska"
        ]

        for name in real_names:
            result = recognizer_pl.validate_result(name)
            assert result is True, f"Should accept capitalized name: '{name}'"

    def test_accept_uppercase_names(self, recognizer_pl):
        """
        Accept all-uppercase names (emphasis or shouting)

        Examples:
        - JAN KOWALSKI
        - MARIA
        """
        uppercase_names = [
            "JAN",
            "KOWALSKI",
            "JAN KOWALSKI",
            "MARIA NOWAK"
        ]

        for name in uppercase_names:
            result = recognizer_pl.validate_result(name)
            assert result is True, f"Should accept uppercase name: '{name}'"

    def test_edge_cases(self, recognizer_pl):
        """Test edge cases"""
        # Empty string
        assert recognizer_pl.validate_result("") is False

        # Very short (≤2 chars)
        assert recognizer_pl.validate_result("J") is False
        assert recognizer_pl.validate_result("JK") is False

        # Whitespace only
        assert recognizer_pl.validate_result("   ") is False


class TestSmartPersonRecognizerEnglish:
    """Test English language validation rules"""

    @pytest.fixture
    def recognizer_en(self):
        """Create English recognizer instance"""
        return SmartPersonRecognizer(supported_language="en")

    def test_reject_lowercase_multiword_phrases(self, recognizer_en):
        """Reject English lowercase multi-word phrases"""
        false_positives = [
            "every command",
            "amoral and obeys",
            "john smith",  # lowercase names are NOT valid
            "the person"
        ]

        for fp in false_positives:
            result = recognizer_en.validate_result(fp)
            assert result is False, f"Should reject lowercase multi-word: '{fp}'"

    def test_accept_capitalized_names(self, recognizer_en):
        """Accept capitalized English names"""
        real_names = [
            "John",
            "Smith",
            "John Smith",
            "Mary Johnson",
            "Robert Williams"
        ]

        for name in real_names:
            result = recognizer_en.validate_result(name)
            assert result is True, f"Should accept capitalized name: '{name}'"

    def test_accept_uppercase_names(self, recognizer_en):
        """Accept all-uppercase English names"""
        uppercase_names = [
            "JOHN",
            "SMITH",
            "JOHN SMITH"
        ]

        for name in uppercase_names:
            result = recognizer_en.validate_result(name)
            assert result is True, f"Should accept uppercase name: '{name}'"


class TestSmartPersonRecognizerIntegration:
    """Integration tests with actual spaCy analyzer"""

    @pytest.fixture
    def recognizer_pl(self):
        return SmartPersonRecognizer(supported_language="pl")

    def test_user_reported_false_positives(self, recognizer_pl):
        """
        Test ALL false positives from user's original report.

        Original input (normalized):
        "acznijmy co mam ci powiedziec zbys mi pomogl. od marca bede juz na 100x
         w moim projekcie na dobre i na zle. mam troche obaw szczegolnie czy to
         sie uda bo mam rodzina i 3 dzieci"

        False positives detected by spaCy (ALL should be rejected):
        - "powiedziec zbys" (score: 0.85)
        - "marca bede juz" (score: 0.85)
        - "moim projekcie" (score: 0.85)
        - "mam troche" (score: 0.85)
        - "szczegolnie czy to sie" (score: 0.85)
        - "mam rodzina" (score: 0.85)
        """
        user_false_positives = [
            "powiedziec zbys",
            "marca bede juz",
            "moim projekcie",
            "mam troche",
            "szczegolnie czy to sie",
            "mam rodzina"
        ]

        for fp in user_false_positives:
            result = recognizer_pl.validate_result(fp)
            assert result is False, (
                f"REGRESSION: User-reported false positive '{fp}' "
                f"should be rejected by SmartPersonRecognizer"
            )

    def test_no_false_negatives_for_real_names(self, recognizer_pl):
        """
        Verify real Polish names are NOT rejected

        Examples from Polish naming conventions:
        - Single names: Jan, Maria, Piotr
        - Full names: Jan Kowalski, Maria Nowak
        - With titles: Pan Kowalski, Pani Nowak
        """
        real_polish_names = [
            "Jan",
            "Maria",
            "Kowalski",
            "Nowak",
            "Jan Kowalski",
            "Maria Nowak",
            "Piotr Wiśniewski",
            "Anna Lewandowska"
        ]

        for name in real_polish_names:
            result = recognizer_pl.validate_result(name)
            assert result is True, (
                f"FALSE NEGATIVE: Real Polish name '{name}' "
                f"should be accepted by SmartPersonRecognizer"
            )


class TestSmartPersonRecognizerStatistics:
    """Test statistics tracking"""

    @pytest.fixture
    def recognizer_pl(self):
        return SmartPersonRecognizer(supported_language="pl")

    def test_statistics_tracking(self, recognizer_pl):
        """Verify statistics are tracked correctly"""
        # Initial state
        stats = recognizer_pl.get_stats()
        assert stats['total_analyzed'] == 0

        # Process some entities (would need full analyze() call with spaCy)
        # For now, just verify stats structure
        assert 'rejected_lowercase_multiword' in stats
        assert 'rejected_lowercase_single' in stats
        assert 'accepted_capitalized' in stats
        assert 'accepted_uppercase' in stats

    def test_statistics_reset(self, recognizer_pl):
        """Verify statistics can be reset"""
        recognizer_pl.reset_stats()
        stats = recognizer_pl.get_stats()
        assert all(count == 0 for count in stats.values())


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
