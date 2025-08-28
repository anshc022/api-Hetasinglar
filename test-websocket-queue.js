/**
 * Test WebSocket Live Queue Updates
 * Simulate user sending message and verify WebSocket notifications
 */

const WebSocket = require('ws');
const axios = require('axios');

const LOCAL_BASE_URL = 'http://localhost:5000';
const WS_URL = 'ws://localhost:5000';

async function testWebSocketLiveQueue() {
    console.log('🔍 Testing WebSocket Live Queue Updates...\n');
    
    try {
        // Step 1: Setup WebSocket connection as agent
        console.log('1. Setting up WebSocket connection as agent...');
        
        const ws = new WebSocket(WS_URL);
        
        let connectionReady = false;
        let messageReceived = false;
        
        ws.on('open', () => {
            console.log('✅ WebSocket connected');
            
            // Identify as agent (simulate agent login WebSocket handshake)
            ws.send(JSON.stringify({
                type: 'auth',
                role: 'agent',
                userId: 'test-agent-id'
            }));
            
            connectionReady = true;
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('\n📡 WebSocket Message Received:');
                console.log(JSON.stringify(message, null, 2));
                
                if (message.type === 'live_queue_update') {
                    console.log('✅ Live queue update notification received!');
                    messageReceived = true;
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });
        
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
        
        // Wait for connection
        await new Promise(resolve => {
            const checkConnection = () => {
                if (connectionReady) {
                    resolve();
                } else {
                    setTimeout(checkConnection, 100);
                }
            };
            checkConnection();
        });
        
        // Step 2: Simulate user sending a message
        console.log('\n2. Simulating user sending message...');
        
        // First, we need to find an existing chat or create one
        const adminLoginResponse = await axios.post(`${LOCAL_BASE_URL}/api/admin/login`, {
            adminId: 'admin',
            password: 'admin123'
        });
        
        const adminToken = adminLoginResponse.data.access_token;
        
        // Get existing chats
        const chatsResponse = await axios.get(`${LOCAL_BASE_URL}/api/chats`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (chatsResponse.data.length === 0) {
            console.log('❌ No existing chats found to test with');
            console.log('💡 Create a chat first through the frontend, then run this test');
            ws.close();
            return;
        }
        
        const testChat = chatsResponse.data[0];
        console.log(`📝 Using chat: ${testChat._id}`);
        
        // Step 3: Send a test message (simulating user)
        console.log('\n3. Sending test message...');
        
        // We need to simulate a user token. For testing, we'll use admin token
        // In real scenario, this would be a customer's user token
        const testMessage = {
            message: `Test message from WebSocket test - ${new Date().toISOString()}`,
            messageType: 'text'
        };
        
        try {
            const messageResponse = await axios.post(
                `${LOCAL_BASE_URL}/api/chats/${testChat._id}/message`,
                testMessage,
                {
                    headers: { 'Authorization': `Bearer ${adminToken}` }
                }
            );
            
            console.log('✅ Test message sent successfully');
            console.log(`   Message: "${testMessage.message}"`);
            
        } catch (error) {
            console.log('❌ Failed to send message:', error.response?.data?.message || error.message);
        }
        
        // Step 4: Wait for WebSocket notification
        console.log('\n4. Waiting for WebSocket notification...');
        
        await new Promise((resolve) => {
            setTimeout(() => {
                if (messageReceived) {
                    console.log('✅ WebSocket notification test PASSED!');
                } else {
                    console.log('⚠️ No WebSocket notification received');
                    console.log('   This could mean:');
                    console.log('   - WebSocket role identification needs adjustment');
                    console.log('   - Message was sent by admin (not customer)');
                    console.log('   - WebSocket notification logic needs debugging');
                }
                resolve();
            }, 3000); // Wait 3 seconds
        });
        
        ws.close();
        
        console.log('\n🎉 WebSocket Live Queue Test Complete!');
        console.log('\n📝 To test manually:');
        console.log('1. Open agent dashboard in browser');
        console.log('2. Open browser developer console');
        console.log('3. Send message from a user account');
        console.log('4. Check console for WebSocket messages');
        console.log('5. Verify live queue updates immediately');
        
    } catch (error) {
        console.error('\n❌ WebSocket test failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        }
    }
}

if (require.main === module) {
    testWebSocketLiveQueue();
}

module.exports = { testWebSocketLiveQueue };
