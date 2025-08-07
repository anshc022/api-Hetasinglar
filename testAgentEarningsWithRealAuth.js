const axios = require('axios');

// Test script for Agent Earnings with real authentication
const BASE_URL = 'http://localhost:5000';

let agentToken = null;

// Helper function to log responses
const logResponse = (endpoint, response) => {
  console.log(`\n=== ${endpoint} ===`);
  console.log('Status:', response.status);
  console.log('Data:', JSON.stringify(response.data, null, 2));
};

// Agent login
const loginAgent = async () => {
  try {
    const response = await axios.post(`${BASE_URL}/api/agents/login`, {
      agentId: 'agent1',
      password: 'agent123'
    });
    
    logResponse('Agent Login', response);
    
    if (response.data.access_token) {
      agentToken = response.data.access_token;
      console.log('\n✅ Agent login successful!');
      console.log('Token received:', agentToken.substring(0, 20) + '...');
      return true;
    } else {
      console.log('\n❌ Agent login failed');
      return false;
    }
  } catch (error) {
    console.error('\n❌ Login error:', error.response?.data || error.message);
    return false;
  }
};

// Test agent earnings endpoints
const testAgentEarnings = async () => {
  if (!agentToken) {
    console.log('❌ No agent token available');
    return;
  }

  const headers = {
    'Authorization': `Bearer ${agentToken}`,
    'Content-Type': 'application/json'
  };

  // Get agent ID from login response (we'll need this for the API calls)
  const agentId = '6801375e6ffd111f2af0456e'; // This was in the login response

  try {
    // Test earnings summary
    console.log('\n🧪 Testing earnings summary...');
    const summaryResponse = await axios.get(`${BASE_URL}/api/commission/earnings/agent/${agentId}/summary`, { headers });
    logResponse('Earnings Summary', summaryResponse);

    // Test earnings trend
    console.log('\n🧪 Testing earnings trend...');
    const trendResponse = await axios.get(`${BASE_URL}/api/commission/earnings/agent/${agentId}/trends?days=30`, { headers });
    logResponse('Earnings Trend', trendResponse);

    // Test chat earnings
    console.log('\n🧪 Testing chat earnings...');
    const chatResponse = await axios.get(`${BASE_URL}/api/commission/earnings/agent/${agentId}/chats?page=1&limit=10`, { headers });
    logResponse('Chat Earnings', chatResponse);

    // Test affiliate stats
    console.log('\n🧪 Testing affiliate stats...');
    const affiliateResponse = await axios.get(`${BASE_URL}/api/affiliate/stats/agent/${agentId}`, { headers });
    logResponse('Affiliate Stats', affiliateResponse);

    // Test withdraw request
    console.log('\n🧪 Testing withdraw request...');
    try {
      const withdrawResponse = await axios.post(`${BASE_URL}/api/commission/withdraw/agent/${agentId}`, {
        amount: 50.00,
        method: 'bank_transfer',
        accountDetails: {
          accountNumber: '1234567890',
          ifscCode: 'HDFC0001234',
          accountHolderName: 'Agent One'
        }
      }, { headers });
      logResponse('Withdraw Request', withdrawResponse);
    } catch (withdrawError) {
      console.log('\n⚠️ Withdraw request failed (expected if insufficient balance):');
      console.log(withdrawError.response?.data || withdrawError.message);
    }

    // Test payout history
    console.log('\n🧪 Testing payout history...');
    const payoutResponse = await axios.get(`${BASE_URL}/api/commission/payouts/agent/${agentId}?page=1&limit=10`, { headers });
    logResponse('Payout History', payoutResponse);

    // Test export earnings
    console.log('\n🧪 Testing export earnings...');
    const exportResponse = await axios.get(`${BASE_URL}/api/commission/earnings/agent/${agentId}/export?format=csv`, { headers });
    console.log('Export Status:', exportResponse.status);
    console.log('Export Headers:', exportResponse.headers['content-type']);

  } catch (error) {
    console.error('\n❌ API test error:', error.response?.data || error.message);
  }
};

// Main test function
const runTests = async () => {
  console.log('🚀 Starting Agent Earnings API Tests with Real Authentication');
  console.log('Agent Credentials: agentId=agent1, password=agent123\n');

  // Step 1: Login
  const loginSuccess = await loginAgent();
  if (!loginSuccess) {
    console.log('\n❌ Cannot proceed without successful login');
    return;
  }

  // Step 2: Test all earnings endpoints
  await testAgentEarnings();

  console.log('\n✅ All tests completed!');
  console.log('\nNext Steps:');
  console.log('1. Start the frontend with: npm start');
  console.log('2. Login as agent1 with password: agent123');
  console.log('3. Navigate to the Earnings section');
  console.log('4. Review UI/UX and test all features');
};

// Run the tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
});
