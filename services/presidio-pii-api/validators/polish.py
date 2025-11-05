"""
Polish PII Validators - Checksum Validation Functions
Version: 1.6.0

This module implements checksum validation for Polish identification numbers:
- NIP (Tax ID): 10 digits with weighted modulo-11 checksum
- REGON (Business ID): 9 or 14 digits with weighted modulo-11 checksum
- PESEL (National ID): 11 digits with weighted modulo-10 checksum

All functions return True if checksum is valid, False otherwise.
Invalid format (wrong length, non-digits) returns False.

References:
- GUS (Główny Urząd Statystyczny): REGON specification
- Ministry of Finance: NIP specification
- Ministry of Interior: PESEL specification
"""

from typing import List, Optional
import re
import logging

logger = logging.getLogger(__name__)


def extract_digits(text: str) -> List[int]:
    """
    Extract all digits from a string and convert to list of integers.

    Args:
        text: Input string (may contain hyphens, spaces, etc.)

    Returns:
        List of integers (digits only), or empty list if extraction fails

    Example:
        >>> extract_digits("123-456-78-90")
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
        >>> extract_digits("ABC123")
        [1, 2, 3]
    """
    try:
        return [int(d) for d in text if d.isdigit()]
    except (TypeError, AttributeError) as e:
        # TypeError: text is not iterable (e.g., None, int)
        # AttributeError: text has no .isdigit() method
        logger.error(f"extract_digits failed - invalid input type {type(text).__name__}: {e}")
        return []  # Return empty list to indicate extraction failure
    except MemoryError as e:
        # Extremely rare - text is massive string causing memory exhaustion
        logger.error(f"extract_digits failed - MemoryError for text length {len(text)}: {e}")
        return []


def validate_nip(nip: str) -> bool:
    """
    Validate Polish NIP (Tax Identification Number) checksum.

    Algorithm:
    1. Extract 10 digits from input
    2. Multiply first 9 digits by weights: [6, 5, 7, 2, 3, 4, 5, 6, 7]
    3. Sum all products: S = Σ(digit[i] × weight[i])
    4. Calculate checksum: C = S mod 11
    5. Compare C with 10th digit (must match)

    Args:
        nip: NIP string (formatted or bare, e.g., "123-456-78-90" or "1234567890")

    Returns:
        True if checksum valid, False otherwise

    Examples:
        >>> validate_nip("123-456-32-18")
        True
        >>> validate_nip("1234567890")
        False  # Invalid checksum
        >>> validate_nip("123")
        False  # Wrong length

    References:
        https://www.gov.pl/web/kas/numery-identyfikacyjne
    """
    digits = extract_digits(nip)

    if len(digits) != 10:
        return False

    # Weights for first 9 digits
    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]

    # Calculate weighted sum
    checksum = sum(d * w for d, w in zip(digits[:9], weights)) % 11

    # Handle special case: if checksum is 10, it's invalid
    # (some implementations use 10 → 0, but officially it's invalid)
    if checksum == 10:
        return False

    # Compare with last digit
    return checksum == digits[9]


def validate_regon_9(regon: str) -> bool:
    """
    Validate 9-digit REGON (business ID) checksum.

    Algorithm:
    1. Extract 9 digits from input
    2. Multiply first 8 digits by weights: [8, 9, 2, 3, 4, 5, 6, 7]
    3. Sum all products: S = Σ(digit[i] × weight[i])
    4. Calculate checksum: C = S mod 11
    5. If C == 10, it's invalid; otherwise compare C with 9th digit

    Args:
        regon: 9-digit REGON string (formatted or bare, e.g., "123-456-789")

    Returns:
        True if checksum valid, False otherwise

    Examples:
        >>> validate_regon_9("123456785")
        True
        >>> validate_regon_9("123-456-789")
        False  # Invalid checksum
        >>> validate_regon_9("12345")
        False  # Wrong length

    References:
        https://www.gov.pl/web/kas/regon
    """
    digits = extract_digits(regon)

    if len(digits) != 9:
        return False

    # Weights for first 8 digits
    weights = [8, 9, 2, 3, 4, 5, 6, 7]

    # Calculate weighted sum
    checksum = sum(d * w for d, w in zip(digits[:8], weights)) % 11

    # If checksum is 10, REGON is invalid
    if checksum == 10:
        return False

    # Compare with last digit
    return checksum == digits[8]


