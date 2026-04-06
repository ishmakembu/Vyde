#!/bin/bash
# API Endpoint Test Suite
# Run these commands to test each endpoint

BASE_URL="http://localhost:3000"
COOKIE_FILE="/tmp/vide_cookies.txt"

echo "========================================="
echo "VIDE API ENDPOINT TEST SUITE"
echo "========================================="
echo ""

# Step 1: Register a test user
echo "### TEST 1: Register User"
echo "POST $BASE_URL/api/auth/register"
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}' | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 2: Login to get session
echo "### TEST 2: Login (get session cookie)"
echo "POST $BASE_URL/api/auth/signin"
curl -s -c "$COOKIE_FILE" -X POST "$BASE_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}' | jq .
echo ""
echo "Cookie saved to: $COOKIE_FILE"
echo "-----------------------------------------"
echo ""

# Step 3: Test /api/users (GET - requires auth)
echo "### TEST 3: GET /api/users (requires auth)"
echo "GET $BASE_URL/api/users"
curl -s -b "$COOKIE_FILE" -X GET "$BASE_URL/api/users" | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 4: Test /api/profile (GET)
echo "### TEST 4: GET /api/profile"
curl -s -b "$COOKIE_FILE" -X GET "$BASE_URL/api/profile" | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 5: Test /api/profile (PUT - update status)
echo "### TEST 5: PUT /api/profile"
curl -s -b "$COOKIE_FILE" -X PUT "$BASE_URL/api/profile" \
  -H "Content-Type: application/json" \
  -d '{"status":"Testing from curl!","emoji":"🚀"}' | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 6: Test /api/friends (GET)
echo "### TEST 6: GET /api/friends"
curl -s -b "$COOKIE_FILE" -X GET "$BASE_URL/api/friends" | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 7: Test /api/friends (POST - add friend)
echo "### TEST 7: POST /api/friends (action=add)"
curl -s -b "$COOKIE_FILE" -X POST "$BASE_URL/api/friends" \
  -H "Content-Type: application/json" \
  -d '{"userId":"some-uuid","action":"add"}' | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 8: Test /api/calls (POST - create call session)
echo "### TEST 8: POST /api/calls"
curl -s -b "$COOKIE_FILE" -X POST "$BASE_URL/api/calls" \
  -H "Content-Type: application/json" \
  -d '{"calleeId":"some-uuid"}' | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 9: Test /api/calls/history (GET)
echo "### TEST 9: GET /api/calls/history"
curl -s -b "$COOKIE_FILE" -X GET "$BASE_URL/api/calls/history" | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 10: Test /api/messages (GET - requires callId)
echo "### TEST 10: GET /api/messages"
curl -s -b "$COOKIE_FILE" -X GET "$BASE_URL/api/messages?callId=test-call-123" | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 11: Test unauthorized access
echo "### TEST 11: GET /api/users (no auth - should fail)"
curl -s -X GET "$BASE_URL/api/users" | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 12: Test invalid body
echo "### TEST 12: POST /api/profile (invalid body)"
curl -s -b "$COOKIE_FILE" -X PUT "$BASE_URL/api/profile" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo ""
echo "-----------------------------------------"
echo ""

# Step 13: Test validation error
echo "### TEST 13: POST /api/calls (missing calleeId)"
curl -s -b "$COOKIE_FILE" -X POST "$BASE_URL/api/calls" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo ""
echo "-----------------------------------------"
echo ""

echo "========================================="
echo "TEST SUITE COMPLETE"
echo "========================================="

# Cleanup
rm -f "$COOKIE_FILE"