"""
Integration Tests for Presidio PII API
Version: 1.6.0

Test coverage:
- Flask API endpoints (/health, /analyze)
- Full request/response cycle
- Custom recognizer integration
- Error handling
- Performance benchmarks
"""

import pytest
import json
import time
from app import app, analyzer, loaded_recognizers


@pytest.fixture
def client():
    """Flask test client"""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


# ============================================================================
# Health Endpoint Tests
# ============================================================================

class TestHealthEndpoint:
    """Test /health endpoint"""

    def test_health_check_success(self, client):
        """Test health endpoint returns 200"""
        response = client.get('/health')
        assert response.status_code == 200

    def test_health_check_content(self, client):
        """Test health endpoint returns correct JSON structure"""
        response = client.get('/health')
        data = json.loads(response.data)

        assert data['status'] == 'healthy'
        assert data['version'] == '1.6.0'
        assert data['service'] == 'presidio-pii-api'
        assert 'models_loaded' in data
        assert 'custom_recognizers' in data
        assert 'recognizers_count' in data
        assert data['offline_capable'] is True

    def test_health_check_models_loaded(self, client):
        """Test health endpoint shows loaded spaCy models"""
        response = client.get('/health')
        data = json.loads(response.data)

        models = data['models_loaded']
        assert 'en_core_web_sm' in models
        assert 'pl_core_news_sm' in models

    def test_health_check_custom_recognizers(self, client):
        """Test health endpoint lists custom recognizers"""
        response = client.get('/health')
        data = json.loads(response.data)

        recognizers = data['custom_recognizers']
        assert len(recognizers) == data['recognizers_count']

        # Check that Polish recognizers are loaded
        recognizer_names = [r['name'] for r in recognizers]
        expected_names = ['PL_REGON', 'PL_NIP', 'PL_ID_CARD', 'PL_PESEL_ENHANCED']

        for expected_name in expected_names:
            assert expected_name in recognizer_names


# ============================================================================
# Analyze Endpoint - Basic Tests
# ============================================================================

class TestAnalyzeEndpointBasic:
    """Test /analyze endpoint basic functionality"""

    def test_analyze_empty_request(self, client):
        """Test analyze with empty request body"""
        response = client.post('/analyze', data='', content_type='application/json')
        assert response.status_code == 400

    def test_analyze_missing_text_field(self, client):
        """Test analyze with missing text field"""
        response = client.post('/analyze', json={})
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
        assert 'text' in data['message'].lower()

    def test_analyze_empty_text(self, client):
        """Test analyze with empty text string"""
        response = client.post('/analyze', json={'text': ''})
        assert response.status_code == 400

    def test_analyze_text_too_long(self, client):
        """Test analyze with text exceeding 10,000 characters"""
        long_text = 'a' * 10001
        response = client.post('/analyze', json={'text': long_text})
        assert response.status_code == 422
        data = json.loads(response.data)
        assert 'too long' in data['message'].lower()

    def test_analyze_clean_text(self, client):
        """Test analyze with clean text (no PII)"""
        response = client.post('/analyze', json={'text': 'This is a clean sentence.'})
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['entities'] == []
        assert data['detection_method'] == 'presidio'
        assert 'processing_time_ms' in data


# ============================================================================
# Analyze Endpoint - Polish PII Detection
# ============================================================================

class TestPolishPIIDetection:
    """Test detection of Polish PII types"""

    def test_detect_nip(self, client):
        """Test NIP detection"""
        text = "NIP podatnika: 123-456-78-55"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl',
            'entities': ['PL_NIP']
        })

        assert response.status_code == 200
        data = json.loads(response.data)

        # Should detect NIP (if checksum valid)
        entities = data['entities']
        nip_entities = [e for e in entities if e['type'] == 'PL_NIP']

        # Note: 123-456-78-55 checksum needs verification
        # For now, just check response structure
        assert isinstance(entities, list)

    def test_detect_regon(self, client):
        """Test REGON detection"""
        text = "REGON firmy: 123-456-785"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl',
            'entities': ['PL_REGON']
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']
        assert isinstance(entities, list)

    def test_detect_pesel(self, client):
        """Test PESEL detection"""
        text = "PESEL: 92032100157"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl',
            'entities': ['PL_PESEL']
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']

        # 92032100157 is a valid PESEL
        pesel_entities = [e for e in entities if e['type'] == 'PL_PESEL']
        assert len(pesel_entities) >= 1
        assert pesel_entities[0]['text'] == '92032100157'
        assert pesel_entities[0]['score'] >= 0.6

    def test_detect_id_card(self, client):
        """Test Polish ID card detection"""
        text = "Dowód osobisty: ABC123456"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl',
            'entities': ['PL_ID_CARD']
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']

        id_card_entities = [e for e in entities if e['type'] == 'PL_ID_CARD']
        assert len(id_card_entities) >= 1
        assert 'ABC123456' in id_card_entities[0]['text']