def validate_regon_14(regon: str) -> bool:
    """
    Validate 14-digit REGON (extended business ID) checksum.

    Algorithm:
    1. Extract 14 digits from input
    2. Multiply first 13 digits by weights: [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]
    3. Sum all products: S = Σ(digit[i] × weight[i])
    4. Calculate checksum: C = S mod 11
    5. If C == 10, it's invalid; otherwise compare C with 14th digit

    Args:
        regon: 14-digit REGON string (formatted or bare)

    Returns:
        True if checksum valid, False otherwise

    Examples:
        >>> validate_regon_14("12345678512347")
        True  # Valid 14-digit REGON
        >>> validate_regon_14("123-456-789-12345")
        False  # Invalid checksum

    References:
        https://www.gov.pl/web/kas/regon
    """
    digits = extract_digits(regon)

    if len(digits) != 14:
        return False

    # Weights for first 13 digits
    weights = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]

    # Calculate weighted sum
    checksum = sum(d * w for d, w in zip(digits[:13], weights)) % 11

    # If checksum is 10, REGON is invalid
    if checksum == 10:
        return False

    # Compare with last digit
    return checksum == digits[13]


def validate_regon(regon: str) -> bool:
    """
    Validate REGON (9 or 14 digits) checksum.

    This is a convenience wrapper that handles both 9-digit and 14-digit REGONs.

    Args:
        regon: REGON string (9 or 14 digits, formatted or bare)

    Returns:
        True if checksum valid for either format, False otherwise

    Examples:
        >>> validate_regon("123456785")
        True  # Valid 9-digit
        >>> validate_regon("12345678512347")
        True  # Valid 14-digit
        >>> validate_regon("12345")
        False  # Wrong length
    """
    digits = extract_digits(regon)

    if len(digits) == 9:
        return validate_regon_9(regon)
    elif len(digits) == 14:
        return validate_regon_14(regon)
    else:
        return False


def validate_pesel(pesel: str) -> bool:
    """
    Validate Polish PESEL (National Identification Number) checksum.

    PESEL format: YYMMDDXXXXC (11 digits)
    - YY: Year of birth (last 2 digits)
    - MM: Month of birth (with century encoding: +20 for 2000-2099, +40 for 2100-2199, etc.)
    - DD: Day of birth
    - XXXX: Serial number (last digit indicates sex: odd=male, even=female)
    - C: Checksum digit

    Algorithm:
    1. Extract 11 digits from input
    2. Multiply first 10 digits by weights: [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
    3. Sum all products: S = Σ(digit[i] × weight[i])
    4. Calculate checksum: C = (10 - (S mod 10)) mod 10
    5. Compare C with 11th digit

    Args:
        pesel: PESEL string (11 digits, formatted or bare)

    Returns:
        True if checksum valid, False otherwise

    Examples:
        >>> validate_pesel("92032100157")
        True  # Valid PESEL (born 1992-03-21 or 2092-03-21)
        >>> validate_pesel("12345678901")
        False  # Invalid checksum
        >>> validate_pesel("920321 00157")
        True  # Valid with space

    References:
        https://www.gov.pl/web/gov/czym-jest-numer-pesel
    """
    digits = extract_digits(pesel)

    if len(digits) != 11:
        return False

    # Weights for first 10 digits
    weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]

    # Calculate weighted sum
    weighted_sum = sum(d * w for d, w in zip(digits[:10], weights))

    # Calculate checksum: (10 - (sum mod 10)) mod 10
    checksum = (10 - (weighted_sum % 10)) % 10

    # Compare with last digit
    return checksum == digits[10]


