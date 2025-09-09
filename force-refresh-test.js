// Test to force refresh live queue and clear cache
const axios = require('axios');

async function forceRefreshLiveQueue() {
    try {
        console.log('=== Testing Agent Authentication & Live Queue ===');
        
        // Step 1: Login as agent
        console.log('Step 1: Logging in as agent Ansh...');
        const loginResponse = await axios.post('http://localhost:5000/api/agents/login', {
            agentId: 'Ansh',
            password: '111111'
        });
        
        if (loginResponse.data.access_token) {
            console.log('✅ Agent login successful');
            const token = loginResponse.data.access_token;
            
            // Step 2: Get live queue data with authentication
            console.log('Step 2: Fetching live queue data...');
            const response = await axios.get('http://localhost:5000/api/agents/chats/live-queue', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = response.data;
            console.log('✅ Live queue API response:');
            console.log('- Total chats:', data.length);
            
            const reminderChats = data.filter(chat => chat.chatType === 'reminder');
            console.log('- Reminder chats:', reminderChats.length);
            
            if (reminderChats.length > 0) {
                console.log('\n📋 Reminder chat details:');
                reminderChats.slice(0, 10).forEach((chat, index) => {
                    console.log(`  ${index + 1}. ID: ${chat._id}`);
                    console.log(`     Customer: ${chat.customerName || chat.customerId?.username || 'N/A'}`);
                    console.log(`     reminderActive: ${chat.reminderActive}`);
                    console.log(`     reminderHandled: ${chat.reminderHandled}`);
                    console.log(`     chatType: ${chat.chatType}`);
                    console.log(`     unreadCount: ${chat.unreadCount || 0}`);
                    console.log('     ---');
                });
            } else {
                console.log('✅ No reminder chats found - this is correct if reminders have been handled!');
            }
            
        } else {
            console.log('❌ Agent login failed:', loginResponse.data.message);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data?.message || error.message);
    }
}

forceRefreshLiveQueue();
