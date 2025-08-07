const axios = require('axios');

// Test the new Agent Earnings endpoints
async function testAgentEarningsEndpoints() {
  const baseURL = 'http://localhost:5000/api';
  const agentId = 'agent1'; // Using real agent ID from database
  
  // Real agent token - get from actual agent login
  const agentToken = 'real_jwt_token_here'; // Replace with actual token
  
  const headers = {
    'Authorization': `Bearer ${agentToken}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🧪 Testing Agent Earnings Endpoints...\n');

    // Test 1: Summary endpoint
    try {
      const summaryResponse = await axios.get(`${baseURL}/commission/earnings/agent/${agentId}/summary`, { headers });
      console.log('✅ Summary endpoint working:', summaryResponse.data);
    } catch (error) {
      console.log('❌ Summary endpoint error:', error.response?.data || error.message);
    }

    // Test 2: Trends endpoint
    try {
      const trendsResponse = await axios.get(`${baseURL}/commission/earnings/agent/${agentId}/trends`, {
        headers,
        params: {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          granularity: 'day'
        }
      });
      console.log('✅ Trends endpoint working:', trendsResponse.data);
    } catch (error) {
      console.log('❌ Trends endpoint error:', error.response?.data || error.message);
    }

    // Test 3: Chat earnings endpoint
    try {
      const chatResponse = await axios.get(`${baseURL}/commission/earnings/agent/${agentId}/chats`, {
        headers,
        params: { limit: 10 }
      });
      console.log('✅ Chat earnings endpoint working:', chatResponse.data);
    } catch (error) {
      console.log('❌ Chat earnings endpoint error:', error.response?.data || error.message);
    }

    // Test 4: Affiliate stats endpoint
    try {
      const affiliateResponse = await axios.get(`${baseURL}/affiliate/stats/agent/${agentId}`, { headers });
      console.log('✅ Affiliate stats endpoint working:', affiliateResponse.data);
    } catch (error) {
      console.log('❌ Affiliate stats endpoint error:', error.response?.data || error.message);
    }

    // Test 5: Withdrawal settings endpoint
    try {
      const withdrawalResponse = await axios.get(`${baseURL}/commission/withdrawal-settings/agent/${agentId}`, { headers });
      console.log('✅ Withdrawal settings endpoint working:', withdrawalResponse.data);
    } catch (error) {
      console.log('❌ Withdrawal settings endpoint error:', error.response?.data || error.message);
    }

    // Test 6: Payout history endpoint
    try {
      const payoutResponse = await axios.get(`${baseURL}/commission/payouts/agent/${agentId}`, { headers });
      console.log('✅ Payout history endpoint working:', payoutResponse.data);
    } catch (error) {
      console.log('❌ Payout history endpoint error:', error.response?.data || error.message);
    }

    console.log('\n🎉 Agent Earnings API testing completed!');

  } catch (error) {
    console.error('💥 Test setup error:', error.message);
  }
}

// Note: This test requires a running backend server and valid authentication
// For full testing, you would need to:
// 1. Start the backend server (node server.js)
// 2. Create a valid agent and get a real JWT token
// 3. Use a real agent ID from the database
// 4. Run this test: node testAgentEarningsAPI.js

if (require.main === module) {
  testAgentEarningsEndpoints();
}

module.exports = { testAgentEarningsEndpoints };
