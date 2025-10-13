#!/bin/bash

# Webhook Verification Script
# Tests if n8n webhook is properly configured and active

set -e

WEBHOOK_URL="http://localhost:5678/webhook/42f773e2-7ebf-42f7-a993-8be016d218e1"
TEST_PAYLOAD='{"text": "Hello, this is a test message"}'

echo "========================================="
echo "Vigil Guard - Webhook Verification"
echo "========================================="
echo ""

# Check if n8n is running
echo "[1/5] Checking if n8n container is running..."
if docker ps --filter "name=vigil-n8n" --format "{{.Names}}" | grep -q "vigil-n8n"; then
    echo "✅ n8n container is running"
else
    echo "❌ n8n container is NOT running"
    echo ""
    echo "Start n8n with:"
    echo "  docker-compose up -d vigil-n8n"
    exit 1
fi
echo ""

# Check if n8n UI is accessible
echo "[2/5] Checking if n8n UI is accessible..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5678)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ n8n UI is accessible at http://localhost:5678"
else
    echo "❌ n8n UI returned HTTP $HTTP_CODE"
    exit 1
fi
echo ""

# Test webhook endpoint
echo "[3/5] Testing webhook endpoint..."
echo "URL: $WEBHOOK_URL"
echo "Payload: $TEST_PAYLOAD"
echo ""

RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$TEST_PAYLOAD" \
    -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "404" ]; then
    echo "❌ Webhook is NOT active (404 Not Found)"
    echo ""
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "ACTION REQUIRED:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. Open n8n UI: http://localhost:5678"
    echo "2. Navigate to workflow: 'Vigil-Guard-v1.0'"
    echo "3. Click the TOGGLE switch in top-right corner (OFF → ON)"
    echo "4. Wait 2-3 seconds for webhook registration"
    echo "5. Run this script again"
    echo ""
    echo "Alternatively, import workflow if not present:"
    echo "  - Go to: Workflows → Add workflow → Import from file"
    echo "  - Select: services/workflow/workflows/Vigil_LLM_guard_v1.json"
    echo "  - Then activate it"
    echo ""
    exit 1
elif [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Webhook is ACTIVE and responding"
    echo ""
    echo "Response preview (first 500 chars):"
    echo "$BODY" | jq '.' 2>/dev/null | head -c 500 || echo "$BODY" | head -c 500
    echo ""
    echo "..."
elif [ "$HTTP_CODE" -ge 500 ]; then
    echo "⚠️  Webhook is registered but workflow has errors (HTTP $HTTP_CODE)"
    echo ""
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    echo ""
    echo "This means webhook is active, but there's a workflow execution error."
    echo "Check n8n logs:"
    echo "  docker logs vigil-n8n --tail 50"
    exit 1
else
    echo "⚠️  Unexpected HTTP status: $HTTP_CODE"
    echo ""
    echo "Response:"
    echo "$BODY"
    exit 1
fi
echo ""

# Check response structure
echo "[4/5] Validating response structure..."
if echo "$BODY" | jq -e '.final_decision' > /dev/null 2>&1; then
    echo "✅ Response contains 'final_decision' field"
else
    echo "⚠️  Response missing 'final_decision' field (might be expected for simple webhook)"
fi

if echo "$BODY" | jq -e '.sanitizer' > /dev/null 2>&1; then
    echo "✅ Response contains 'sanitizer' field"
else
    echo "⚠️  Response missing 'sanitizer' field"
fi
echo ""

# Check ClickHouse logging
echo "[5/5] Checking if event was logged to ClickHouse..."
sleep 2  # Wait for async logging

if docker ps --filter "name=vigil-clickhouse" --format "{{.Names}}" | grep -q "vigil-clickhouse"; then
    RECENT_EVENTS=$(docker exec vigil-clickhouse clickhouse-client -q \
        "SELECT count() FROM n8n_logs.events_processed WHERE timestamp > now() - INTERVAL 10 SECOND" 2>/dev/null || echo "0")

    if [ "$RECENT_EVENTS" -gt 0 ]; then
        echo "✅ Event logged to ClickHouse ($RECENT_EVENTS events in last 10s)"
    else
        echo "⚠️  No recent events in ClickHouse (might be async delay)"
    fi
else
    echo "⚠️  ClickHouse container not running (logging will fail)"
fi
echo ""

# Summary
echo "========================================="
echo "✅ WEBHOOK VERIFICATION COMPLETE"
echo "========================================="
echo ""
echo "Webhook is properly configured and ready for testing!"
echo ""
echo "Next steps:"
echo "  1. Create test fixtures: services/workflow/tests/fixtures/"
echo "  2. Write E2E tests with vitest"
echo "  3. Use this webhook URL in tests:"
echo "     $WEBHOOK_URL"
echo ""
echo "Run tests with:"
echo "  cd services/workflow"
echo "  npm test"
echo ""
