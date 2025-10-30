# PII Detection Testing Guide

Kompletny przewodnik po testach detekcji PII w Vigil Guard v1.6.

## Przegląd

System testów PII wykorzystuje 3 pliki testowe pokrywające różne scenariusze:

1. **pii-detection-comprehensive.test.js** (NOWY) - **57 payloads** z fixtures, pełne pokrycie międzynarodowe
2. **pii-detection-presidio.test.js** - Happy path Presidio (10 testów)
3. **pii-detection-fallback.test.js** - Fallback do regex (12 testów)

### Pokrycie międzynarodowe (57 payloads):

- **Polish PII** (5 payloads): PESEL, NIP, REGON, ID_CARD
- **International PII** (30 payloads):
  - **US**: SSN, Phone, Address, Driver's License
  - **UK**: NHS Number, National Insurance, Phone, Address, Passport, IBAN
  - **Canada**: SIN (Social Insurance Number)
  - **Australia**: Medicare Number, Tax File Number
  - **Europe**: IBAN (DE, FR, GB, PL)
  - **Global**: EMAIL, PHONE, CREDIT_CARD, IP, URL, PERSON, LOCATION, DATE_TIME
- **Invalid PII** (11 payloads): Invalid checksums (PESEL, NIP, US SSN, UK NHS, IBAN), benign numbers
- **Edge Cases** (8 payloads): Empty, unicode, encoding, long text
- **Performance Tests** (3 payloads): Latency benchmarks

## Wymagania Wstępne

### 1. Uruchom wszystkie usługi

```bash
cd /Users/tomaszbartel/Documents/Projects/Vigil-Guard

# Upewnij się że wszystkie kontenery działają
docker-compose ps

# Jeśli nie działają, uruchom:
docker-compose up -d
```

### 2. Zweryfikuj status Presidio

```bash
# Sprawdź czy Presidio jest zdrowy
curl http://localhost:5001/health

# Powinno zwrócić:
# {"status":"healthy","recognizers_loaded":4,"spacy_models":["en","pl"]}
```

### 3. Sprawdź n8n workflow

1. Otwórz http://localhost:5678
2. Zaimportuj workflow: `services/workflow/workflows/Vigil-Guard-v1.6.json`
3. Aktywuj workflow
4. Sprawdź czy webhook endpoint działa:

```bash
curl -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"test"}'
```

### 4. Ustaw zmienną środowiskową ClickHouse

```bash
# Export hasła z .env
export CLICKHOUSE_PASSWORD=$(grep CLICKHOUSE_PASSWORD .env | cut -d '=' -f2)

# Zweryfikuj połączenie
curl -u admin:$CLICKHOUSE_PASSWORD http://localhost:8123/ping
```

## Uruchamianie Testów

### Test 1: Comprehensive Suite (ZALECANY - pełne pokrycie)

```bash
cd services/workflow

# Uruchom wszystkie 35 payloads + 3 summary testy
npm test e2e/pii-detection-comprehensive.test.js

# Tylko wybrane grupy:
npm test e2e/pii-detection-comprehensive.test.js -t "Valid Polish PII"
npm test e2e/pii-detection-comprehensive.test.js -t "Valid International PII"
npm test e2e/pii-detection-comprehensive.test.js -t "Invalid PII"
npm test e2e/pii-detection-comprehensive.test.js -t "Edge Cases"
npm test e2e/pii-detection-comprehensive.test.js -t "Performance Tests"
npm test e2e/pii-detection-comprehensive.test.js -t "Detection Rate Summary"
```

### Test 2: Presidio Happy Path

```bash
# Wymaga działającego Presidio
npm test e2e/pii-detection-presidio.test.js
```

### Test 3: Regex Fallback

```bash
# Najlepiej z zatrzymanym Presidio (test fallback):
docker stop vigil-presidio-pii

npm test e2e/pii-detection-fallback.test.js

# Uruchom ponownie Presidio:
docker start vigil-presidio-pii
```

### Uruchom WSZYSTKIE testy PII na raz

```bash
npm test -- --grep "PII Detection"
```

## Oczekiwane Wyniki

### Comprehensive Suite (57 payloads)

