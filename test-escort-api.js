const axios = require('axios');

async function testEscortAPI() {
  try {
    console.log('🧪 Testing escort profiles API...');
    
    // Test the escorts/active endpoint
    const response = await axios.get('http://localhost:5000/api/agents/escorts/active');
    
    if (response.data && response.data.length > 0) {
      console.log(`✅ Retrieved ${response.data.length} escort profiles`);
      
      // Check first profile for description field
      const firstProfile = response.data[0];
      console.log('\n📄 First profile data:');
      console.log(`  - Username: ${firstProfile.username}`);
      console.log(`  - First Name: ${firstProfile.firstName || 'N/A'}`);
      console.log(`  - Gender: ${firstProfile.gender || 'N/A'}`);
      console.log(`  - Country: ${firstProfile.country || 'N/A'}`);
      console.log(`  - Description: ${firstProfile.description ? 'Present ✅' : 'Missing ❌'}`);
      
      if (firstProfile.description) {
        console.log(`  - Description Preview: "${firstProfile.description.substring(0, 100)}..."`);
      }
      
      // Check all profiles for description field
      const profilesWithDescription = response.data.filter(profile => profile.description);
      console.log(`\n📊 Profiles with descriptions: ${profilesWithDescription.length}/${response.data.length}`);
      
    } else {
      console.log('❌ No escort profiles found');
    }
    
  } catch (error) {
    console.error('❌ Error testing escort API:', error.message);
    if (error.response) {
      console.error('📋 Response status:', error.response.status);
      console.error('📋 Response data:', error.response.data);
    }
  }
}

testEscortAPI();