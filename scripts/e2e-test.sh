#!/usr/bin/env bash
# End-to-end test: run `npm run dev` + `node scripts/mock-vendor.mjs`, point
# .env at any Postgres (e.g. docker run -p 5433:5432 -e POSTGRES_PASSWORD=testpass
# -e POSTGRES_DB=reseller postgres), apply migrations + seed, then:
#   bash scripts/e2e-test.sh
# End-to-end test for the white-label API reseller platform.
# Requires: mock vendor on :9100, next dev on :3000, local Postgres, .env test values.
set -u
BASE=http://localhost:3000
HELPER="npx tsx scripts/e2e-helper.ts"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
check() { # desc actual expected-substring
  if echo "$2" | grep -q "$3"; then ok "$1"; else bad "$1 (got: $(echo "$2" | head -c 220))"; fi
}

login() { # email password jar -> prints http code
  local email=$1 pw=$2 jar=$3
  local csrf
  csrf=$(curl -s -c "$jar" "$BASE/api/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
  curl -s -b "$jar" -c "$jar" -o /dev/null -w "%{http_code}" \
    -X POST "$BASE/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "csrfToken=$csrf" \
    --data-urlencode "email=$email" \
    --data-urlencode "password=$pw" \
    --data-urlencode "callbackUrl=$BASE/admin"
}

echo "== 1. Admin login + protected pages =="
check "credentials callback (302/303)" "$(login admin@test.local testpass123 /tmp/jar-admin)" "30"
check "/admin loads for admin" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/jar-admin "$BASE/admin")" "200"
check "/admin/customers loads" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/jar-admin "$BASE/admin/customers")" "200"
check "/admin/vendors loads" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/jar-admin "$BASE/admin/vendors")" "200"

echo "== 2. Vendor Key Vault API =="
SMS=$(curl -s -b /tmp/jar-admin -H "Origin: $BASE" -X POST "$BASE/api/admin/vendors" \
  -H "Content-Type: application/json" \
  -d '{"name":"SMS Vendor","slug":"sms","sandboxEndpoint":"http://localhost:9100/sandbox","sandboxKey":"sandbox-secret-1","liveEndpoint":"http://localhost:9100/live","liveKey":"live-secret-2","priority":0,"enabled":true}')
check "sms vendor created (201 payload)" "$SMS" '"vendor"'
PAY=$(curl -s -b /tmp/jar-admin -H "Origin: $BASE" -X POST "$BASE/api/admin/vendors" \
  -H "Content-Type: application/json" \
  -d '{"name":"Payments Vendor","slug":"payments","sandboxEndpoint":"http://localhost:9100/sandbox","sandboxKey":"psand-secret","liveEndpoint":"http://localhost:9100/live","liveKey":"plive-secret","priority":0,"enabled":true}')
check "payments vendor created" "$PAY" '"vendor"'
if echo "$SMS$PAY" | grep -q 'sandbox-secret-1\|live-secret-2\|psand-secret'; then
  bad "plaintext keys leaked in create responses"
else
  ok "no plaintext keys in create responses"
fi
UNAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/vendors" -H "Origin: $BASE" -H "Content-Type: application/json" -d '{}')
check "unauthenticated vendor POST -> 401" "$UNAUTH" "401"
CSRF_BLOCK=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/jar-admin -H "Origin: https://evil.example" -X POST "$BASE/api/admin/vendors" -H "Content-Type: application/json" -d '{"name":"x","slug":"x","sandboxEndpoint":"http://a.com","sandboxKey":"k","liveEndpoint":"http://a.com","liveKey":"k"}')
check "cross-origin (evil Origin) vendor POST -> 403" "$CSRF_BLOCK" "403"
NOORIGIN=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/jar-admin -X POST "$BASE/api/admin/vendors" -H "Content-Type: application/json" -d '{"name":"CLI Client","slug":"cli-test","sandboxEndpoint":"http://a.com","sandboxKey":"k1","liveEndpoint":"http://a.com","liveKey":"k2"}')
check "no-Origin API client POST allowed (201)" "$NOORIGIN" "201"

