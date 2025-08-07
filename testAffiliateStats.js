const axios = require('axios');

async function testAffiliateStats() {
  try {
    console.log('Testing /api/affiliate/stats endpoint...');
    
    // First, try to login as admin to get token
    const loginResponse = await axios.post('http://localhost:5000/api/admin/login', {
      adminId: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.access_token;
    console.log('✅ Admin login successful');
    
    // Test the affiliate stats endpoint
    const statsResponse = await axios.get('http://localhost:5000/api/affiliate/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Affiliate stats endpoint response:');
    console.log('Number of affiliates:', statsResponse.data.affiliates?.length || 0);
    console.log('Sample data:', JSON.stringify(statsResponse.data.affiliates[0], null, 2));
    
  } catch (error) {
    console.error('❌ Error testing affiliate stats:', error.response?.data || error.message);
  }
}

testAffiliateStats();
