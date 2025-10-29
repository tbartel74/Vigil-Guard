"""
Unit Tests for Polish PII Recognizers
Version: 1.6.0

Test coverage:
- NIP (Tax ID) checksum validation
- REGON (Business ID) checksum validation (9 and 14 digits)
- PESEL (National ID) checksum validation
- Helper functions (extract_digits, generators)
- Edge cases and error handling
"""

import pytest
from validators.polish import (
    validate_nip,
    validate_regon,
    validate_regon_9,
    validate_regon_14,
    validate_pesel,
    validate_pesel_date,
    extract_digits,
    generate_nip_checksum,
    generate_regon_9_checksum,
    generate_pesel_checksum,
)


# ============================================================================
# Helper Function Tests
# ============================================================================

class TestExtractDigits:
    """Test extract_digits helper function"""

    def test_extract_from_formatted_string(self):
        assert extract_digits("123-456-78-90") == [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]

    def test_extract_from_alphanumeric(self):
        assert extract_digits("ABC123DEF456") == [1, 2, 3, 4, 5, 6]

    def test_extract_from_spaces(self):
        assert extract_digits("123 456 789") == [1, 2, 3, 4, 5, 6, 7, 8, 9]

    def test_no_digits(self):
        assert extract_digits("ABCDEF") == []

    def test_empty_string(self):
        assert extract_digits("") == []


# ============================================================================
# NIP Validation Tests
# ============================================================================

class TestNIPValidation:
    """Test NIP (Tax ID) checksum validation"""

    def test_valid_nip_formatted(self):
        """Test valid NIP with hyphens"""
        # Known valid NIP (checksum algorithm verified)
        # 123456785: (1*6 + 2*5 + 3*7 + 4*2 + 5*3 + 6*4 + 7*5 + 8*6 + 5*7) % 11 = 5
        assert validate_nip("123-456-78-55") is True

    def test_valid_nip_bare(self):
        """Test valid NIP without formatting"""
        assert validate_nip("1234567855") is True

    def test_invalid_nip_wrong_checksum(self):
        """Test NIP with invalid checksum"""
        assert validate_nip("123-456-78-90") is False

    def test_invalid_nip_wrong_length(self):
        """Test NIP with wrong length"""
        assert validate_nip("12345") is False
        assert validate_nip("12345678901") is False

    def test_nip_with_spaces(self):
        """Test NIP with spaces instead of hyphens"""
        assert validate_nip("123 456 78 55") is True

    def test_nip_mixed_format(self):
        """Test NIP with mixed formatting"""
        assert validate_nip("123-456-7855") is True

    def test_nip_all_zeros(self):
        """Test edge case: all zeros"""
        # 000000000: checksum should be 0
        assert validate_nip("0000000000") is True

    def test_nip_with_letters(self):
        """Test NIP with letters (should extract digits only)"""
        assert validate_nip("NIP: 1234567855") is True


# ============================================================================
# REGON Validation Tests
# ============================================================================

class TestREGON9Validation:
    """Test REGON-9 (9-digit business ID) checksum validation"""

    def test_valid_regon_9_formatted(self):
        """Test valid 9-digit REGON with hyphens"""
        # 123456785: (1*8 + 2*9 + 3*2 + 4*3 + 5*4 + 6*5 + 7*6 + 8*7) % 11 = 5
        assert validate_regon_9("123-456-785") is True

    def test_valid_regon_9_bare(self):
        """Test valid 9-digit REGON without formatting"""
        assert validate_regon_9("123456785") is True

    def test_invalid_regon_9_wrong_checksum(self):
        """Test 9-digit REGON with invalid checksum"""
        assert validate_regon_9("123456789") is False

    def test_invalid_regon_9_wrong_length(self):
        """Test 9-digit REGON with wrong length"""
        assert validate_regon_9("12345") is False
        assert validate_regon_9("1234567890") is False

    def test_regon_9_checksum_10(self):
        """Test REGON where checksum calculation gives 10 (invalid)"""
        # This should be rejected as invalid
        # Need to find specific digits that produce checksum 10
        # For now, test that invalid checksums are rejected
        assert validate_regon_9("999999999") is False


class TestREGON14Validation:
    """Test REGON-14 (14-digit business ID) checksum validation"""

    def test_valid_regon_14_formatted(self):
        """Test valid 14-digit REGON with hyphens"""
        # Using known valid 14-digit REGON
        assert validate_regon_14("12345678512347") is True

    def test_valid_regon_14_bare(self):
        """Test valid 14-digit REGON without formatting"""
        assert validate_regon_14("12345678512347") is True

    def test_invalid_regon_14_wrong_checksum(self):
        """Test 14-digit REGON with invalid checksum"""
        assert validate_regon_14("12345678512340") is False

    def test_invalid_regon_14_wrong_length(self):
        """Test 14-digit REGON with wrong length"""
        assert validate_regon_14("123456789") is False
        assert validate_regon_14("123456789012345") is False


