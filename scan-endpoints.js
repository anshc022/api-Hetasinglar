#!/usr/bin/env node

const axios = require('axios');

// Configuration
const BASE_URL = 'https://api-hetasinglar.onrender.com';
const TEST_TIMEOUT = 15000; // 15 seconds per request

console.log('\n🔍 HETASINGLAR API BASIC ENDPOINT SCANNER');
console.log('═'.repeat(60));
console.log(`🌐 Scanning API: ${BASE_URL}`);
console.log(`⏰ Started at: ${new Date().toISOString()}`);
console.log('═'.repeat(60));

// Test results
const results = [];

// Basic endpoint test function
async function quickTest(endpoint, method = 'GET') {
  const startTime = Date.now();
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      timeout: TEST_TIMEOUT,
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    const responseTime = Date.now() - startTime;
    const status = response.status;
    
    let statusIcon = '✅';
    let statusText = 'OK';
    
    if (status >= 400) {
      statusIcon = status === 401 || status === 403 ? '🔐' : '⚠️';
      statusText = status === 401 ? 'AUTH REQUIRED' : status === 403 ? 'FORBIDDEN' : 'CLIENT ERROR';
    }
    
    console.log(`${statusIcon} ${method.padEnd(4)} ${endpoint.padEnd(30)} ${status} ${statusText.padEnd(15)} ${responseTime}ms`);
    
    results.push({
      endpoint,
      method,
      status,
      responseTime,
      accessible: status < 400 || status === 401 || status === 403
    });
    
    return response;
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    if (error.code === 'ECONNABORTED') {
      console.log(`🟡 ${method.padEnd(4)} ${endpoint.padEnd(30)} TIMEOUT          ${responseTime}ms`);
    } else if (error.response) {
      console.log(`❌ ${method.padEnd(4)} ${endpoint.padEnd(30)} ${error.response.status} ERROR           ${responseTime}ms`);
    } else {
      console.log(`❌ ${method.padEnd(4)} ${endpoint.padEnd(30)} CONNECTION FAILED ${responseTime}ms`);
    }
    
    results.push({
      endpoint,
      method,
      status: error.response?.status || 'ERROR',
      responseTime,
      accessible: false,
      error: error.message
    });
    
    return null;
  }
}

// List of endpoints to test
const endpoints = [
  // Public endpoints
  { path: '/api/health', method: 'GET' },
  { path: '/api/status', method: 'GET' },
  
  // Authentication
  { path: '/api/auth/login', method: 'POST' },
  { path: '/api/auth/register', method: 'POST' },
  { path: '/api/auth/verify', method: 'GET' },
  
  // Admin endpoints
  { path: '/api/admin/dashboard', method: 'GET' },
  { path: '/api/admin/users', method: 'GET' },
  { path: '/api/admin/stats', method: 'GET' },
  { path: '/api/admin/settings', method: 'GET' },
  
  // Agent endpoints
  { path: '/api/agents', method: 'GET' },
  { path: '/api/agents/profile', method: 'GET' },
  { path: '/api/agents/earnings', method: 'GET' },
  { path: '/api/agents/stats', method: 'GET' },
  
  // Chat endpoints
  { path: '/api/chats', method: 'GET' },
  { path: '/api/chats/active', method: 'GET' },
  { path: '/api/chats/queue', method: 'GET' },
  { path: '/api/chats/history', method: 'GET' },
  
  // Subscription endpoints
  { path: '/api/subscription/packages', method: 'GET' },
  { path: '/api/subscription/stats', method: 'GET' },
  { path: '/api/subscription/purchase', method: 'POST' },
  
  // Commission endpoints
  { path: '/api/commission/settings', method: 'GET' },
  { path: '/api/commission/rates', method: 'GET' },
  { path: '/api/commission/earnings', method: 'GET' },
  
  // User assignment endpoints
  { path: '/api/user-assignment/queue', method: 'GET' },
  { path: '/api/user-assignment/stats', method: 'GET' },
  
  // Affiliate endpoints
  { path: '/api/affiliate/stats', method: 'GET' },
  { path: '/api/affiliate/referrals', method: 'GET' },
  { path: '/api/affiliate/earnings', method: 'GET' },
  
  // Log endpoints
  { path: '/api/logs', method: 'GET' },
  { path: '/api/logs/recent', method: 'GET' },
  
  // First contact endpoints
  { path: '/api/first-contact/stats', method: 'GET' },
  
  // Test some common invalid endpoints
  { path: '/api/nonexistent', method: 'GET' },
  { path: '/api/invalid', method: 'GET' },
];