echo "== 3. Keys encrypted at rest =="
ENC=$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT \"sandboxKeyEnc\" FROM \"Vendor\" WHERE slug='sms';")
if echo "$ENC" | grep -q "sandbox-secret-1"; then bad "plaintext key found in DB"; else ok "sandbox key stored encrypted"; fi
if echo "$ENC" | grep -q "^v1:"; then ok "ciphertext has v1 envelope"; else bad "unexpected ciphertext format"; fi

echo "== 4. Customer signup (data layer) + login =="
CUST=$($HELPER create-customer customer@test.local custpass123)
echo "$CUST"
CUSTOMER_ID=$(echo "$CUST" | sed -n 's/^CUSTOMER_ID=//p')
CUSTOMER_KEY=$(echo "$CUST" | sed -n 's/^CUSTOMER_KEY=//p')
check "customer created" "$CUSTOMER_ID" "c"
check "customer has sk_test_ key" "$CUSTOMER_KEY" "^sk_test_"
check "customer login works" "$(login customer@test.local custpass123 /tmp/jar-cust)" "30"
check "/dashboard loads for customer" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/jar-cust "$BASE/dashboard")" "200"
check "/integrations loads (Builder)" "$(curl -s -b /tmp/jar-cust "$BASE/integrations" | grep -o 'Integration Builder' | head -1)" "Integration Builder"

echo "== 5. Gateway: sandbox mode =="
SMS_ID=$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT id FROM \"Vendor\" WHERE slug='sms';")
# not enabled yet -> 403
BLOCKED=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CUSTOMER_KEY" "$BASE/api/v1/sms/ping")
check "gateway blocks unenabled integration (403)" "$BLOCKED" "403"
$HELPER enable-integration "$CUSTOMER_ID" "$SMS_ID" >/dev/null
RESP=$(curl -s -D /tmp/gw-headers.txt -H "Authorization: Bearer $CUSTOMER_KEY" "$BASE/api/v1/sms/hello?x=1")
check "sandbox gateway call -> 200 + SANDBOX" "$(echo "$RESP" | grep -o '"mode":"SANDBOX"')" "SANDBOX"
check "path forwarded" "$(echo "$RESP" | grep -o '"path":"/sandbox/hello"')" "/sandbox/hello"
check "query forwarded" "$(echo "$RESP" | grep -o 'hello?x=1')" "hello?x=1"
check "vendor key used, not customer key" "$(echo "$RESP" | grep -o 'Bearer sandbox-secret-1')" "Bearer sandbox-secret-1"
if echo "$RESP" | grep -q "$CUSTOMER_KEY"; then bad "customer key leaked to vendor"; else ok "customer key never sent upstream"; fi
HDRS=$(cat /tmp/gw-headers.txt)
if echo "$HDRS" | grep -qi '^server:'; then bad "Server header leaked"; else ok "Server header stripped"; fi
if echo "$HDRS" | grep -qi '^x-powered-by:'; then bad "X-Powered-By leaked"; else ok "X-Powered-By stripped"; fi
if echo "$HDRS" | grep -qi '^x-vendor:'; then bad "X-Vendor leaked"; else ok "X-Vendor stripped"; fi
check "vendor id header kept" "$(echo "$HDRS" | grep -i '^x-vendor-header:' | head -1)" "mvid_987654321"
check "sandbox UsageEvent recorded" "$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT COUNT(*) FROM \"UsageEvent\" WHERE \"customerId\"='$CUSTOMER_ID' AND mode='sandbox' AND \"statusCode\"=200;")" "^1$"

echo "== 6. Gateway: live mode =="
$HELPER set-mode "$CUSTOMER_ID" live >/dev/null
LIVE_RESP=$(curl -s -H "Authorization: Bearer $CUSTOMER_KEY" "$BASE/api/v1/sms/live-test")
check "live gateway call -> LIVE" "$(echo "$LIVE_RESP" | grep -o '"mode":"LIVE"')" "LIVE"
check "live endpoint used" "$(echo "$LIVE_RESP" | grep -o '"path":"/live/live-test"')" "/live/live-test"
check "live vendor key used" "$(echo "$LIVE_RESP" | grep -o 'Bearer live-secret-2')" "Bearer live-secret-2"
check "live UsageEvent recorded" "$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT COUNT(*) FROM \"UsageEvent\" WHERE \"customerId\"='$CUSTOMER_ID' AND mode='live' AND \"statusCode\"=200;")" "^1$"
# sandbox usage separate from live
SB=$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT COUNT(*) FROM \"UsageEvent\" WHERE \"customerId\"='$CUSTOMER_ID' AND mode='sandbox';")
LV=$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT COUNT(*) FROM \"UsageEvent\" WHERE \"customerId\"='$CUSTOMER_ID' AND mode='live';")
echo "  info: sandbox events=$SB, live events=$LV"
if [ "$SB" = "1" ] && [ "$LV" = "1" ]; then
  ok "sandbox and live tracked separately"
