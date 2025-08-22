#!/usr/bin/env node

/**
 * CORS Testing Script
 * Tests CORS configuration for HetaSinglar API
 */

const https = require('https');
const http = require('http');

// Configuration
const FRONTEND_URL = 'https://hetasinglar.vercel.app';
const BACKEND_URL = 'https://apihetasinglar.duckdns.org';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestModule = url.startsWith('https') ? https : http;
    
    const req = requestModule.request(url, {
      method: options.method || 'GET',
      headers: {
        'Origin': FRONTEND_URL,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function testCORS() {
  log('\n🧪 CORS Testing Suite for HetaSinglar API', colors.cyan);
  log('=' .repeat(50), colors.cyan);
  log(`Frontend URL: ${FRONTEND_URL}`, colors.blue);
  log(`Backend URL: ${BACKEND_URL}`, colors.blue);
  log('=' .repeat(50), colors.cyan);

  const tests = [
    {
      name: 'Health Check',
      url: `${BACKEND_URL}/api/health`,
      method: 'GET'
    },
    {
      name: 'CORS Test Endpoint',
      url: `${BACKEND_URL}/api/cors-test`,
      method: 'GET'
    },
    {
      name: 'Username Check (OPTIONS Preflight)',
      url: `${BACKEND_URL}/api/auth/check-username`,
      method: 'OPTIONS'
    },
    {
      name: 'Username Check (POST)',
      url: `${BACKEND_URL}/api/auth/check-username`,
      method: 'POST',
      body: { username: 'testuser123' }
    },
    {
      name: 'Status Endpoint',
      url: `${BACKEND_URL}/api/status`,
      method: 'GET'
    }
  ];

  let passedTests = 0;
  let totalTests = tests.length;

  for (const test of tests) {
    try {
      log(`\n🔍 Testing: ${test.name}`, colors.yellow);
      log(`   Method: ${test.method}`, colors.magenta);
      log(`   URL: ${test.url}`, colors.magenta);

      const response = await makeRequest(test.url, {
        method: test.method,
        body: test.body
      });

      log(`   Status: ${response.statusCode}`, 
          response.statusCode < 300 ? colors.green : colors.red);

      // Check CORS headers
      const corsHeaders = {
        'access-control-allow-origin': response.headers['access-control-allow-origin'],
        'access-control-allow-credentials': response.headers['access-control-allow-credentials'],
        'access-control-allow-methods': response.headers['access-control-allow-methods'],
        'access-control-allow-headers': response.headers['access-control-allow-headers']
      };

      log(`   CORS Headers:`, colors.blue);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        if (value) {
          log(`     ${key}: ${value}`, colors.green);
        } else {
          log(`     ${key}: ❌ Missing`, colors.red);
        }
      });

      // Validate CORS
      const origin = corsHeaders['access-control-allow-origin'];
      let corsValid = true;
      let corsMessage = '';

      if (!origin) {
        corsValid = false;
        corsMessage = 'Missing Access-Control-Allow-Origin header';
      } else if (origin.includes(',')) {
        corsValid = false;
        corsMessage = `Multiple origins detected: ${origin}`;
      } else if (origin !== FRONTEND_URL && origin !== '*') {
        corsValid = false;
        corsMessage = `Origin mismatch: Expected ${FRONTEND_URL}, got ${origin}`;
      } else {
        corsMessage = 'CORS configuration valid';
      }

      log(`   CORS Status: ${corsValid ? '✅' : '❌'} ${corsMessage}`, 
          corsValid ? colors.green : colors.red);

      if (corsValid && response.statusCode < 400) {
        passedTests++;
        log(`   Result: ✅ PASS`, colors.green);
      } else {
        log(`   Result: ❌ FAIL`, colors.red);
      }

      // Show response data for some endpoints
      if (test.name.includes('Username Check (POST)') && response.data) {
        try {
          const jsonData = JSON.parse(response.data);
          log(`   Response: ${JSON.stringify(jsonData, null, 2)}`, colors.cyan);
        } catch (e) {
          log(`   Response: ${response.data.substring(0, 200)}`, colors.cyan);
        }
      }

    } catch (error) {
      log(`   Error: ${error.message}`, colors.red);
      log(`   Result: ❌ FAIL`, colors.red);
    }

    log('   ' + '-'.repeat(40), colors.cyan);
  }

  // Summary
  log(`\n📊 Test Summary`, colors.cyan);
  log('=' .repeat(30), colors.cyan);
  log(`Passed: ${passedTests}/${totalTests}`, 
      passedTests === totalTests ? colors.green : colors.yellow);
  log(`Success Rate: ${Math.round((passedTests/totalTests) * 100)}%`, 
      passedTests === totalTests ? colors.green : colors.yellow);

  if (passedTests === totalTests) {
    log(`\n🎉 All tests passed! CORS is configured correctly.`, colors.green);
  } else {
    log(`\n⚠️  Some tests failed. Check the CORS configuration.`, colors.red);
  }

  log('\n🔧 Troubleshooting Tips:', colors.yellow);
  log('1. Check environment variables (ALLOWED_ORIGINS)', colors.reset);
  log('2. Verify no duplicate CORS middleware', colors.reset);
  log('3. Check reverse proxy configurations', colors.reset);
  log('4. Ensure SSL certificates are valid', colors.reset);
}

// Additional function to test specific username checking
async function testUsernameChecking() {
  log('\n🔤 Username Checking Test', colors.cyan);
  log('=' .repeat(30), colors.cyan);

  const testUsernames = ['test', 'available_user_123', 'short', 'very_long_username_that_exceeds_limit'];

  for (const username of testUsernames) {
    try {
      log(`\nTesting username: "${username}"`, colors.yellow);
      
      const response = await makeRequest(`${BACKEND_URL}/api/auth/check-username`, {
        method: 'POST',
        body: { username }
      });

      log(`Status: ${response.statusCode}`, 
          response.statusCode === 200 ? colors.green : colors.red);

      if (response.data) {
        try {
          const result = JSON.parse(response.data);
          log(`Available: ${result.available ? '✅' : '❌'}`, 
              result.available ? colors.green : colors.red);
          log(`Message: ${result.message}`, colors.blue);
        } catch (e) {
          log(`Raw response: ${response.data}`, colors.cyan);
        }
      }

    } catch (error) {
      log(`Error testing "${username}": ${error.message}`, colors.red);
    }
  }
}

// Main execution
async function main() {
  try {
    await testCORS();
    await testUsernameChecking();
  } catch (error) {
    log(`\n❌ Script error: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { testCORS, testUsernameChecking };