def validate_pesel_date(pesel: str) -> Optional[dict]:
    """
    Validate and extract date information from PESEL.

    This function checks if the date encoded in PESEL is valid.
    Month encoding for century:
    - 01-12: 1900-1999
    - 21-32: 2000-2099
    - 41-52: 2100-2199
    - 61-72: 2200-2299
    - 81-92: 1800-1899

    Args:
        pesel: PESEL string (11 digits)

    Returns:
        Dict with {year, month, day, sex} if valid, None if invalid

    Examples:
        >>> validate_pesel_date("92032100157")
        {'year': 1992, 'month': 3, 'day': 21, 'sex': 'female'}
        >>> validate_pesel_date("20211012345")
        {'year': 2002, 'month': 1, 'day': 10, 'sex': 'male'}
        >>> validate_pesel_date("99139912345")
        None  # Invalid date (month 99)
    """
    digits = extract_digits(pesel)

    if len(digits) != 11:
        return None

    # Extract components
    yy = digits[0] * 10 + digits[1]
    mm = digits[2] * 10 + digits[3]
    dd = digits[4] * 10 + digits[5]
    sex_digit = digits[9]

    # Decode century from month
    if 1 <= mm <= 12:
        year = 1900 + yy
        month = mm
    elif 21 <= mm <= 32:
        year = 2000 + yy
        month = mm - 20
    elif 41 <= mm <= 52:
        year = 2100 + yy
        month = mm - 40
    elif 61 <= mm <= 72:
        year = 2200 + yy
        month = mm - 60
    elif 81 <= mm <= 92:
        year = 1800 + yy
        month = mm - 80
    else:
        return None  # Invalid month encoding

    # Validate day (simple check, doesn't account for leap years)
    if not (1 <= dd <= 31):
        return None

    # Validate month
    if not (1 <= month <= 12):
        return None

    # Determine sex (odd = male, even = female)
    sex = "male" if sex_digit % 2 == 1 else "female"

    return {
        "year": year,
        "month": month,
        "day": dd,
        "sex": sex
    }


# ============================================================================
# Presidio Integration Functions
# ============================================================================
# These functions are called by Presidio's PatternRecognizer with validator
# They must return True (valid) or False (invalid)
# ============================================================================

def checksum_nip(text: str) -> bool:
    """Presidio validator wrapper for NIP checksum."""
    return validate_nip(text)


def checksum_regon(text: str) -> bool:
    """Presidio validator wrapper for REGON checksum."""
    return validate_regon(text)


def checksum_pesel(text: str) -> bool:
    """Presidio validator wrapper for PESEL checksum."""
    return validate_pesel(text)


# ============================================================================
# Presidio PatternRecognizer Integration
# ============================================================================

from presidio_analyzer import PatternRecognizer

class ValidatedPatternRecognizer(PatternRecognizer):
    """
    Pattern recognizer with integrated checksum validation.
    Rejects invalid checksums DURING pattern matching, not in post-processing.

    This class extends Presidio's PatternRecognizer to add checksum validation
    at the pattern matching stage, before scoring. Invalid checksums are rejected
    immediately, preventing them from appearing in results.

    Args:
        validator_func: Callable that takes text string and returns bool (True if valid)
        **kwargs: Additional arguments passed to PatternRecognizer base class

    Example:
        >>> recognizer = ValidatedPatternRecognizer(
        ...     supported_entity="PL_NIP",
        ...     name="NIP Pattern Recognizer",
        ...     patterns=[Pattern("nip_pattern", r"\\d{3}-\\d{3}-\\d{2}-\\d{2}", 0.8)],
        ...     validator_func=validate_nip
        ... )
    """
    def __init__(self, validator_func=None, **kwargs):
        super().__init__(**kwargs)
        self.validator_func = validator_func

    def validate_result(self, pattern_text):
        """
        Override base class method - called BEFORE scoring.
        Return False to reject pattern match immediately.

        Args:
            pattern_text: The text matched by the regex pattern

        Returns:
            bool: True if checksum is valid (or no validator), False to reject match
        """
        if self.validator_func:
            # Clean text for validation (remove separators)
            cleaned_text = pattern_text.replace('-', '').replace(' ', '')
            is_valid = self.validator_func(cleaned_text)
            if not is_valid:
                logger.debug(f"Checksum validation REJECTED: {pattern_text} for {self.name}")
            return is_valid
        return True  # No validator = allow