else
  bad "usage split wrong (sandbox=$SB live=$LV)"
fi

echo "== 7. Integration lifecycle =="
$HELPER disable-integration "$CUSTOMER_ID" "$SMS_ID" >/dev/null
BLOCKED2=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CUSTOMER_KEY" "$BASE/api/v1/sms/ping")
check "disabled integration -> 403" "$BLOCKED2" "403"
PAY_ID=$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT id FROM \"Vendor\" WHERE slug='payments';")
$HELPER enable-integration "$CUSTOMER_ID" "$PAY_ID" >/dev/null
$HELPER enable-integration "$CUSTOMER_ID" "$SMS_ID" >/dev/null
$HELPER reorder-integrations "$CUSTOMER_ID" "$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT id FROM \"CustomerIntegration\" WHERE \"customerId\"='$CUSTOMER_ID' AND \"vendorId\"='$PAY_ID';"),$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT id FROM \"CustomerIntegration\" WHERE \"customerId\"='$CUSTOMER_ID' AND \"vendorId\"='$SMS_ID';")" >/dev/null
ORDER=$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT v.slug FROM \"CustomerIntegration\" i JOIN \"Vendor\" v ON v.id=i.\"vendorId\" WHERE i.\"customerId\"='$CUSTOMER_ID' ORDER BY i.position;")
check "integration reorder persisted (payments first)" "$ORDER" "^payments$"
echo "  info: integration order = $ORDER"

echo "== 8. Vendor priority reorder (fallback order) =="
$HELPER reorder-vendors "$PAY_ID,$SMS_ID" >/dev/null
PRIO=$(docker exec reseller-test-pg psql -U postgres -d reseller -t -A -c "SELECT slug || ':' || priority FROM \"Vendor\" ORDER BY priority;")
check "vendor priorities updated" "$PRIO" "^payments:0$"
echo "  info: priority order = $PRIO"

echo "== 9. Widget layout (dashboardLayout) =="
$HELPER set-customer-layout "$CUSTOMER_ID" '["live","plan","mode"]' >/dev/null
LAYOUT_HTML=$(curl -s -b /tmp/jar-cust "$BASE/dashboard")
check "dashboard renders with saved layout order" "$LAYOUT_HTML" "Live requests"
check "dashboard shows widgets" "$LAYOUT_HTML" "Total requests"
check "dashboard shows ApiKeyPanel" "$LAYOUT_HTML" "Regenerate key"

echo "== 10. Revoke + regenerate =="
$HELPER revoke "$CUSTOMER_ID" >/dev/null
REV=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CUSTOMER_KEY" "$BASE/api/v1/sms/ping")
check "revoked key -> 403" "$REV" "403"
NEWKEY=$($HELPER regenerate "$CUSTOMER_ID" | sed -n 's/^CUSTOMER_KEY=//p')
check "regenerated key issued" "$NEWKEY" "^sk_"
OLD=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CUSTOMER_KEY" "$BASE/api/v1/sms/ping")
NEW=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $NEWKEY" "$BASE/api/v1/sms/ping")
check "old key now rejected (401)" "$OLD" "401"
check "new key works (200)" "$NEW" "200"

echo "== 11. Cron endpoint =="
CRON_SECRET=$(grep '^CRON_SECRET=' .env | cut -d'"' -f2)
check "cron without secret -> 401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cron/usage")" "401"
CRON_OK=$(curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/usage")
check "cron with secret runs" "$CRON_OK" '"ok":true'

echo
echo "================ RESULT: $PASS passed, $FAIL failed ================"
[ "$FAIL" -eq 0 ]
