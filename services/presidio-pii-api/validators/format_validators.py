"""
Generic format validators used to cut obvious false positives.
"""

from __future__ import annotations

import logging
import re

from .polish import extract_digits

logger = logging.getLogger(__name__)


def validate_phone_format(text: str) -> bool:
    """Reject repeated or sequential phone numbers (e.g., 1111111111 or 1234567890)."""
    try:
        digits = extract_digits(text)
    except (TypeError, ValueError) as exc:
        logger.debug("validate_phone_format rejected invalid input: %s", exc)
        return False

    if len(digits) < 3:
        return False

    # Reject all-identical digits such as 111-111-1111
    if len(set(digits)) == 1:
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
        return True

    _, month_str, day_str = match.groups()
    month = int(month_str)
    day = int(day_str)

    if month < 1 or month > 12:
        return False

    if day < 1 or day > 31:
        return False

    if month in {4, 6, 9, 11} and day > 30:
        return False

    if month == 2 and day > 29:
        return False

    return True
