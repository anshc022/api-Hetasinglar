const axios = require('axios');

// Test the agent images API directly
const testAgentImagesAPI = async () => {
  const baseURL = 'http://localhost:5000'; // Adjust if different port
  
  try {
    console.log('🧪 Testing Agent Images API...\n');
    
    // Test without authentication (should fail)
    try {
      console.log('1. Testing without authentication...');
      const response = await axios.get(`${baseURL}/api/agents/images`);
      console.log('❌ Should have failed but got:', response.status);
    } catch (error) {
      console.log('✅ Correctly rejected without auth:', error.response?.status, error.response?.data?.message || error.message);
    }
    
    // Test with all available images (you'd need a real token here)
    console.log('\n2. Testing with escortProfileId parameter...');
    
    // We know from database there are images for escort profiles
    // Let's test with a known escort profile ID from the debug output
    const testEscortProfileIds = [
      // Add actual escort profile IDs from your debug output
      '668d02b6f5aa50b4c50a10dc', // Example, replace with actual IDs
    ];
    
    for (const escortId of testEscortProfileIds) {
      try {
        console.log(`Testing escortProfileId: ${escortId}`);
        const response = await axios.get(`${baseURL}/api/agents/images?escortProfileId=${escortId}`);
        console.log(`✅ Response: ${response.status}, Images: ${response.data?.images?.length || 0}`);
      } catch (error) {
        console.log(`❌ Error for ${escortId}:`, error.response?.status, error.response?.data?.message || error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testAgentImagesAPI();