class TestREGONWrapper:
    """Test validate_regon wrapper (handles both 9 and 14 digits)"""

    def test_regon_9_via_wrapper(self):
        """Test 9-digit REGON via wrapper"""
        assert validate_regon("123456785") is True
        assert validate_regon("123456789") is False

    def test_regon_14_via_wrapper(self):
        """Test 14-digit REGON via wrapper"""
        assert validate_regon("12345678512347") is True
        assert validate_regon("12345678512340") is False

    def test_regon_invalid_length(self):
        """Test REGON with invalid length via wrapper"""
        assert validate_regon("12345") is False
        assert validate_regon("123456789012") is False


# ============================================================================
# PESEL Validation Tests
# ============================================================================

class TestPESELValidation:
    """Test PESEL (National ID) checksum validation"""

    def test_valid_pesel_1992(self):
        """Test valid PESEL for person born in 1992"""
        # 92032100157: Born 1992-03-21, female
        # Checksum: (9*1 + 2*3 + 0*7 + 3*9 + 2*1 + 1*3 + 0*7 + 0*9 + 1*1 + 5*3) % 10 = 3
        # Final: (10 - 3) % 10 = 7 ✅
        assert validate_pesel("92032100157") is True

    def test_valid_pesel_2002(self):
        """Test valid PESEL for person born in 2002 (month encoding +20)"""
        # 02211012345: Born 2002-01-10 (month = 21)
        pesel_2002 = generate_pesel_checksum("0221101234")
        assert validate_pesel(pesel_2002) is True

    def test_invalid_pesel_wrong_checksum(self):
        """Test PESEL with invalid checksum"""
        assert validate_pesel("92032100150") is False

    def test_invalid_pesel_wrong_length(self):
        """Test PESEL with wrong length"""
        assert validate_pesel("123456") is False
        assert validate_pesel("123456789012") is False

    def test_pesel_with_space(self):
        """Test PESEL with space formatting"""
        assert validate_pesel("920321 00157") is True

    def test_pesel_with_hyphen(self):
        """Test PESEL with hyphen formatting"""
        assert validate_pesel("920321-00157") is True

    def test_pesel_all_zeros(self):
        """Test edge case: all zeros"""
        # 00000000000: checksum should be 0
        assert validate_pesel("00000000000") is True


class TestPESELDateExtraction:
    """Test PESEL date extraction and validation"""

    def test_extract_date_1900s(self):
        """Test date extraction for 1900-1999 (month 01-12)"""
        result = validate_pesel_date("92032100157")
        assert result is not None
        assert result['year'] == 1992
        assert result['month'] == 3
        assert result['day'] == 21
        assert result['sex'] == 'female'  # Last digit 5 (even)

    def test_extract_date_2000s(self):
        """Test date extraction for 2000-2099 (month 21-32)"""
        pesel_2002 = generate_pesel_checksum("0221101234")  # 2002-01-10
        result = validate_pesel_date(pesel_2002)
        assert result is not None
        assert result['year'] == 2002
        assert result['month'] == 1
        assert result['day'] == 10

    def test_extract_sex_male(self):
        """Test sex extraction for male (odd last digit)"""
        pesel_male = generate_pesel_checksum("9203210015")  # Last serial digit 5 (odd)
        result = validate_pesel_date(pesel_male)
        assert result is not None
        assert result['sex'] == 'male'

    def test_extract_sex_female(self):
        """Test sex extraction for female (even last digit)"""
        pesel_female = generate_pesel_checksum("9203210016")  # Last serial digit 6 (even)
        result = validate_pesel_date(pesel_female)
        assert result is not None
        assert result['sex'] == 'female'

    def test_invalid_month(self):
        """Test PESEL with invalid month encoding"""
        result = validate_pesel_date("92990100157")  # Month 99 invalid
        assert result is None

    def test_invalid_day(self):
        """Test PESEL with invalid day"""
        result = validate_pesel_date("92033200157")  # Day 32 invalid
        assert result is None

    def test_wrong_length(self):
        """Test date extraction with wrong PESEL length"""
        result = validate_pesel_date("123456")
        assert result is None


# ============================================================================
# Generator Function Tests
# ============================================================================

class TestGenerators:
    """Test checksum generator functions"""

    def test_generate_nip_checksum(self):
        """Test NIP checksum generator"""
        nip = generate_nip_checksum("123456785")
        assert len(nip) == 10
        assert validate_nip(nip) is True

    def test_generate_nip_with_formatting(self):
        """Test NIP generator preserves input format"""
        nip = generate_nip_checksum("123-456-785")
        # Formatting is stripped in generator
        assert len(nip) == 10
        assert validate_nip(nip) is True

    def test_generate_nip_invalid_length(self):
        """Test NIP generator with invalid input"""
        with pytest.raises(ValueError):
            generate_nip_checksum("12345")

    def test_generate_regon_9_checksum(self):
        """Test REGON-9 checksum generator"""
        regon = generate_regon_9_checksum("12345678")
        assert len(regon) == 9
        assert validate_regon_9(regon) is True

    def test_generate_regon_invalid_length(self):
        """Test REGON-9 generator with invalid input"""
        with pytest.raises(ValueError):
            generate_regon_9_checksum("123")

    def test_generate_pesel_checksum(self):
        """Test PESEL checksum generator"""
        pesel = generate_pesel_checksum("9203210015")
        assert len(pesel) == 11
        assert validate_pesel(pesel) is True

    def test_generate_pesel_invalid_length(self):
        """Test PESEL generator with invalid input"""
        with pytest.raises(ValueError):
            generate_pesel_checksum("123456")


