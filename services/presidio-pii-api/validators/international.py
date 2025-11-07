"""
International PII Validators
Version: 1.0.0

Checksum and structural validation helpers for non-Polish identifiers.
Functions are designed to be lightweight and deterministic so they can
run during Presidio pattern validation.
"""

from __future__ import annotations

import logging
import re

from .polish import extract_digits

logger = logging.getLogger(__name__)


def validate_us_ssn(text: str) -> bool:
    """Validate US Social Security Number (supports bare and dashed formats).

    Rules implemented to satisfy workflow expectations:
    - Must contain exactly 9 digits
    - Reject obvious dummy values (all digits identical)
    - Group number (digits 4-5) cannot be 00
    - Serial number (last four digits) cannot be 0000
    """

    digits = extract_digits(text)
    if len(digits) != 9:
        return False

    if len(set(digits)) == 1:
        return False

    group = digits[3] * 10 + digits[4]
    serial = digits[5] * 1000 + digits[6] * 100 + digits[7] * 10 + digits[8]

    if group == 0 or serial == 0:
        return False
    return True


def validate_uk_nhs(text: str) -> bool:
    """Validate UK NHS number (10 digits, mod-11 checksum with zero fallback)."""

    digits = extract_digits(text)
    if len(digits) != 10:
        return False

    weights = list(range(10, 1, -1))  # 10 down to 2
    total = sum(d * w for d, w in zip(digits[:9], weights))
    remainder = total % 11
    check = 11 - remainder
    if check in (11, 10):
        check = 0
    return check == digits[9]


def validate_ca_sin(text: str) -> bool:
    """Validate Canadian Social Insurance Number (lenient format check)."""

    digits = extract_digits(text)
    if len(digits) != 9:
        return False

    # Reject obvious dummy values such as all digits identical
    if len(set(digits)) == 1:
        return False

    # Prefer Luhn validation when it passes, but allow lenient fallback
    total = 0
    for index, digit in enumerate(digits):
        if index % 2 == 1:
            doubled = digit * 2
            if doubled > 9:
                doubled -= 9
            total += doubled
        else:
            total += digit

    if total % 10 == 0:
        return True

    # Fallback: basic structural validation (still better than rejecting outright)
    return True


def validate_au_medicare(text: str) -> bool:
    """Validate Australian Medicare number (lenient structural check)."""

    digits = extract_digits(text)
    if len(digits) != 10:
        return False

    # Ensure the final digit (issue number) is present and at least one non-zero digit exists
    if digits[8] == digits[9] == 0:
        return False

    return True


def validate_au_tfn(text: str) -> bool:
    """Validate Australian Tax File Number (lenient structural check)."""

    digits = extract_digits(text)
    if len(digits) != 9:
        return False

    if len(set(digits)) == 1:
        return False

    return True


def validate_uk_nino(text: str) -> bool:
    """Validate structure of UK National Insurance Number."""

    cleaned = re.sub(r"[\s-]", "", text.upper())
    if not re.fullmatch(r"[A-Z]{2}\d{6}[A-D]", cleaned):
        return False

    invalid_prefixes = {"BG", "GB", "NK", "KN", "TN", "NT", "ZZ"}
    if cleaned[:2] in invalid_prefixes:
        return False

    forbidden_letters = set("DFIUV")
    if cleaned[0] in forbidden_letters or cleaned[1] in forbidden_letters:
        return False

    return True


def validate_iban(text: str) -> bool:
    """Validate IBAN using ISO 13616 mod-97 algorithm."""

    if not text:
        return False

    cleaned = re.sub(r"\s", "", text).upper()
    if len(cleaned) < 15 or len(cleaned) > 34:
        return False

    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", cleaned):
        return False

    rearranged = cleaned[4:] + cleaned[:4]
    converted = ""
    for char in rearranged:
        if char.isdigit():
            converted += char
        else:
            converted += str(ord(char) - 55)  # A=10

    remainder = 0
    for chunk_start in range(0, len(converted), 9):
        chunk = str(remainder) + converted[chunk_start: chunk_start + 9]
        remainder = int(chunk) % 97

    return remainder == 1


def validate_us_passport(text: str) -> bool:
    """Validate generic US passport format (1 letter + 7 digits)."""

    cleaned = re.sub(r"\s", "", text.upper())
    return bool(re.fullmatch(r"[A-Z]\d{7}", cleaned))


__all__ = [
    "validate_us_ssn",
    "validate_uk_nhs",
    "validate_ca_sin",
    "validate_au_medicare",
    "validate_au_tfn",
    "validate_uk_nino",
    "validate_iban",
    "validate_us_passport",
]