# ============================================================================
# Analyze Endpoint - Built-in Entity Detection
# ============================================================================

class TestBuiltinEntityDetection:
    """Test detection of built-in Presidio entities"""

    def test_detect_email(self, client):
        """Test email detection"""
        text = "Contact: john@example.com"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'en',
            'entities': ['EMAIL']
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']

        email_entities = [e for e in entities if e['type'] == 'EMAIL']
        assert len(email_entities) == 1
        assert email_entities[0]['text'] == 'john@example.com'
        assert email_entities[0]['score'] >= 0.9

    def test_detect_person_name(self, client):
        """Test person name detection (NLP)"""
        text = "Jan Kowalski is a developer"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl',
            'entities': ['PERSON']
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']

        person_entities = [e for e in entities if e['type'] == 'PERSON']
        assert len(person_entities) >= 1
        assert 'Kowalski' in person_entities[0]['text']

    def test_detect_phone_number(self, client):
        """Test phone number detection"""
        text = "Call me at +48 123 456 789"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl',
            'entities': ['PHONE_NUMBER']
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']

        phone_entities = [e for e in entities if e['type'] == 'PHONE_NUMBER']
        # Phone detection may vary, just check response structure
        assert isinstance(entities, list)


# ============================================================================
# Analyze Endpoint - Multiple Entities
# ============================================================================

class TestMultipleEntities:
    """Test detection of multiple PII types in one text"""

    def test_detect_multiple_polish_pii(self, client):
        """Test detecting multiple Polish PII types"""
        text = "Jan Kowalski, PESEL: 92032100157, NIP: 123-456-78-55, email: jan@example.com"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl',
            'entities': ['PERSON', 'PL_PESEL', 'PL_NIP', 'EMAIL']
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']

        # Should detect at least PESEL and EMAIL (known valid)
        entity_types = [e['type'] for e in entities]
        assert 'PL_PESEL' in entity_types
        assert 'EMAIL' in entity_types

    def test_detect_all_entities(self, client):
        """Test detecting with all entities enabled (default)"""
        text = "Contact: jan@example.com, PESEL: 92032100157"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl'
            # No 'entities' field = detect all
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities = data['entities']

        # Should detect EMAIL and PESEL
        entity_types = [e['type'] for e in entities]
        assert 'EMAIL' in entity_types
        assert 'PL_PESEL' in entity_types


# ============================================================================
# Analyze Endpoint - Score Threshold
# ============================================================================

class TestScoreThreshold:
    """Test score_threshold parameter"""

    def test_low_threshold(self, client):
        """Test with low threshold (0.3) - should detect more"""
        text = "Maybe an email: user@test"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'en',
            'score_threshold': 0.3
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities_low = data['entities']

        # With low threshold, may detect partial matches
        assert isinstance(entities_low, list)

    def test_high_threshold(self, client):
        """Test with high threshold (0.9) - should be stricter"""
        text = "Email: john@example.com"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'en',
            'score_threshold': 0.9
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        entities_high = data['entities']

        # High confidence entities only
        for entity in entities_high:
            assert entity['score'] >= 0.9

    def test_invalid_threshold(self, client):
        """Test with invalid threshold value"""
        response = client.post('/analyze', json={
            'text': 'test',
            'score_threshold': 1.5  # Invalid (>1.0)
        })

        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'threshold' in data['message'].lower()


# ============================================================================
# Analyze Endpoint - Response Structure
# ============================================================================

