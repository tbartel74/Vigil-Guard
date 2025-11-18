import sys
import types

import pytest

# Provide lightweight stub for presidio_analyzer.PatternRecognizer so that
# importing validators.* works inside the minimal test environment.
if "presidio_analyzer" not in sys.modules:
    presidio_stub = types.ModuleType("presidio_analyzer")

    class _PatternRecognizerStub:
        def __init__(self, *args, **kwargs):
            self.name = kwargs.get("name", "PATTERN_RECOGNIZER")
            # Preserve compatibility with both supported_entity (str) and supported_entities (list)
            supported_entity = kwargs.get("supported_entity")
            supported_entities = kwargs.get("supported_entities")
            if supported_entities is None and supported_entity:
                supported_entities = [supported_entity]
            self.supported_entities = supported_entities or []
            self.supported_language = kwargs.get("supported_language", "en")

        def validate_result(self, pattern_text):
            return True

        def invalidate_result(self, pattern_text):
            return False

    presidio_stub.PatternRecognizer = _PatternRecognizerStub
    sys.modules["presidio_analyzer"] = presidio_stub

from validators.credit_card import (
    get_card_type,
    luhn_checksum,
    validate_credit_card,
)
from validators.format_validators import validate_date_format, validate_phone_format
from validators.international import (
    validate_au_medicare,
    validate_au_tfn,
    validate_ca_sin,
    validate_iban,
    validate_uk_nhs,
    validate_uk_nino,
    validate_us_passport,
    validate_us_ssn,
)
from validators.polish import ValidatedPatternRecognizer


@pytest.mark.parametrize(
    "value",
    [
        "1234 56785 8",  # format with spaces
        "4566 88812 2",
    ],
)
def test_validate_au_medicare_accepts_valid_checksums(value: str) -> None:
    assert validate_au_medicare(value)


@pytest.mark.parametrize(
    "value",
    [
        "1234 56785 9",  # bad checksum
        "4566888123",  # wrong checksum digit
        "123456789",  # too short
    ],
)
def test_validate_au_medicare_rejects_invalid_numbers(value: str) -> None:
    assert not validate_au_medicare(value)


@pytest.mark.parametrize(
    "value",
    [
        "212-09-9999",
        "123456789",
    ],
)
def test_validate_us_ssn_accepts_valid_numbers(value: str) -> None:
    assert validate_us_ssn(value)


@pytest.mark.parametrize(
    "value",
    [
        "000-12-3456",  # disallowed area
        "666-45-1234",  # disallowed area
        "900-12-3456",  # reserved area
        "123-00-6789",  # invalid group
        "123-45-0000",  # invalid serial
        "111-11-1111",  # dummy repeated digits
        "123-45-678",  # too short
    ],
)
def test_validate_us_ssn_rejects_invalid_numbers(value: str) -> None:
    assert not validate_us_ssn(value)


@pytest.mark.parametrize(
    "value",
    [
        "046 454 286",
        "123-456-782",  # Valid Luhn variant
    ],
)
def test_validate_ca_sin_accepts_valid_numbers(value: str) -> None:
    assert validate_ca_sin(value)


@pytest.mark.parametrize(
    "value",
    [
        "111 111 111",  # repeated
        "046 454 287",  # wrong checksum
        "12345678",  # too short
    ],
)
def test_validate_ca_sin_rejects_invalid_numbers(value: str) -> None:
    assert not validate_ca_sin(value)


@pytest.mark.parametrize(
    "value",
    [
        "+48 501 234 567",
        "(555) 867-5309",
        "555.320.9045",
    ],
)
def test_validate_phone_format_accepts_realistic_numbers(value: str) -> None:
    assert validate_phone_format(value)


@pytest.mark.parametrize(
    "value",
    [
        "111-111-1111",
        "123-456-7890",
        "12",
        "",
    ],
)
def test_validate_phone_format_rejects_patterns(value: str) -> None:
    assert not validate_phone_format(value)


@pytest.mark.parametrize(
    "value",
    [
        "2024-12-31",
        "2020-02-29",  # leap-day allowed
        "10/10/2024",  # non-ISO: no validation
    ],
)
def test_validate_date_format_accepts_valid_ranges(value: str) -> None:
    assert validate_date_format(value)


@pytest.mark.parametrize(
    "value",
    [
        "2023-13-01",
        "2023-00-01",
        "2023-04-31",  # April has 30 days
        "2023-02-30",
        "2023-02-00",
    ],
)
def test_validate_date_format_rejects_invalid_ranges(value: str) -> None:
    assert not validate_date_format(value)


def test_validate_au_tfn_accepts_valid_number() -> None:
    assert validate_au_tfn("123 456 782")


@pytest.mark.parametrize(
    "value",
    [
        "111 111 111",
        "12345678",  # too short
    ],
)
def test_validate_au_tfn_rejects_invalid_numbers(value: str) -> None:
    assert not validate_au_tfn(value)