```
✅ Valid Polish PII Detection (5 payloads)
   - PESEL_valid_checksum          → DETECTED
   - NIP_formatted                 → DETECTED
   - REGON_9_digits                → DETECTED
   - ID_card_formatted             → DETECTED
   - Mixed_Polish_PII              → DETECTED (3+ entities)

✅ Valid International PII Detection (30 payloads)
   📧 Email & Communication:
   - Email_simple                  → DETECTED
   - Email_complex                 → DETECTED
   - Phone_international           → DETECTED
   - US_Phone_formats              → DETECTED
   - UK_Phone_format               → DETECTED

   💳 Financial:
   - Credit_card_Visa              → DETECTED
   - Credit_card_bare              → DETECTED
   - IBAN_PL, IBAN_DE, IBAN_GB, IBAN_FR → DETECTED

   🆔 Government IDs:
   - US_SSN_formatted, US_SSN_bare → DETECTED
   - UK_NHS_number                 → DETECTED
   - UK_NI_number                  → DETECTED
   - CA_SIN_formatted              → DETECTED
   - AU_Medicare_number            → DETECTED
   - AU_TFN_number                 → DETECTED
   - Passport_number               → DETECTED
   - Driver_License_US             → DETECTED

   🌐 Network & Location:
   - IP_address_v4, IP_address_v6  → DETECTED
   - URL_http                      → DETECTED
   - Address_US, Address_UK        → MAY FAIL (NLP-based)

   👤 Personal:
   - Person_name_context           → MAY FAIL (NLP-based, low confidence)
   - Person_name_English           → MAY FAIL (NLP-based)
   - Date_of_Birth                 → DETECTED
   - Multiple_international_PII    → DETECTED (5+ entities)

✅ Invalid PII - Should NOT Detect (11 payloads)
   Polish:
   - PESEL_invalid_checksum        → NOT DETECTED ✅
   - NIP_invalid_checksum          → NOT DETECTED ✅

   International:
   - US_SSN_invalid_format         → NOT DETECTED ✅
   - UK_NHS_invalid_checksum       → NOT DETECTED ✅
   - IBAN_invalid_checksum         → NOT DETECTED ✅
   - Email_malformed               → NOT DETECTED ✅
   - Phone_too_short               → NOT DETECTED ✅
   - Credit_card_Luhn_fail         → NOT DETECTED ✅

   Benign Numbers:
   - Order_number                  → NOT DETECTED ✅
   - Date_as_digits                → NOT DETECTED ✅
   - Product_code                  → NOT DETECTED ✅

✅ Edge Cases (8 payloads)
   - Empty_string                  → Processed without error
   - Whitespace_only               → Processed without error
   - Multiple_spaces               → DETECTED (email)
   - Mixed_languages               → DETECTED (3 entities)
   - Unicode_characters            → DETECTED (Polish chars)
   - HTML_encoded                  → MAY NOT DETECT
   - Base64_encoded                → NOT DETECTED (as expected)
   - Very_long_text                → DETECTED (PESEL at end)

✅ Performance Tests (3 payloads)
   - Single_email_minimal          → < 2000ms e2e
   - Ten_emails                    → < 2000ms e2e
   - Mixed_PII_10_types            → < 2000ms e2e

📊 Detection Rate Summary
   - Valid PII detection rate:     ≥ 95%
   - False positive rate:          < 10%
   - Primary method:               presidio (when healthy)
```

## Interpretacja Wyników

### ✅ SUKCES (Expected)

- **Detected 95%+ valid PII**: Presidio + regex poprawnie wykrywają dane osobowe
- **False positive rate <10%**: Mało błędnych detekcji (order numbers, dates)
- **Latency <2000ms**: Wydajność jest akceptowalna
- **detection_method='presidio'**: Używany jest Presidio (gdy zdrowy)

### ⚠️ OSTRZEŻENIA (Acceptable)

- **PERSON detection failure**: Detekcja imion/nazwisk wymaga NLP, może mieć niską pewność
- **HTML/Base64 not detected**: Enkodowane dane nie są wykrywane (by design)
- **1-2 false positives**: Order numbers czasem wykrywane jako PESEL (tolerowane <10%)

### ❌ BŁĘDY (Action Required)

- **Detection rate <90%**: Presidio może być offline lub modele nie załadowane
  - Rozwiązanie: `./scripts/init-presidio.sh`
- **False positive rate >15%**: Checksum validation nie działa
  - Rozwiązanie: Sprawdź custom recognizers w `presidio-pii-api/recognizers/`
- **Latency >3000ms**: Problem z wydajnością
  - Rozwiązanie: Sprawdź `docker stats vigil-presidio-pii`

## Struktura Fixtures

Plik `tests/fixtures/pii-test-payloads.json`:

```json
{
  "valid_pii": {
    "polish": [5 payloads],          // PESEL, NIP, REGON, ID_CARD
    "international": [30 payloads]   // US SSN, UK NHS/NINO, CA SIN, AU Medicare/TFN,
                                     // EMAIL, PHONE, CARD, IBAN (PL/DE/GB/FR),
                                     // IP, URL, PERSON, LOCATION, DATE_TIME,
                                     // Passport, Driver License
  },
  "invalid_pii": {
    "false_formats": [8 payloads],   // Invalid checksums (PL, US, UK, IBAN)
    "benign_numbers": [3 payloads]   // Order numbers, dates, SKUs
  },
  "edge_cases": [8 payloads],        // Empty, unicode, encoding, long text
  "performance_tests": [3 payloads], // Latency benchmarks
  "metadata": {
    "version": "1.6.0",
    "total_payloads": 57,
    "international_coverage": {
      "US": ["SSN", "Phone", "Address", "Driver_License"],
      "UK": ["NHS", "NINO", "Phone", "Address", "Passport", "IBAN"],
      "Canada": ["SIN"],
      "Australia": ["Medicare", "TFN"],
      "Europe": ["IBAN_DE", "IBAN_FR", "IBAN_GB", "IBAN_PL"],
      "Poland": ["PESEL", "NIP", "REGON", "ID_CARD"],
      "Global": ["EMAIL", "PHONE", "CREDIT_CARD", "IP", "URL", "PERSON", "LOCATION", "DATE_TIME"]
    }
  }
}
```

