const axios = require('axios');

async function testEscortAPIWithCacheBuster() {
  try {
    console.log('🧪 Testing escort profiles API with cache buster...');
    
    // Add timestamp to bypass cache
    const timestamp = Date.now();
    const response = await axios.get(`http://localhost:5000/api/agents/escorts/active?cacheBuster=${timestamp}`);
    
    if (response.data && response.data.length > 0) {
      console.log(`✅ Retrieved ${response.data.length} escort profiles`);
      
      // Check first profile for description field
      const firstProfile = response.data[0];
      console.log('\n📄 First profile data:');
      console.log(`  - Username: ${firstProfile.username}`);
      console.log(`  - First Name: ${firstProfile.firstName || 'N/A'}`);
      console.log(`  - Description: ${firstProfile.description ? 'Present ✅' : 'Missing ❌'}`);
      
      if (firstProfile.description) {
        console.log(`  - Description Preview: "${firstProfile.description.substring(0, 100)}..."`);
      }
      
      console.log(`  - All fields in response: ${Object.keys(firstProfile).join(', ')}`);
      
      // Check all profiles for description field
      const profilesWithDescription = response.data.filter(profile => profile.description);
      console.log(`\n📊 Profiles with descriptions: ${profilesWithDescription.length}/${response.data.length}`);
      
      // Show cache headers
      console.log('\n📋 Response headers:');
      console.log(`  - X-Cache: ${response.headers['x-cache'] || 'Not set'}`);
      console.log(`  - Content-Length: ${response.headers['content-length'] || 'Not set'}`);
      
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

testEscortAPIWithCacheBuster();