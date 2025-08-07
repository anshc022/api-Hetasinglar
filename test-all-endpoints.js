#!/usr/bin/env node

const axios = require('axios');

// Configuration
const BASE_URL = 'https://api-hetasinglar.onrender.com';
const TEST_TIMEOUT = 30000; // 30 seconds per request

// Test CORS with the actual frontend URL
const FRONTEND_URL = 'https://hetasinglar.vercel.app';

// Test credentials (you may need to update these)
const TEST_CREDENTIALS = {
  admin: {
    username: 'admin',
    password: 'admin123' // Update with actual admin password
  },
  agent: {
    username: 'agent1',
    password: 'password123' // Update with actual agent credentials
  }
};

// Create axios instance with default config
const api = axios.create({
  baseURL: BASE_URL,
  timeout: TEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Store authentication tokens
let tokens = {
  admin: null,
  agent: null
};

console.log('\n🧪 HETASINGLAR API ENDPOINT TESTING SUITE');
console.log('═'.repeat(60));
console.log(`🌐 Testing API: ${BASE_URL}`);
console.log(`⏰ Started at: ${new Date().toISOString()}`);
console.log(`⏱️  Timeout per request: ${TEST_TIMEOUT / 1000}s`);
console.log('═'.repeat(60));

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  details: []
};

// Utility function to add test result
function addTestResult(endpoint, method, status, message, responseTime = null) {
  testResults.total++;
  const result = {
    endpoint,
    method,
    status,
    message,
    responseTime,
    timestamp: new Date().toISOString()
  };
  
  if (status === 'PASS') {
    testResults.passed++;
    console.log(`✅ ${method} ${endpoint} - ${message} ${responseTime ? `(${responseTime}ms)` : ''}`);
  } else if (status === 'FAIL') {
    testResults.failed++;
    console.log(`❌ ${method} ${endpoint} - ${message}`);
  } else if (status === 'SKIP') {
    testResults.skipped++;
    console.log(`⏭️  ${method} ${endpoint} - ${message}`);
  }
  
  testResults.details.push(result);
}

// Test function wrapper
async function testEndpoint(method, endpoint, options = {}) {
  const startTime = Date.now();
  try {
    let response;
    
    switch (method.toUpperCase()) {
      case 'GET':
        response = await api.get(endpoint, options);
        break;
      case 'POST':
        response = await api.post(endpoint, options.data || {}, options);
        break;
      case 'PUT':
        response = await api.put(endpoint, options.data || {}, options);
        break;
      case 'DELETE':
        response = await api.delete(endpoint, options);
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
    
    const responseTime = Date.now() - startTime;
    addTestResult(endpoint, method, 'PASS', `Status: ${response.status}`, responseTime);
    return response;
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    if (error.response) {
      addTestResult(endpoint, method, 'FAIL', `HTTP ${error.response.status}: ${error.response.statusText}`, responseTime);
    } else if (error.code === 'ECONNABORTED') {
      addTestResult(endpoint, method, 'FAIL', 'Request timeout', responseTime);
    } else {
      addTestResult(endpoint, method, 'FAIL', error.message, responseTime);
    }
    
    return null;
  }
}

// Authentication function
async function authenticate(role) {
  console.log(`\n🔐 Authenticating as ${role}...`);
  
  try {
    const response = await testEndpoint('POST', '/api/auth/login', {
      data: TEST_CREDENTIALS[role]
    });
    
    if (response && response.data && response.data.token) {
      tokens[role] = response.data.token;
      api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      console.log(`✅ ${role} authentication successful`);
      return true;
    } else {
      console.log(`❌ ${role} authentication failed - no token received`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${role} authentication failed: ${error.message}`);
    return false;
  }
}

// Main testing function
async function runAllTests() {
  console.log('\n📋 TESTING ALL API ENDPOINTS');
  console.log('━'.repeat(50));
  
  // 1. Basic Health Checks
  console.log('\n🏥 HEALTH & STATUS ENDPOINTS');
  await testEndpoint('GET', '/api/health');
  await testEndpoint('GET', '/api/status');
  
  // 2. Authentication Endpoints
  console.log('\n🔐 AUTHENTICATION ENDPOINTS');
  await testEndpoint('POST', '/api/auth/login', {
    data: { username: 'invalid', password: 'invalid' }
  });
  
  // Try to authenticate as admin
  const adminAuth = await authenticate('admin');
  
  // 3. Admin Endpoints (requires authentication)
  console.log('\n👑 ADMIN ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/admin/dashboard');
    await testEndpoint('GET', '/api/admin/users');
    await testEndpoint('GET', '/api/admin/stats');
    await testEndpoint('GET', '/api/admin/settings');
  } else {
    addTestResult('/api/admin/*', 'GET', 'SKIP', 'Admin authentication failed');
  }
  
  // 4. Agent Endpoints
  console.log('\n👤 AGENT ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/agents');
    await testEndpoint('GET', '/api/agents/profile');
    await testEndpoint('GET', '/api/agents/earnings');
    await testEndpoint('GET', '/api/agents/stats');
  } else {
    addTestResult('/api/agents/*', 'GET', 'SKIP', 'Authentication required');
  }
  
  // 5. Chat Endpoints
  console.log('\n💬 CHAT ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/chats');
    await testEndpoint('GET', '/api/chats/active');
    await testEndpoint('GET', '/api/chats/queue');
  } else {
    addTestResult('/api/chats/*', 'GET', 'SKIP', 'Authentication required');
  }
  
  // 6. Subscription Endpoints
  console.log('\n💳 SUBSCRIPTION ENDPOINTS');
  await testEndpoint('GET', '/api/subscription/packages');
  if (adminAuth) {
    await testEndpoint('GET', '/api/subscription/stats');
  }
  
  // 7. Commission Endpoints
  console.log('\n💰 COMMISSION ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/commission/settings');
    await testEndpoint('GET', '/api/commission/rates');
    await testEndpoint('GET', '/api/commission/earnings');
  } else {
    addTestResult('/api/commission/*', 'GET', 'SKIP', 'Authentication required');
  }
  
  // 8. User Assignment Endpoints
  console.log('\n📋 USER ASSIGNMENT ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/user-assignment/queue');
    await testEndpoint('GET', '/api/user-assignment/stats');
  } else {
    addTestResult('/api/user-assignment/*', 'GET', 'SKIP', 'Authentication required');
  }
  
  // 9. Affiliate Endpoints
  console.log('\n🤝 AFFILIATE ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/affiliate/stats');
    await testEndpoint('GET', '/api/affiliate/referrals');
    await testEndpoint('GET', '/api/affiliate/earnings');
  } else {
    addTestResult('/api/affiliate/*', 'GET', 'SKIP', 'Authentication required');
  }
  
  // 10. Log Endpoints
  console.log('\n📄 LOG ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/logs');
    await testEndpoint('GET', '/api/logs/recent');
  } else {
    addTestResult('/api/logs/*', 'GET', 'SKIP', 'Authentication required');
  }
  
  // 11. First Contact Endpoints
  console.log('\n👋 FIRST CONTACT ENDPOINTS');
  if (adminAuth) {
    await testEndpoint('GET', '/api/first-contact/stats');
  } else {
    addTestResult('/api/first-contact/*', 'GET', 'SKIP', 'Authentication required');
  }
  
  // 12. Test some POST endpoints with sample data
  console.log('\n📝 POST ENDPOINT TESTS');
  if (adminAuth) {
    // Test creating sample data (these might fail if validation is strict)
    await testEndpoint('POST', '/api/agents', {
      data: {
        name: 'Test Agent',
        email: 'test@test.com',
        phone: '1234567890'
      }
    });
  }
  
  // 13. Test invalid endpoints
  console.log('\n❌ INVALID ENDPOINT TESTS');
  await testEndpoint('GET', '/api/nonexistent');
  await testEndpoint('GET', '/api/invalid/endpoint');
  await testEndpoint('POST', '/api/fake/route');
}

// Print final results
function printTestSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY REPORT');
  console.log('═'.repeat(60));
  console.log(`⏰ Completed at: ${new Date().toISOString()}`);
  console.log(`📋 Total tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  
  const successRate = testResults.total > 0 ? ((testResults.passed / testResults.total) * 100).toFixed(1) : 0;
  console.log(`📈 Success rate: ${successRate}%`);
  
  console.log('\n🎯 ENDPOINT STATUS BREAKDOWN:');
  console.log('━'.repeat(50));
  
  // Group results by endpoint category
  const categories = {
    'Health & Status': testResults.details.filter(r => r.endpoint.includes('health') || r.endpoint.includes('status')),
    'Authentication': testResults.details.filter(r => r.endpoint.includes('auth')),
    'Admin': testResults.details.filter(r => r.endpoint.includes('admin')),
    'Agents': testResults.details.filter(r => r.endpoint.includes('agents')),
    'Chats': testResults.details.filter(r => r.endpoint.includes('chats')),
    'Subscriptions': testResults.details.filter(r => r.endpoint.includes('subscription')),
    'Commission': testResults.details.filter(r => r.endpoint.includes('commission')),
    'Affiliate': testResults.details.filter(r => r.endpoint.includes('affiliate')),
    'Logs': testResults.details.filter(r => r.endpoint.includes('logs')),
    'First Contact': testResults.details.filter(r => r.endpoint.includes('first-contact')),
    'Other': testResults.details.filter(r => !r.endpoint.includes('health') && !r.endpoint.includes('status') && 
                                                !r.endpoint.includes('auth') && !r.endpoint.includes('admin') && 
                                                !r.endpoint.includes('agents') && !r.endpoint.includes('chats') && 
                                                !r.endpoint.includes('subscription') && !r.endpoint.includes('commission') && 
                                                !r.endpoint.includes('affiliate') && !r.endpoint.includes('logs') && 
                                                !r.endpoint.includes('first-contact'))
  };
  
  Object.entries(categories).forEach(([category, results]) => {
    if (results.length > 0) {
      const passed = results.filter(r => r.status === 'PASS').length;
      const failed = results.filter(r => r.status === 'FAIL').length;
      const skipped = results.filter(r => r.status === 'SKIP').length;
      
      console.log(`${category}: ${passed}✅ ${failed}❌ ${skipped}⏭️`);
    }
  });
  
  // Show failed tests details
  const failedTests = testResults.details.filter(r => r.status === 'FAIL');
  if (failedTests.length > 0) {
    console.log('\n❌ FAILED TESTS DETAILS:');
    console.log('━'.repeat(50));
    failedTests.forEach(test => {
      console.log(`${test.method} ${test.endpoint}: ${test.message}`);
    });
  }
  
  // Show recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('━'.repeat(50));
  
  if (testResults.failed === 0) {
    console.log('🎉 All accessible endpoints are working correctly!');
  } else {
    console.log('🔧 Some endpoints failed - check the details above');
    console.log('🔐 Many failures may be due to authentication requirements');
    console.log('📝 Update TEST_CREDENTIALS in the script with valid credentials');
  }
  
  if (testResults.skipped > 0) {
    console.log('⚠️  Some endpoints were skipped due to authentication failures');
    console.log('🔑 Provide valid admin/agent credentials to test protected endpoints');
  }
  
  console.log('\n🌐 DIRECT API ACCESS:');
  console.log(`   • Health Check: ${BASE_URL}/api/health`);
  console.log(`   • Status Check: ${BASE_URL}/api/status`);
  console.log(`   • Full API Base: ${BASE_URL}`);
  
  console.log('\n✨ API Testing Complete!');
  console.log('═'.repeat(60));
}

// Run the tests
async function main() {
  try {
    await runAllTests();
  } catch (error) {
    console.error('\n🚨 TEST SUITE ERROR');
    console.error('━'.repeat(30));
    console.error(`❌ ${error.message}`);
    console.error('━'.repeat(30));
  } finally {
    printTestSummary();
  }
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test suite interrupted by user');
  printTestSummary();
  process.exit(0);
});

// Start testing
main().catch(error => {
  console.error('\n🚨 FATAL ERROR');
  console.error('━'.repeat(30));
  console.error(`❌ ${error.message}`);
  console.error('━'.repeat(30));
  process.exit(1);
});