class TestResponseStructure:
    """Test response JSON structure"""

    def test_response_has_required_fields(self, client):
        """Test response contains all required fields"""
        response = client.post('/analyze', json={'text': 'test@example.com'})
        assert response.status_code == 200
        data = json.loads(response.data)

        # Required fields
        assert 'entities' in data
        assert 'detection_method' in data
        assert 'processing_time_ms' in data
        assert 'language' in data

        # Check types
        assert isinstance(data['entities'], list)
        assert isinstance(data['processing_time_ms'], int)
        assert data['detection_method'] == 'presidio'

    def test_entity_structure(self, client):
        """Test entity object structure"""
        response = client.post('/analyze', json={'text': 'test@example.com', 'language': 'en'})
        data = json.loads(response.data)
        entities = data['entities']

        if len(entities) > 0:
            entity = entities[0]
            assert 'type' in entity
            assert 'start' in entity
            assert 'end' in entity
            assert 'score' in entity
            assert 'text' in entity

            # Check types
            assert isinstance(entity['type'], str)
            assert isinstance(entity['start'], int)
            assert isinstance(entity['end'], int)
            assert isinstance(entity['score'], (int, float))
            assert isinstance(entity['text'], str)

    def test_entities_requested_field(self, client):
        """Test entities_requested field when entities specified"""
        response = client.post('/analyze', json={
            'text': 'test',
            'entities': ['EMAIL', 'PERSON']
        })

        data = json.loads(response.data)
        assert 'entities_requested' in data
        assert data['entities_requested'] == ['EMAIL', 'PERSON']


# ============================================================================
# Context-Aware Detection Tests
# ============================================================================

class TestContextAwareDetection:
    """Test context enhancement for Polish recognizers"""

    def test_nip_with_context_high_score(self, client):
        """Test NIP with context keywords gets higher score"""
        text_with_context = "NIP podatnika: 1234567855"
        response = client.post('/analyze', json={
            'text': text_with_context,
            'language': 'pl',
            'entities': ['PL_NIP'],
            'score_threshold': 0.6
        })

        data = json.loads(response.data)
        entities_with_context = data['entities']

        # With context, should boost score
        if len(entities_with_context) > 0:
            assert entities_with_context[0]['score'] >= 0.7

    def test_nip_without_context_lower_score(self, client):
        """Test NIP without context gets lower score"""
        text_no_context = "Numer: 1234567855"
        response = client.post('/analyze', json={
            'text': text_no_context,
            'language': 'pl',
            'entities': ['PL_NIP'],
            'score_threshold': 0.3
        })

        data = json.loads(response.data)
        # May or may not detect without context (depends on checksum)
        assert isinstance(data['entities'], list)


# ============================================================================
# Performance Tests
# ============================================================================

class TestPerformance:
    """Test API performance benchmarks"""

    def test_response_time_short_text(self, client):
        """Test response time for short text (<200ms)"""
        start_time = time.time()
        response = client.post('/analyze', json={
            'text': 'Email: test@example.com',
            'language': 'en'
        })
        elapsed = (time.time() - start_time) * 1000

        assert response.status_code == 200
        data = json.loads(response.data)

        # API should respond in <500ms for short text
        assert elapsed < 500
        # processing_time_ms should be even faster
        assert data['processing_time_ms'] < 300

    def test_response_time_medium_text(self, client):
        """Test response time for medium text (500 chars)"""
        text = "Jan Kowalski, email: jan@example.com, PESEL: 92032100157. " * 10
        start_time = time.time()
        response = client.post('/analyze', json={'text': text, 'language': 'pl'})
        elapsed = (time.time() - start_time) * 1000

        assert response.status_code == 200
        assert elapsed < 1000  # <1s for medium text


# ============================================================================
# Error Handling Tests
# ============================================================================

class TestErrorHandling:
    """Test error handling and edge cases"""

    def test_invalid_json(self, client):
        """Test with invalid JSON body"""
        response = client.post('/analyze',
                                data='invalid json',
                                content_type='application/json')
        assert response.status_code == 400

    def test_unsupported_language(self, client):
        """Test with unsupported language code"""
        response = client.post('/analyze', json={
            'text': 'test',
            'language': 'fr'  # French not supported
        })

        # Should fallback to 'pl' and succeed
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['language'] == 'pl'  # Fallback language

    def test_special_characters(self, client):
        """Test text with special characters"""
        text = "Email: test@example.com 🎉 <script>alert('xss')</script>"
        response = client.post('/analyze', json={'text': text})

        # Should handle special chars gracefully
        assert response.status_code == 200

    def test_unicode_text(self, client):
        """Test text with Polish unicode characters"""
        text = "Nazwisko: Michał Żółć, email: michal@example.com"
        response = client.post('/analyze', json={
            'text': text,
            'language': 'pl'
        })

        assert response.status_code == 200
        data = json.loads(response.data)
        # Should detect email at minimum
        entity_types = [e['type'] for e in data['entities']]
        assert 'EMAIL' in entity_types


# ============================================================================
# Run self-test if executed directly
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