## Troubleshooting

### Problem: "Presidio service is offline"

```bash
# Sprawdź czy kontener działa
docker ps | grep vigil-presidio-pii

# Jeśli nie działa, uruchom:
docker-compose up -d presidio-pii-api

# Sprawdź logi:
docker logs vigil-presidio-pii

# Zainicjalizuj Presidio:
./scripts/init-presidio.sh
```

### Problem: "Event not found in ClickHouse"

```bash
# Sprawdź czy ClickHouse działa
curl -u admin:$CLICKHOUSE_PASSWORD http://localhost:8123/ping

# Sprawdź logi n8n:
docker logs vigil-n8n | tail -20

# Zweryfikuj czy workflow jest aktywny:
# http://localhost:5678 → Check workflow status
```

### Problem: "Webhook request failed: HTTP 404"

```bash
# Sprawdź webhook ID w tests/helpers/webhook.js
cat tests/helpers/webhook.js | grep WEBHOOK_URL

# Zaimportuj workflow na nowo:
# http://localhost:5678 → Import → Vigil-Guard-v1.6.json

# Sprawdź nowy webhook ID w workflow → Settings → Webhook URL
```

### Problem: "PERSON entities not detected"

To jest normalne. Detekcja PERSON wymaga:
- spaCy NLP models (en_core_web_sm, pl_core_news_sm)
- Kontekst językowy (czasowniki, przyimki)
- Wyższa pewność (confidence >0.5)

Rozwiązania:
1. Dodaj więcej kontekstu: "Spotkałem się z Jan Kowalski wczoraj"
2. Obniż threshold w `unified_config.json`: `"score_threshold": 0.3`
3. Zaakceptuj jako known limitation (NLP-based detection)

## Metryki Sukcesu

Test suite jest uznawany za PASSED jeśli:

- ✅ Detection rate ≥ 95% (valid PII)
- ✅ False positive rate < 10% (invalid PII)
- ✅ Latency < 2000ms e2e (performance tests)
- ✅ Presidio used as primary method (when healthy)
- ✅ Fallback to regex works (when Presidio offline)
- ✅ All edge cases handled without crashes

## Dodatkowe Testy Manualne

### Test 1: Manual redaction check

```bash
curl -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
  -H "Content-Type: application/json" \
  -d '{"chatInput":"Jan Kowalski, PESEL: 92032100157, email: jan@example.com"}' | jq
```

Oczekiwany response:
```json
{
  "sessionId": "...",
  "chatInput": "[PERSON], PESEL: [PESEL], email: [EMAIL]",
  "status": "SANITIZED"
}
```

### Test 2: Check ClickHouse logging

```bash
# Sprawdź ostatnie 5 eventów z PII detection
clickhouse-client --password=$CLICKHOUSE_PASSWORD --query "
  SELECT
    timestamp,
    JSONExtractString(sanitizer_json, 'pii', 'detection_method') as method,
    JSONExtractInt(sanitizer_json, 'pii', 'entities_detected') as entities
  FROM n8n_logs.events_processed
  WHERE sanitizer_json LIKE '%pii%'
  ORDER BY timestamp DESC
  LIMIT 5
  FORMAT Pretty
"
```

### Test 3: Performance benchmark

```bash
# Uruchom 10 requestów i zmierz średni czas
for i in {1..10}; do
  time curl -s -X POST http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1 \
    -H "Content-Type: application/json" \
    -d '{"chatInput":"test@example.com"}' > /dev/null
done
```

## Następne Kroki

Po pomyślnym przejściu testów:

1. ✅ Commit zmian:
   ```bash
   git add services/workflow/tests/e2e/pii-detection-comprehensive.test.js
   git add services/workflow/tests/PII_TESTING_GUIDE.md
   git commit -m "test(pii): Add comprehensive PII detection test suite with 35 payloads"
   ```

2. 📊 Uruchom testy w CI/CD (jeśli skonfigurowane)

3. 📝 Zaktualizuj dokumentację projektu (TODO.md)

4. 🚀 Deploy do środowiska testowego

## Referencje

- **Fixtures**: `tests/fixtures/pii-test-payloads.json`
- **Webhook helpers**: `tests/helpers/webhook.js`
- **Presidio API**: http://localhost:5001/docs
- **n8n workflow**: http://localhost:5678
- **ClickHouse**: http://localhost:8123
- **Vigil Guard docs**: `/docs/PII_DETECTION.md`
