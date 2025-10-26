#!/bin/bash

# Skrypt weryfikacyjny dla połączenia ClickHouse
# Pyta o hasło i testuje zapytania do bazy

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  ClickHouse Connection Verification for Vigil Guard Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo

# Sprawdź czy hasło jest w .env
if [ -f "../../.env" ]; then
    CLICKHOUSE_PASSWORD=$(grep "^CLICKHOUSE_PASSWORD=" ../../.env | cut -d'=' -f2)
    if [ -n "$CLICKHOUSE_PASSWORD" ]; then
        echo -e "${GREEN}✓${NC} Znaleziono CLICKHOUSE_PASSWORD w .env"
        echo -e "  Password length: ${#CLICKHOUSE_PASSWORD} characters"
        read -p "Użyć tego hasła? (y/n): " use_env
        if [ "$use_env" != "y" ]; then
            CLICKHOUSE_PASSWORD=""
        fi
    fi
fi

# Jeśli nie ma hasła, zapytaj użytkownika
if [ -z "$CLICKHOUSE_PASSWORD" ]; then
    echo -e "${YELLOW}Podaj hasło do ClickHouse:${NC}"
    read -s CLICKHOUSE_PASSWORD
    echo
fi

# Test 1: Ping ClickHouse
echo -e "\n${BLUE}Test 1:${NC} Ping ClickHouse..."
if curl -s http://localhost:8123/ping > /dev/null; then
    echo -e "${GREEN}✓${NC} ClickHouse odpowiada"
else
    echo -e "${RED}✗${NC} ClickHouse nie odpowiada"
    exit 1
fi

# Test 2: Autentykacja
echo -e "\n${BLUE}Test 2:${NC} Weryfikacja autentykacji..."
AUTH=$(echo -n "admin:${CLICKHOUSE_PASSWORD}" | base64)
RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Basic $AUTH" \
    "http://localhost:8123/?query=SELECT%201")

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓${NC} Autentykacja poprawna"
else
    echo -e "${RED}✗${NC} Autentykacja nieudana (HTTP $RESPONSE)"
    echo -e "${YELLOW}Sprawdź czy hasło jest poprawne${NC}"
    exit 1
fi

# Test 3: Sprawdź bazę danych
echo -e "\n${BLUE}Test 3:${NC} Sprawdzanie bazy n8n_logs..."
QUERY="SHOW DATABASES FORMAT JSON"
RESPONSE=$(curl -s -H "Authorization: Basic $AUTH" \
    "http://localhost:8123/?query=$(echo -n "$QUERY" | jq -sRr @uri)")

if echo "$RESPONSE" | jq -e '.data[] | select(.name == "n8n_logs")' > /dev/null; then
    echo -e "${GREEN}✓${NC} Baza n8n_logs istnieje"
else
    echo -e "${RED}✗${NC} Baza n8n_logs nie istnieje"
    exit 1
fi

# Test 4: Sprawdź tabele
echo -e "\n${BLUE}Test 4:${NC} Sprawdzanie tabel..."
QUERY="SHOW TABLES FROM n8n_logs FORMAT JSON"
RESPONSE=$(curl -s -H "Authorization: Basic $AUTH" \
    "http://localhost:8123/?query=$(echo -n "$QUERY" | jq -sRr @uri)")

echo "$RESPONSE" | jq -r '.data[].name' | while read -r table; do
    echo -e "  ${GREEN}✓${NC} $table"
done

# Test 5: Policz rekordy w events_processed
echo -e "\n${BLUE}Test 5:${NC} Liczba eventów w ostatnich 24h..."
QUERY="SELECT count() as total FROM n8n_logs.events_processed WHERE timestamp > now() - INTERVAL 24 HOUR FORMAT JSON"
RESPONSE=$(curl -s -H "Authorization: Basic $AUTH" \
    "http://localhost:8123/?query=$(echo -n "$QUERY" | jq -sRr @uri)")

TOTAL=$(echo "$RESPONSE" | jq -r '.data[0].total')
echo -e "  ${GREEN}✓${NC} Znaleziono $TOTAL eventów"

# Test 6: Pokaż ostatnie 5 eventów
echo -e "\n${BLUE}Test 6:${NC} Ostatnie 5 eventów..."
QUERY="SELECT timestamp, sessionId, original_input, final_status FROM n8n_logs.events_processed ORDER BY timestamp DESC LIMIT 5 FORMAT JSON"
RESPONSE=$(curl -s -H "Authorization: Basic $AUTH" \
    "http://localhost:8123/?query=$(echo -n "$QUERY" | jq -sRr @uri)")

echo "$RESPONSE" | jq -r '.data[] | "  [\(.timestamp)] \(.sessionId) - \(.final_status) - \(.original_input | .[0:50])"'

# Test 7: Sprawdź strukturę kolumn
echo -e "\n${BLUE}Test 7:${NC} Struktura tabeli events_processed..."
QUERY="DESCRIBE n8n_logs.events_processed FORMAT JSON"
RESPONSE=$(curl -s -H "Authorization: Basic $AUTH" \
    "http://localhost:8123/?query=$(echo -n "$QUERY" | jq -sRr @uri)")

echo "$RESPONSE" | jq -r '.data[] | "  \(.name): \(.type)"' | grep -E "(sessionId|timestamp|original_input|final_status)"

# Podsumowanie
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Wszystkie testy przeszły pomyślnie!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo
echo -e "${YELLOW}Możesz teraz uruchomić testy:${NC}"
echo -e "  # Password already configured in ../../.env"
echo -e "  npm test"
echo