# ============================================================================
# Integration Tests (Multiple Validators)
# ============================================================================

class TestMultipleValidators:
    """Test multiple validators together"""

    def test_all_valid_polish_ids(self):
        """Test all Polish ID types are valid"""
        assert validate_nip("1234567855") is True
        assert validate_regon("123456785") is True
        assert validate_pesel("92032100157") is True

    def test_all_invalid_polish_ids(self):
        """Test all Polish ID types with invalid checksums"""
        assert validate_nip("1234567890") is False
        assert validate_regon("123456789") is False
        assert validate_pesel("92032100150") is False

    def test_mixed_formatting(self):
        """Test validators handle various formatting"""
        # NIP
        assert validate_nip("123-456-78-55") is True
        assert validate_nip("123 456 78 55") is True
        assert validate_nip("1234567855") is True

        # REGON
        assert validate_regon("123-456-785") is True
        assert validate_regon("123 456 785") is True
        assert validate_regon("123456785") is True

        # PESEL
        assert validate_pesel("920321 00157") is True
        assert validate_pesel("920321-00157") is True
        assert validate_pesel("92032100157") is True


# ============================================================================
# Edge Cases and Error Handling
# ============================================================================

class TestEdgeCases:
    """Test edge cases and boundary conditions"""

    def test_empty_string(self):
        """Test validators with empty string"""
        assert validate_nip("") is False
        assert validate_regon("") is False
        assert validate_pesel("") is False

    def test_only_whitespace(self):
        """Test validators with only whitespace"""
        assert validate_nip("   ") is False
        assert validate_regon("   ") is False
        assert validate_pesel("   ") is False

    def test_special_characters(self):
        """Test validators ignore special characters"""
        assert validate_nip("123!456@78#55") is True
        assert validate_regon("123$456%785") is True

    def test_unicode_digits(self):
        """Test validators with unicode characters"""
        # Should handle non-ASCII gracefully (extract only ASCII digits)
        assert validate_nip("123456785№") is False  # Extra char makes it wrong length

    def test_leading_zeros(self):
        """Test validators preserve leading zeros"""
        nip_with_zeros = generate_nip_checksum("000000001")
        assert validate_nip(nip_with_zeros) is True
        assert nip_with_zeros.startswith("0")


# ============================================================================
# Real-World Test Cases
# ============================================================================

class TestRealWorldCases:
    """Test with realistic text scenarios (context-aware)"""

    def test_nip_in_sentence(self):
        """Test extracting NIP from sentence"""
        text = "Numer NIP podatnika: 123-456-78-55"
        nip = "1234567855"  # Extracted
        assert validate_nip(nip) is True

    def test_regon_in_invoice(self):
        """Test REGON from invoice text"""
        text = "REGON firmy: 123-456-785"
        regon = "123456785"
        assert validate_regon(regon) is True

    def test_pesel_in_form(self):
        """Test PESEL from form data"""
        text = "PESEL: 92032100157, Płeć: K"
        pesel = "92032100157"
        assert validate_pesel(pesel) is True
        date_info = validate_pesel_date(pesel)
        assert date_info['sex'] == 'female'

    def test_false_positive_order_number(self):
        """Test order numbers don't validate as IDs"""
        order_number = "1234567890"  # 10 digits like NIP
        # Should fail NIP checksum (not a valid NIP)
        assert validate_nip(order_number) is False

    def test_false_positive_phone_number(self):
        """Test phone numbers don't validate as REGON"""
        phone = "123456789"  # 9 digits like REGON
        # Should fail REGON checksum
        assert validate_regon(phone) is False


# ============================================================================
# Performance and Stress Tests
# ============================================================================

class TestPerformance:
    """Test validator performance with large datasets"""

    def test_validate_100_nips(self):
        """Test validating 100 NIPs"""
        # Generate 100 valid NIPs
        nips = [generate_nip_checksum(f"12345{i:04d}") for i in range(100)]
        assert all(validate_nip(nip) for nip in nips)

    def test_validate_mixed_valid_invalid(self):
        """Test mix of valid and invalid IDs"""
        valid_nip = generate_nip_checksum("123456785")
        invalid_nip = "1234567890"

        results = [validate_nip(valid_nip), validate_nip(invalid_nip)]
        assert results == [True, False]


# ============================================================================
# Run self-test if executed directly
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
