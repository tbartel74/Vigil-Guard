"""
Generic format validators used to cut obvious false positives.
"""

from __future__ import annotations

import logging
import regex as re  # Use regex module for timeout support (ReDoS protection)

from .polish import extract_digits

logger = logging.getLogger(__name__)

# Named constants for clarity
MONTHS_WITH_30_DAYS = {4, 6, 9, 11}  # April, June, September, November
FEBRUARY = 2
MAX_FEBRUARY_DAYS = 29  # Not checking leap years for simplicity
MIN_PHONE_LENGTH = 3


def validate_phone_format(text: str) -> bool:
    """
    Validate phone number format by rejecting obvious fake patterns.

    Args:
        text: Phone number string (formatted or bare digits)

    Returns:
        True if the phone format looks realistic (accepted)
        False if the phone is sequential/repeated or malformed (rejected)
    """
    try:
        digits = extract_digits(text)
    except (TypeError, ValueError) as exc:
        logger.debug("validate_phone_format rejected invalid input: %s", exc)
        return False

    if len(digits) < MIN_PHONE_LENGTH:
        return False

    # Reject all-identical digits such as 111-111-1111
    unique_digits = set(digits)
    if len(unique_digits) == 1:
        return False

    # Reject ascending sequential patterns (wraps at 9 → 0 to catch 7890)
    is_sequential = all(
        digits[i + 1] == (digits[i] + 1) % 10
        for i in range(len(digits) - 1)
    )
    if is_sequential:
        return False

    return True


_ISO_DATE_REGEX = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def validate_date_format(text: str) -> bool:
    """
    Validate ISO (YYYY-MM-DD) dates for realistic month/day ranges.

    Non-ISO formats return True (fallback to default behavior).
    """
    match = _ISO_DATE_REGEX.match(text)
    if not match:
        return True  # Non-ISO formats are allowed

    try:
        _, month_str, day_str = match.groups()
        month = int(month_str)
        day = int(day_str)
    except (TypeError, ValueError) as exc:
        logger.debug("validate_date_format rejected invalid date input: %s", exc)
        return False

    # Validate month range
    if not 1 <= month <= 12:
        return False

    # Validate day range based on month
    if day < 1:
        return False

    # Check month-specific maximum days
    if month in MONTHS_WITH_30_DAYS and day > 30:
        return False

    if month == FEBRUARY and day > MAX_FEBRUARY_DAYS:
        return False

    if day > 31:  # No month has more than 31 days
        return False

    return True
