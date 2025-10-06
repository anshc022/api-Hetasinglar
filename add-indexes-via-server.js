// Quick script to add indexes via the running server
const axios = require('axios');

async function addIndexesViaServer() {
  try {
    console.log('🔧 Adding database indexes via server...');
    
    // Login as agent first
    const loginResponse = await axios.post('http://localhost:5000/api/agents/login', {
      agentId: 'Ansh',
      password: '111111'
    });
    
    const token = loginResponse.data.access_token;
    console.log('✅ Agent logged in successfully');
    
    // Make a request that will trigger index creation check
    const response = await axios.get('http://localhost:5000/api/agents/chats/live-queue', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Live queue request successful');
    console.log('💡 If this is the first run after optimization, indexes are being created in background');
    console.log('📊 Response time will improve after indexes are fully built');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addIndexesViaServer();