async function runBasicScan() {
  console.log('\n📡 SCANNING ENDPOINTS...');
  console.log('━'.repeat(80));
  console.log('STATUS METHOD ENDPOINT                     CODE RESULT          TIME');
  console.log('━'.repeat(80));
  
  for (const endpoint of endpoints) {
    await quickTest(endpoint.path, endpoint.method);
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function printScanSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 API SCAN SUMMARY');
  console.log('═'.repeat(60));
  
  const totalEndpoints = results.length;
  const accessibleEndpoints = results.filter(r => r.accessible).length;
  const publicEndpoints = results.filter(r => r.status >= 200 && r.status < 400).length;
  const authRequiredEndpoints = results.filter(r => r.status === 401 || r.status === 403).length;
  const errorEndpointsCount = results.filter(r => !r.accessible && r.status !== 401 && r.status !== 403).length;
  
  console.log(`📋 Total endpoints tested: ${totalEndpoints}`);
  console.log(`✅ Accessible endpoints: ${accessibleEndpoints}`);
  console.log(`🟢 Public endpoints: ${publicEndpoints}`);
  console.log(`🔐 Auth-protected endpoints: ${authRequiredEndpoints}`);
  console.log(`❌ Error endpoints: ${errorEndpointsCount}`);
  
  // Calculate average response time for successful requests
  const successfulRequests = results.filter(r => r.responseTime && r.accessible);
  const avgResponseTime = successfulRequests.length > 0 
    ? Math.round(successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length)
    : 0;
  
  console.log(`⚡ Average response time: ${avgResponseTime}ms`);
  
  // Show working endpoints
  const workingEndpoints = results.filter(r => r.status >= 200 && r.status < 400);
  if (workingEndpoints.length > 0) {
    console.log('\n🟢 WORKING PUBLIC ENDPOINTS:');
    console.log('━'.repeat(50));
    workingEndpoints.forEach(ep => {
      console.log(`   ${ep.method} ${ep.endpoint} (${ep.responseTime}ms)`);
    });
  }
  
  // Show auth-protected endpoints
  const authEndpoints = results.filter(r => r.status === 401 || r.status === 403);
  if (authEndpoints.length > 0) {
    console.log('\n🔐 AUTHENTICATION-PROTECTED ENDPOINTS:');
    console.log('━'.repeat(50));
    authEndpoints.forEach(ep => {
      console.log(`   ${ep.method} ${ep.endpoint} (Auth Required)`);
    });
  }
  
  // Show error endpoints
  const errorEndpoints = results.filter(r => !r.accessible && r.status !== 401 && r.status !== 403);
  if (errorEndpoints.length > 0) {
    console.log('\n❌ PROBLEMATIC ENDPOINTS:');
    console.log('━'.repeat(50));
    errorEndpoints.forEach(ep => {
      console.log(`   ${ep.method} ${ep.endpoint} - ${ep.status} ${ep.error || ''}`);
    });
  }
  
  console.log('\n💡 NEXT STEPS:');
  console.log('━'.repeat(50));
  if (publicEndpoints > 0) {
    console.log('✅ Your API is responding and accessible');
  }
  if (authRequiredEndpoints > 0) {
    console.log('🔐 Many endpoints require authentication (this is normal)');
    console.log('🔑 Use the full test suite with credentials: npm run test-endpoints-full');
  }
  if (errorEndpointsCount > 0) {
    console.log('⚠️  Some endpoints have issues - check server logs');
  }
  
  console.log('\n🌐 DIRECT ACCESS URLS:');
  workingEndpoints.forEach(ep => {
    console.log(`   ${BASE_URL}${ep.endpoint}`);
  });
  
  console.log('\n✨ API Scan Complete!');
  console.log('═'.repeat(60));
}

// Main execution
async function main() {
  try {
    await runBasicScan();
  } catch (error) {
    console.error('\n🚨 SCAN ERROR');
    console.error('━'.repeat(30));
    console.error(`❌ ${error.message}`);
  } finally {
    printScanSummary();
  }
}

// Handle interruption
process.on('SIGINT', () => {
  console.log('\n\n🛑 Scan interrupted by user');
  printScanSummary();
  process.exit(0);
});

// Start scanning
main().catch(error => {
  console.error('\n🚨 FATAL ERROR');
  console.error('━'.repeat(30));
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
