#!/bin/bash

echo "🧪 Production API Test Suite"
echo "============================"

BASE_URL="http://localhost:5000/api"
EXTERNAL_URL="https://apihetasinglar.duckdns.org/api"

echo "Testing both local and external endpoints..."
echo ""

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local method="$3"
    local data="$4"
    
    echo "🔍 Testing $name:"
    echo "   URL: $url"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -m 10 -w "\nHTTP_CODE:%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    else
        response=$(curl -s -m 10 -w "\nHTTP_CODE:%{http_code}" "$url" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    body=$(echo "$response" | grep -v "HTTP_CODE:")
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo "   ✅ Status: $http_code"
        echo "   📄 Response: $(echo "$body" | cut -c1-100)..."
    else
        echo "   ❌ Status: $http_code"
        echo "   📄 Response: $body"
    fi
    echo ""
}

# 1. Health Check
test_endpoint "Local Health" "$BASE_URL/health" "GET"
test_endpoint "External Health" "$EXTERNAL_URL/health" "GET"

# 2. Agent Login
login_data='{"agentId":"Dio123","password":"Dio123!"}'
test_endpoint "Local Agent Login" "$BASE_URL/agents/login" "POST" "$login_data"
test_endpoint "External Agent Login" "$EXTERNAL_URL/agents/login" "POST" "$login_data"

# 3. CORS Test
test_endpoint "Local CORS Test" "$BASE_URL/cors-test" "GET"
test_endpoint "External CORS Test" "$EXTERNAL_URL/cors-test" "GET"

echo "🏁 Test suite complete!"
echo ""
echo "📋 Summary:"
echo "- If local tests pass but external fail: Check nginx/proxy configuration"
echo "- If both fail: Server/database issues"
echo "- If login fails with 401: Check credentials"
echo "- If login fails with 500: Database connection issues"