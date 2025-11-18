import sys
import types

import pytest

# Provide lightweight stub for presidio_analyzer.PatternRecognizer so that
# importing validators.* works inside the minimal test environment.
if "presidio_analyzer" not in sys.modules:
    presidio_stub = types.ModuleType("presidio_analyzer")

    class _PatternRecognizerStub:
        def __init__(self, *args, **kwargs):
            pass

        def validate_result(self, pattern_text):
            return True

    presidio_stub.PatternRecognizer = _PatternRecognizerStub
    sys.modules["presidio_analyzer"] = presidio_stub

from validators.format_validators import (
    validate_date_format,
    validate_phone_format,
)
from validators.international import validate_au_medicare, validate_us_ssn


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
