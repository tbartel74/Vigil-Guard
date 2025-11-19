"""
Test ReDoS protection in production recognizer loading path.

This test verifies that the recognizer loading mechanism properly validates
regex patterns for ReDoS vulnerabilities BEFORE they reach production use.

CRITICAL: These tests cover the production code path (load_custom_recognizers)
that is NOT covered by test_regex_timeout.py (which only tests the timeout
mechanism in isolation).
"""

import pytest
import tempfile
import yaml
import os
import sys
from pathlib import Path

# Add parent directory to path to import app module
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import load_custom_recognizers


class TestReDoSProductionPath:
    """Test ReDoS protection in production recognizer loading."""

    def test_recognizer_loading_rejects_redos_pattern(self):
        """
        Verify recognizers.yaml patterns are validated with ReDoS timeout.

        This test creates a temporary YAML file with a catastrophic backtracking
        pattern and verifies it's rejected during recognizer loading.

        Pattern: (a+)+$ causes exponential backtracking on input like 'aaa...!'
        """
        # Create temporary YAML with ReDoS pattern
        malicious_config = {
            'recognizers': [
                {
                    'name': 'MALICIOUS_TEST',
                    'supported_entity': 'TEST_ENTITY',
                    'patterns': [
                        {
                            'name': 'redos_pattern',
                            'regex': r'(a+)+$',  # Catastrophic backtracking
                            'score': 0.8
                        }
                    ]
                }
            ]
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(malicious_config, f)
            temp_yaml = f.name

        try:
            # Should raise ValueError due to timeout during pattern validation
            with pytest.raises(ValueError, match=r'(timeout|ReDoS)'):
                load_custom_recognizers(temp_yaml)
        finally:
            os.unlink(temp_yaml)

    def test_recognizer_loading_rejects_nested_quantifiers(self):
        """
        Verify nested quantifiers are detected and rejected.

        Pattern: (x+)* has nested quantifiers which can cause ReDoS.
        """
        malicious_config = {
            'recognizers': [
                {
                    'name': 'NESTED_QUANTIFIER_TEST',
                    'supported_entity': 'TEST_ENTITY',
                    'patterns': [
                        {
                            'name': 'nested_quant',
                            'regex': r'(x+)*y',  # Nested quantifiers
                            'score': 0.8
                        }
                    ]
                }
            ]
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(malicious_config, f)
            temp_yaml = f.name

        try:
            # Should raise ValueError due to nested quantifier detection
            with pytest.raises(ValueError, match=r'(nested quantifiers|ReDoS)'):
                load_custom_recognizers(temp_yaml)
        finally:
            os.unlink(temp_yaml)

    def test_recognizer_loading_accepts_safe_pattern(self):
        """
        Verify safe patterns are accepted without timeout.

        This is a control test - safe patterns should load successfully.
        """
        safe_config = {
            'recognizers': [
                {
                    'name': 'SAFE_TEST',
                    'supported_entity': 'TEST_ENTITY',
                    'patterns': [
                        {
                            'name': 'safe_pattern',
                            'regex': r'\b[A-Z]{2}\d{6}\b',  # Simple pattern, no backtracking
                            'score': 0.8
                        }
                    ]
                }
            ]
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(safe_config, f)
            temp_yaml = f.name

        try:
            # Should load successfully
            recognizers = load_custom_recognizers(temp_yaml)
            assert len(recognizers) > 0
            assert any(r.name == 'SAFE_TEST' for r in recognizers)
        finally:
            os.unlink(temp_yaml)

    def test_recognizer_loading_handles_large_input_timeout(self):
        """
        Verify timeout works with large pathological input (10KB test).

        Pattern that's safe on small input but times out on large input
        should be rejected during validation phase.
        """
        # Pattern that looks innocent but has quadratic behavior
        tricky_config = {
            'recognizers': [
                {
                    'name': 'QUADRATIC_TEST',
                    'supported_entity': 'TEST_ENTITY',
                    'patterns': [
                        {
                            'name': 'quadratic',
                            'regex': r'(a*)*b',  # Quadratic backtracking
                            'score': 0.8
                        }
                    ]
                }
            ]
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(tricky_config, f)
            temp_yaml = f.name

        try:
            # Should timeout during validation (uses 'a' * 100 + '!' test input)
            with pytest.raises(ValueError, match=r'(timeout|ReDoS)'):
                load_custom_recognizers(temp_yaml)
        finally:
            os.unlink(temp_yaml)


if __name__ == '__main__':
    # Run tests with verbose output
    pytest.main([__file__, '-v', '--tb=short'])