def test_validate_uk_nhs_accepts_valid_number() -> None:
    assert validate_uk_nhs("943 476 5919")


@pytest.mark.parametrize(
    "value",
    [
        "943 476 5918",  # wrong checksum
        "123456789",  # too short
    ],
)
def test_validate_uk_nhs_rejects_invalid_numbers(value: str) -> None:
    assert not validate_uk_nhs(value)


@pytest.mark.parametrize(
    "value",
    [
        "AB123456C",
        "QQ123456C",
    ],
)
def test_validate_uk_nino_accepts_valid_numbers(value: str) -> None:
    assert validate_uk_nino(value)


@pytest.mark.parametrize(
    "value",
    [
        "BG123456A",  # blocked prefix
        "AB123456E",  # invalid suffix
        "A1123456C",  # wrong format
    ],
)
def test_validate_uk_nino_rejects_invalid_numbers(value: str) -> None:
    assert not validate_uk_nino(value)


def test_validate_iban_accepts_valid_number() -> None:
    assert validate_iban("GB82 WEST 1234 5698 7654 32")


@pytest.mark.parametrize(
    "value",
    [
        "GB00 WEST 1234 5698 7654 32",  # checksum mismatch
        "XX82 WEST 1234 5698 7654 32",  # invalid country
    ],
)
def test_validate_iban_rejects_invalid_numbers(value: str) -> None:
    assert not validate_iban(value)


def test_validate_us_passport_accepts_valid_numbers() -> None:
    for value in ["K1234567", "X7654321"]:
        assert validate_us_passport(value)


@pytest.mark.parametrize(
    "value",
    [
        "12345678",  # missing letter
        "AB123456",  # two letters
        "A123456",  # too short
    ],
)
def test_validate_us_passport_rejects_invalid_numbers(value: str) -> None:
    assert not validate_us_passport(value)


def test_luhn_checksum_valid_cards() -> None:
    valid_cards = [
        "4539148803436467",
        "5425233430109903",
        "378282246310005",
        "6011111111111117",
        "3530111333300000",
        "30569309025904",
    ]
    for card in valid_cards:
        assert luhn_checksum(card)


@pytest.mark.parametrize(
    "value",
    [
        "1234567890123456",
        "4111111111111121",
    ],
)
def test_luhn_checksum_rejects_invalid_cards(value: str) -> None:
    assert not luhn_checksum(value)


def test_validate_credit_card_matches_luhn() -> None:
    assert validate_credit_card("4111-1111-1111-1111")
    assert not validate_credit_card("4111-1111-1111-1112")


def test_get_card_type_detection() -> None:
    assert get_card_type("4111111111111111") == "VISA"
    assert get_card_type("5425233430109903") == "MASTERCARD"
    assert get_card_type("378282246310005") == "AMEX"
    assert get_card_type("6011111111111117") == "DISCOVER"
    assert get_card_type("3530111333300000") == "JCB"
    assert get_card_type("30569309025904") == "DINERS"
    assert get_card_type("123") == "UNKNOWN"


def test_validated_pattern_recognizer_cleans_phone_text() -> None:
    captured = []

    def capture_validator(value: str) -> bool:
        captured.append(value)
        return True
    capture_validator.__name__ = "phone_capture"

    recognizer = ValidatedPatternRecognizer(
        supported_entity="PHONE_NUMBER",
        name="PHONE_VALIDATOR_TEST",
        patterns=None,
        validator_func=capture_validator,
    )

    recognizer.validate_result("123-456-7890")
    assert captured[-1] == "1234567890"


def test_validated_pattern_recognizer_preserves_date_text() -> None:
    captured = []

    def capture_validator(value: str) -> bool:
        captured.append(value)
        return True
    capture_validator.__name__ = "date_capture"

    recognizer = ValidatedPatternRecognizer(
        supported_entity="DATE_TIME",
        name="DATE_VALIDATOR_TEST",
        patterns=None,
        validator_func=capture_validator,
    )

    recognizer.validate_result("2023-12-01")
    assert captured[-1] == "2023-12-01"


def test_validated_pattern_recognizer_enforces_phone_validator() -> None:
    recognizer = ValidatedPatternRecognizer(
        supported_entity="PHONE_NUMBER",
        name="PHONE_VALIDATOR_BEHAVIOR",
        patterns=None,
        validator_func=validate_phone_format,
    )

    assert recognizer.validate_result("+48 501 234 567")
    assert not recognizer.validate_result("123-456-7890")


def test_validated_pattern_recognizer_enforces_date_validator() -> None:
    recognizer = ValidatedPatternRecognizer(
        supported_entity="DATE_TIME",
        name="DATE_VALIDATOR_BEHAVIOR",
        patterns=None,
        validator_func=validate_date_format,
    )

    assert recognizer.validate_result("2023-12-01")
    assert not recognizer.validate_result("2023-13-01")
