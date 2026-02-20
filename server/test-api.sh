#!/usr/bin/env bash
# Smoke tests for all Phase 2 API endpoints.
# Requires: server running on localhost:3001, curl, jq
# Usage: bash server/test-api.sh

set -euo pipefail

BASE="http://localhost:3001/api"
PASS=0
FAIL=0

check() {
  local label="$1" expected_status="$2" actual_status="$3" body="$4"
  if [ "$actual_status" -eq "$expected_status" ]; then
    echo "  PASS  $label (HTTP $actual_status)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label — expected $expected_status, got $actual_status"
    echo "        $body"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Health ==="
BODY=$(curl -s -w '\n%{http_code}' "$BASE/health")
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "GET /api/health" 200 "$STATUS" "$BODY"

# ── Purchase Orders ──────────────────────────────────────────

echo ""
echo "=== Purchase Orders ==="

# POST — create a liter order
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/purchase-orders" \
  -H "Content-Type: application/json" \
  -d '{"product_type":"liter","customer_name":"Test Co","quantity":500,"notes":"smoke test"}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/purchase-orders (liter)" 201 "$STATUS" "$BODY"
PO_ID=$(echo "$BODY" | jq -r '.id')
echo "        → created purchase order id=$PO_ID"

# POST — create a gallon order
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/purchase-orders" \
  -H "Content-Type: application/json" \
  -d '{"product_type":"gallon","customer_name":"Gallon Buyer","quantity":100}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/purchase-orders (gallon)" 201 "$STATUS" "$BODY"

# POST — validation: missing fields
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/purchase-orders" \
  -H "Content-Type: application/json" \
  -d '{"product_type":"liter"}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/purchase-orders (missing fields → 400)" 400 "$STATUS" "$BODY"

# POST — validation: bad product type
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/purchase-orders" \
  -H "Content-Type: application/json" \
  -d '{"product_type":"huge","customer_name":"X","quantity":1}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/purchase-orders (bad product_type → 400)" 400 "$STATUS" "$BODY"

# POST — validation: bad quantity
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/purchase-orders" \
  -H "Content-Type: application/json" \
  -d '{"product_type":"liter","customer_name":"X","quantity":-5}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/purchase-orders (negative qty → 400)" 400 "$STATUS" "$BODY"

# GET — list
BODY=$(curl -s -w '\n%{http_code}' "$BASE/purchase-orders")
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "GET /api/purchase-orders" 200 "$STATUS" "$BODY"
COUNT=$(echo "$BODY" | jq 'length')
echo "        → returned $COUNT order(s)"

# ── Supplies ─────────────────────────────────────────────────

echo ""
echo "=== Supplies ==="

# POST — create a supply
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/supplies" \
  -H "Content-Type: application/json" \
  -d "{\"material\":\"pet\",\"quantity\":50000,\"supplier_name\":\"Resin Corp\",\"tracking_number\":\"TRK-001\",\"eta\":\"$(date -u -v+3d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+3 days' '+%Y-%m-%dT%H:%M:%SZ')\"}")
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/supplies (pet)" 201 "$STATUS" "$BODY"
SUPPLY_ID=$(echo "$BODY" | jq -r '.id')
echo "        → created supply id=$SUPPLY_ID"

# POST — validation: missing fields
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/supplies" \
  -H "Content-Type: application/json" \
  -d '{"material":"pet"}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/supplies (missing fields → 400)" 400 "$STATUS" "$BODY"

# POST — validation: bad material
BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE/supplies" \
  -H "Content-Type: application/json" \
  -d '{"material":"gold","quantity":100,"supplier_name":"X","eta":"2025-01-01T00:00:00Z"}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "POST /api/supplies (bad material → 400)" 400 "$STATUS" "$BODY"

# GET — list
BODY=$(curl -s -w '\n%{http_code}' "$BASE/supplies")
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "GET /api/supplies" 200 "$STATUS" "$BODY"
COUNT=$(echo "$BODY" | jq 'length')
echo "        → returned $COUNT supply/supplies"

# PATCH — mark supply as received
BODY=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/supplies/$SUPPLY_ID" \
  -H "Content-Type: application/json" \
  -d '{"order_status":"received"}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "PATCH /api/supplies/$SUPPLY_ID (→ received)" 200 "$STATUS" "$BODY"
echo "        → order_status=$(echo "$BODY" | jq -r '.order_status')"

# PATCH — duplicate receive should fail
BODY=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/supplies/$SUPPLY_ID" \
  -H "Content-Type: application/json" \
  -d '{"order_status":"received"}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "PATCH /api/supplies/$SUPPLY_ID (already received → 400)" 400 "$STATUS" "$BODY"

# PATCH — bad status value
BODY=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/supplies/$SUPPLY_ID" \
  -H "Content-Type: application/json" \
  -d '{"order_status":"shipped"}')
STATUS=$(echo "$BODY" | tail -1)
BODY=$(echo "$BODY" | sed '$d')
check "PATCH /api/supplies/$SUPPLY_ID (bad status → 400)" 400 "$STATUS" "$BODY"

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "=============================="
echo "  $PASS passed, $FAIL failed"
echo "=============================="

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
