/**
 * Local Testing Setup for Live Queue Fix
 * Test the live queue functionality locally before production deployment
 */

const axios = require('axios');

const LOCAL_BASE_URL = 'http://localhost:5000';

async function testLiveQueueLocally() {
    console.log('🔍 Testing Live Queue Fix Locally...\n');
    
    try {
        // Step 1: Check if local server is running
        console.log('1. Checking local server status...');
        try {
            const healthResponse = await axios.get(`${LOCAL_BASE_URL}/api/health`);
            console.log('✅ Local server is running');
            console.log(`   Environment: ${healthResponse.data.environment}`);
            console.log(`   Uptime: ${Math.round(healthResponse.data.uptime)} seconds`);
        } catch (error) {
            console.log('❌ Local server is not running');
            console.log('');
            console.log('🚀 TO START LOCAL SERVER:');
            console.log('1. Open terminal in backend/api-Hetasinglar/');
            console.log('2. Run: npm install');
            console.log('3. Run: node server.js');
            console.log('4. Server should start on http://localhost:5000');
            return;
        }

        // Step 2: Test admin login
        console.log('\n2. Testing admin login...');
        const adminLoginResponse = await axios.post(`${LOCAL_BASE_URL}/api/admin/login`, {
            adminId: 'admin',
            password: 'admin123'
        });
        
        const adminToken = adminLoginResponse.data.access_token;
        console.log('✅ Admin login successful');

        // Step 3: Test agent login
        console.log('\n3. Testing agent login...');
        let agentToken;
        try {
            const agentLoginResponse = await axios.post(`${LOCAL_BASE_URL}/api/agents/login`, {
                agentId: 'agent1',
                password: 'agent123'
            });
            agentToken = agentLoginResponse.data.access_token;
            console.log('✅ Agent login successful');
        } catch (error) {
            console.log('⚠️ Agent login failed, using admin token for testing');
            agentToken = adminToken;
        }

        // Step 4: Test live queue endpoint
        console.log('\n4. Testing live queue endpoint...');
        const queueResponse = await axios.get(`${LOCAL_BASE_URL}/api/agents/chats/live-queue`, {
            headers: { 'Authorization': `Bearer ${agentToken}` }
        });
        
        console.log(`✅ Live queue endpoint working - ${queueResponse.data.length} chats found`);
        
        if (queueResponse.data.length > 0) {
            console.log('\n📋 Sample chat data from live queue:');
            const sampleChat = queueResponse.data[0];
            console.log(`   Chat ID: ${sampleChat._id}`);
            console.log(`   Customer: ${sampleChat.customerName || 'Unknown'}`);
            console.log(`   Status: ${sampleChat.status}`);
            console.log(`   Messages: ${sampleChat.messages?.length || 0}`);
            console.log(`   Unread Count: ${sampleChat.unreadCount || 'Not calculated'}`);
            console.log(`   Priority: ${sampleChat.priority || 'Not set'}`);
            console.log(`   Has New Messages: ${sampleChat.hasNewMessages || 'Not set'}`);
            
            if (sampleChat.lastMessage) {
                console.log(`   Last Message: ${sampleChat.lastMessage.message} (${sampleChat.lastMessage.sender})`);
            }
        }

        // Step 5: Test WebSocket connection
        console.log('\n5. Testing WebSocket connection...');
        console.log('ℹ️ WebSocket testing requires browser or WebSocket client');
        console.log('   You can test this by:');
        console.log('   1. Open browser developer console');
        console.log('   2. Connect to: ws://localhost:5000');
        console.log('   3. Send test message and check if agents receive notifications');

        console.log('\n✅ LOCAL TESTING COMPLETE!');
        console.log('\n📝 NEXT STEPS FOR MANUAL TESTING:');
        console.log('');
        console.log('1. 🔐 LOGIN AS AGENT:');
        console.log('   - Go to your agent dashboard');
        console.log('   - Open live queue section');
        console.log('');
        console.log('2. 💬 SEND TEST MESSAGE:');
        console.log('   - Use a test user account');
        console.log('   - Send a message to an escort');
        console.log('');
        console.log('3. 👀 VERIFY LIVE QUEUE UPDATE:');
        console.log('   - Check if message appears in agent live queue immediately');
        console.log('   - Verify unread count increases');
        console.log('   - Check if chat moves to top (high priority)');
        console.log('');
        console.log('4. 🔔 CHECK WEBSOCKET NOTIFICATIONS:');
        console.log('   - Open browser developer console');
        console.log('   - Look for WebSocket messages when user sends message');
        console.log('');

    } catch (error) {
        console.error('\n❌ Local testing failed:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('');
            console.error('🚨 CONNECTION REFUSED - Local server is not running');
            console.error('');
            console.error('TO START LOCAL SERVER:');
            console.error('1. cd backend/api-Hetasinglar/');
            console.error('2. npm install');
            console.error('3. node server.js');
        } else if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        }
    }
}

// Instructions for setting up local environment
function showLocalSetupInstructions() {
    console.log('🛠️ LOCAL DEVELOPMENT SETUP INSTRUCTIONS');
    console.log('='.repeat(50));
    console.log('');
    console.log('1. 📁 NAVIGATE TO BACKEND DIRECTORY:');
    console.log('   cd "f:/vercal/Hetasinglar/backend/api-Hetasinglar"');
    console.log('');
    console.log('2. 📦 INSTALL DEPENDENCIES:');
    console.log('   npm install');
    console.log('');
    console.log('3. 🔧 SET UP ENVIRONMENT:');
    console.log('   - Copy .env.example to .env');
    console.log('   - Configure your local MongoDB URI');
    console.log('   - Set NODE_ENV=development');
    console.log('');
    console.log('4. 🚀 START SERVER:');
    console.log('   node server.js');
    console.log('');
    console.log('5. ✅ VERIFY SERVER:');
    console.log('   - Open http://localhost:5000/api/health');
    console.log('   - Should return {"status":"OK"}');
    console.log('');
    console.log('6. 🧪 RUN THIS TEST:');
    console.log('   node test-local-live-queue.js');
    console.log('');
}

// Run the test or show setup instructions
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--setup')) {
        showLocalSetupInstructions();
    } else {
        testLiveQueueLocally();
    }
}

module.exports = { testLiveQueueLocally, showLocalSetupInstructions };
