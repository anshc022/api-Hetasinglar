const axios = require('axios');

async function testCommissionSettings() {
  try {
    console.log('Testing commission settings endpoints...');
    
    // First, login as admin to get token
    const loginResponse = await axios.post('http://localhost:5000/api/admin/login', {
      adminId: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.access_token;
    console.log('✅ Admin login successful');
    
    // Test GET commission settings
    const getResponse = await axios.get('http://localhost:5000/api/admin/commission-settings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ GET commission settings:');
    console.log(JSON.stringify(getResponse.data, null, 2));
    
    // Test PUT commission settings
    const newSettings = {
      defaultAdminPercentage: 45,
      defaultAgentPercentage: 35,
      defaultAffiliatePercentage: 20
    };
    
    const putResponse = await axios.put('http://localhost:5000/api/admin/commission-settings', newSettings, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ PUT commission settings:');
    console.log(JSON.stringify(putResponse.data, null, 2));
    
    // Test invalid settings (should fail)
    try {
      const invalidSettings = {
        defaultAdminPercentage: 60,
        defaultAgentPercentage: 30,
        defaultAffiliatePercentage: 20
      };
      
      await axios.put('http://localhost:5000/api/admin/commission-settings', invalidSettings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('❌ This should have failed');
    } catch (error) {
      console.log('✅ Validation working - rejected invalid total:', error.response.data.error);
    }
    
  } catch (error) {
    console.error('❌ Error testing commission settings:', error.response?.data || error.message);
  }
}

testCommissionSettings();
