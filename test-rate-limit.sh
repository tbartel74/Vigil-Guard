#!/bin/bash

# Test script for rate limiting on /api/auth/login
# Should allow 5 attempts, then return 429 on 6th attempt

echo "=== Testing Login Rate Limiting (5 attempts per 15 minutes) ==="
echo ""

BASE_URL="http://localhost:8787"
LOGIN_URL="$BASE_URL/api/auth/login"

# Test credentials (invalid to trigger rate limit faster)
USERNAME="test"
PASSWORD="wrong"

echo "Attempting 6 login requests..."
echo ""

for i in {1..6}; do
  echo "Attempt $i:"
  RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$LOGIN_URL" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

  HTTP_STATUS=$(echo "$RESPONSE" | grep HTTP_STATUS | cut -d':' -f2)
  BODY=$(echo "$RESPONSE" | grep -v HTTP_STATUS)

  echo "  Status: $HTTP_STATUS"
  echo "  Response: $BODY"

  if [ "$HTTP_STATUS" = "429" ]; then
    echo "  ✅ RATE LIMIT TRIGGERED (as expected on 6th attempt)"
  elif [ "$i" -le 5 ]; then
    echo "  ✅ Request allowed (attempt $i/5)"
  else
    echo "  ❌ Expected 429, got $HTTP_STATUS"
  fi

  echo ""
  sleep 0.5
done

echo "=== Test Complete ==="
echo ""
echo "Expected results:"
echo "  - Attempts 1-5: 401 Unauthorized (invalid credentials)"
echo "  - Attempt 6: 429 Too Many Requests (rate limit)"
echo ""
echo "Rate limit will reset after 15 minutes."
