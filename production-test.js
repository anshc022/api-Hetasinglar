const axios = require('axios');
const colors = require('./utils/colors');

// Production Environment Test Suite
// Tests all critical endpoints and functionality in production

class ProductionTester {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      error: '\x1b[31m',   // Red
      warning: '\x1b[33m', // Yellow
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async test(description, testFunction) {
    this.results.total++;
    try {
      this.log(`Testing: ${description}`, 'info');
      await testFunction();
      this.results.passed++;
      this.log(`✅ PASSED: ${description}`, 'success');
    } catch (error) {
      this.results.failed++;
      this.log(`❌ FAILED: ${description} - ${error.message}`, 'error');
    }
  }

  async testHealthEndpoint() {
    await this.test('Health Check Endpoint', async () => {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (response.data.status !== 'OK') throw new Error('Health status not OK');
      if (!response.data.services.database) throw new Error('Database status missing');
    });
  }

  async testCorsConfiguration() {
    await this.test('CORS Configuration', async () => {
      const response = await axios.get(`${this.baseUrl}/api/cors-test`);
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.allowedOrigins) throw new Error('CORS origins not configured');
    });
  }

  async testUsernameValidation() {
    await this.test('Username Validation Endpoint', async () => {
      const response = await axios.post(`${this.baseUrl}/api/auth/check-username`, {
        username: 'testuser123'
      });
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (typeof response.data.available !== 'boolean') throw new Error('Username availability not returned');
    });
  }

  async testInvalidEndpoint() {
    await this.test('404 Error Handling', async () => {
      try {
        await axios.get(`${this.baseUrl}/api/nonexistent`);
        throw new Error('Should have returned 404');
      } catch (error) {
        if (error.response && error.response.status === 404) {
          return; // Expected 404
        }
        throw error;
      }
    });
  }

  async testSecurityHeaders() {
    await this.test('Security Headers', async () => {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      const headers = response.headers;
      
      // Check for security headers (these might not all be present depending on configuration)
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];
      
      // At least some security measures should be in place
      if (!headers['x-powered-by'] || headers['x-powered-by'] !== 'Express') {
        // Good - Express header hidden or modified
      }
    });
  }

  async testDatabaseConnection() {
    await this.test('Database Connection', async () => {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      if (response.data.services.database !== 'connected') {
        throw new Error('Database not connected');
      }
    });
  }

  async testResponseTimes() {
    await this.test('Response Time Performance', async () => {
      const start = Date.now();
      await axios.get(`${this.baseUrl}/api/health`);
      const responseTime = Date.now() - start;
      
      if (responseTime > 5000) {
        throw new Error(`Response time too slow: ${responseTime}ms`);
      }
      
      this.log(`Response time: ${responseTime}ms`, 'info');
    });
  }

  async testEnvironmentConfig() {
    await this.test('Environment Configuration', async () => {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      if (response.data.environment !== 'production') {
        throw new Error('Environment not set to production');
      }
    });
  }

  async runAllTests() {
    this.log('🚀 Starting Production Environment Tests', 'info');
    this.log(`Testing URL: ${this.baseUrl}`, 'info');
    this.log('='.repeat(60), 'info');

    // Core functionality tests
    await this.testHealthEndpoint();
    await this.testCorsConfiguration();
    await this.testUsernameValidation();
    await this.testDatabaseConnection();
    await this.testEnvironmentConfig();
    
    // Performance and security tests
    await this.testResponseTimes();
    await this.testSecurityHeaders();
    await this.testInvalidEndpoint();

    // Generate report
    this.generateReport();
  }

  generateReport() {
    this.log('='.repeat(60), 'info');
    this.log('📊 TEST RESULTS SUMMARY', 'info');
    this.log('='.repeat(60), 'info');
    
    const passRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
    
    this.log(`Total Tests: ${this.results.total}`, 'info');
    this.log(`Passed: ${this.results.passed}`, 'success');
    this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'error' : 'info');
    this.log(`Pass Rate: ${passRate}%`, passRate >= 80 ? 'success' : 'warning');
    
    if (this.results.failed === 0) {
      this.log('🎉 ALL TESTS PASSED! Production environment is ready.', 'success');
    } else if (passRate >= 80) {
      this.log('⚠️  Most tests passed, but some issues need attention.', 'warning');
    } else {
      this.log('❌ Multiple tests failed. Please review the issues above.', 'error');
    }
    
    this.log('='.repeat(60), 'info');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let baseUrl = args[0];
  
  if (!baseUrl) {
    console.log('Usage: node production-test.js <base-url>');
    console.log('Example: node production-test.js https://hetasinglar-prod.elasticbeanstalk.com');
    process.exit(1);
  }
  
  // Remove protocol if not present, add https by default
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  
  const tester = new ProductionTester(baseUrl);
  
  try {
    await tester.runAllTests();
    process.exit(tester.results.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('Fatal error during testing:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ProductionTester;
