"""
Credit Card Validators for Presidio PII Detection
Version: 1.7.0

Implements Luhn algorithm (modulo-10) checksum validation for credit card numbers.
Supports: Visa, Mastercard, American Express, Discover, JCB, Diners Club
"""


def luhn_checksum(card_number: str) -> bool:
    """
    Validate credit card number using Luhn algorithm (modulo-10 checksum).

    Algorithm:
    1. Starting from rightmost digit (check digit), double every second digit
    2. If doubled value > 9, subtract 9
    3. Sum all digits
    4. If sum % 10 == 0, checksum is valid

    Args:
        card_number: Credit card number as string (digits only, no spaces/hyphens)

    Returns:
        bool: True if checksum is valid, False otherwise

    Examples:
        >>> luhn_checksum("4532111111111111")  # Visa test card
        True
        >>> luhn_checksum("1234567890123456")  # Invalid
        False
    """
    # Remove any spaces, hyphens, or other non-digit characters
    digits = ''.join(filter(str.isdigit, card_number))

    # Card number must be 13-19 digits (standard range)
    if len(digits) < 13 or len(digits) > 19:
        return False

    # Luhn algorithm
    total = 0
    is_second_digit = False

    # Iterate from right to left
    for digit in reversed(digits):
        d = int(digit)

        if is_second_digit:
            d = d * 2
            if d > 9:
                d = d - 9

        total += d
        is_second_digit = not is_second_digit

    # Valid if sum is divisible by 10
    return (total % 10) == 0


def validate_credit_card(text: str) -> bool:
    """
    Validate credit card number with Luhn checksum.

    This function is called by Presidio after pattern matching.
    If it returns False, the entity is rejected.

    Args:
        text: Matched text (e.g., "4532-1234-5678-9010")

    Returns:
        bool: True if valid credit card, False otherwise
    """
    return luhn_checksum(text)


def get_card_type(card_number: str) -> str:
    """
    Determine card type based on IIN (Issuer Identification Number).

    Args:
        card_number: Credit card number (digits only)

    Returns:
        str: Card type ("VISA", "MASTERCARD", "AMEX", "DISCOVER", "JCB", "DINERS", "UNKNOWN")

    Examples:
        >>> get_card_type("4532111111111111")
        'VISA'
        >>> get_card_type("5425233430109903")
        'MASTERCARD'
    """
    digits = ''.join(filter(str.isdigit, card_number))

    if not digits:
        return "UNKNOWN"

    # Visa: starts with 4, length 13 or 16
    if digits[0] == '4' and len(digits) in [13, 16]:
        return "VISA"

    # Mastercard: starts with 51-55 or 2221-2720, length 16
    if len(digits) == 16:
        first_two = int(digits[:2])
        first_four = int(digits[:4])
        if (51 <= first_two <= 55) or (2221 <= first_four <= 2720):
            return "MASTERCARD"

    # American Express: starts with 34 or 37, length 15
    if len(digits) == 15:
        first_two = int(digits[:2])
        if first_two in [34, 37]:
            return "AMEX"

    # Discover: starts with 6011, 644-649, or 65, length 16
    if len(digits) == 16:
        first_four = int(digits[:4])
        first_three = int(digits[:3])
        first_two = int(digits[:2])
        if first_four == 6011 or (644 <= first_three <= 649) or first_two == 65:
            return "DISCOVER"

    # JCB: starts with 3528-3589, length 16
    if len(digits) == 16:
        first_four = int(digits[:4])
        if 3528 <= first_four <= 3589:
            return "JCB"

    # Diners Club: starts with 300-305, 36, or 38, length 14
    if len(digits) == 14:
        first_three = int(digits[:3])
        first_two = int(digits[:2])
        if (300 <= first_three <= 305) or first_two in [36, 38]:
            return "DINERS"

    return "UNKNOWN"


# Test cases (can be run with pytest)
if __name__ == "__main__":
    # Visa test cards
    assert luhn_checksum("4532111111111111") == True  # Visa 16-digit
    assert luhn_checksum("4539148803436467") == True  # Visa 16-digit
    assert luhn_checksum("4532-1111-1111-1111") == True  # With hyphens

    # Mastercard test cards
    assert luhn_checksum("5425233430109903") == True  # Mastercard
    assert luhn_checksum("5105105105105100") == True  # Mastercard

    # Amex test cards
    assert luhn_checksum("378282246310005") == True  # Amex 15-digit
    assert luhn_checksum("371449635398431") == True  # Amex 15-digit

    # Discover test cards
    assert luhn_checksum("6011111111111117") == True  # Discover
    assert luhn_checksum("6011000990139424") == True  # Discover

    # JCB test card
    assert luhn_checksum("3530111333300000") == True  # JCB

    # Diners Club test card
    assert luhn_checksum("30569309025904") == True  # Diners Club

    # Invalid cards
    assert luhn_checksum("1234567890123456") == False  # Invalid checksum
    assert luhn_checksum("4532111111111112") == False  # Wrong check digit

    # Card type detection
    assert get_card_type("4532111111111111") == "VISA"
    assert get_card_type("5425233430109903") == "MASTERCARD"
    assert get_card_type("378282246310005") == "AMEX"
    assert get_card_type("6011111111111117") == "DISCOVER"
    assert get_card_type("3530111333300000") == "JCB"
    assert get_card_type("30569309025904") == "DINERS"

    print("✅ All credit card validator tests passed!")