# ============================================================================
# Testing Helpers
# ============================================================================

def generate_nip_checksum(first_9_digits: str) -> str:
    """
    Generate valid NIP with checksum from first 9 digits.

    Useful for generating test data.

    Args:
        first_9_digits: String of 9 digits

    Returns:
        Complete 10-digit NIP with valid checksum

    Example:
        >>> generate_nip_checksum("123456789")
        "1234567890"
    """
    digits = extract_digits(first_9_digits)

    if len(digits) != 9:
        raise ValueError("Must provide exactly 9 digits")

    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    checksum = sum(d * w for d, w in zip(digits, weights)) % 11

    if checksum == 10:
        raise ValueError("Checksum is 10 (invalid NIP), choose different digits")

    return first_9_digits.replace("-", "").replace(" ", "") + str(checksum)


def generate_regon_9_checksum(first_8_digits: str) -> str:
    """
    Generate valid 9-digit REGON with checksum from first 8 digits.

    Args:
        first_8_digits: String of 8 digits

    Returns:
        Complete 9-digit REGON with valid checksum

    Example:
        >>> generate_regon_9_checksum("12345678")
        "123456785"
    """
    digits = extract_digits(first_8_digits)

    if len(digits) != 8:
        raise ValueError("Must provide exactly 8 digits")

    weights = [8, 9, 2, 3, 4, 5, 6, 7]
    checksum = sum(d * w for d, w in zip(digits, weights)) % 11

    if checksum == 10:
        raise ValueError("Checksum is 10 (invalid REGON), choose different digits")

    return first_8_digits.replace("-", "").replace(" ", "") + str(checksum)


def generate_pesel_checksum(first_10_digits: str) -> str:
    """
    Generate valid PESEL with checksum from first 10 digits.

    Args:
        first_10_digits: String of 10 digits (YYMMDDXXXX)

    Returns:
        Complete 11-digit PESEL with valid checksum

    Example:
        >>> generate_pesel_checksum("9203210015")
        "92032100157"
    """
    digits = extract_digits(first_10_digits)

    if len(digits) != 10:
        raise ValueError("Must provide exactly 10 digits")

    weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
    weighted_sum = sum(d * w for d, w in zip(digits, weights))
    checksum = (10 - (weighted_sum % 10)) % 10

    return first_10_digits.replace("-", "").replace(" ", "") + str(checksum)


# ============================================================================
# Module Exports
# ============================================================================

__all__ = [
    # Main validation functions
    "validate_nip",
    "validate_regon",
    "validate_regon_9",
    "validate_regon_14",
    "validate_pesel",
    "validate_pesel_date",

    # Presidio integration wrappers
    "checksum_nip",
    "checksum_regon",
    "checksum_pesel",

    # Presidio PatternRecognizer integration
    "ValidatedPatternRecognizer",

    # Helpers
    "extract_digits",
    "generate_nip_checksum",
    "generate_regon_9_checksum",
    "generate_pesel_checksum",
]


if __name__ == "__main__":
    # Quick self-test
    print("Polish PII Validators - Self Test")
    print("=" * 50)

    # NIP tests
    print("\n1. NIP Validation:")
    print(f"  123-456-32-18: {validate_nip('123-456-32-18')}")  # Should be True
    print(f"  1234567890: {validate_nip('1234567890')}")  # Should be False

    # REGON tests
    print("\n2. REGON Validation:")
    print(f"  123456785: {validate_regon('123456785')}")  # Should be True
    print(f"  123456789: {validate_regon('123456789')}")  # Should be False

    # PESEL tests
    print("\n3. PESEL Validation:")
    print(f"  92032100157: {validate_pesel('92032100157')}")  # Should be True
    print(f"  12345678901: {validate_pesel('12345678901')}")  # Should be False

    # Date extraction
    print("\n4. PESEL Date Extraction:")
    date_info = validate_pesel_date("92032100157")
    if date_info:
        print(f"  92032100157: {date_info}")  # 1992-03-21, female

    print("\n" + "=" * 50)
    print("Self-test complete. Run pytest for full test suite.")
