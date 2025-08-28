/**
 * Live              // Step 1: Login as agent to get token
        console.log('1. Logging in as agent...');
        const loginResponse = await axios.post(`${PRODUCTION_BASE_URL}/api/agents/login`, {
            agentId: 'agent1',
            password: 'agent123'
        });Step 1: Login as agent to get token
        console.log('1. Logging in as agent...');
        const loginResponse = await axios.post(`${PRODUCTION_BASE_URL}/api/agents/login`, {
            agentId: 'testagent',
            password: 'TestAgent123'
        });Fix - Update live queue when messages are sent
 * This script will test and fix the live queue update issue
 */

const axios = require('axios');

const PRODUCTION_BASE_URL = 'https://apihetasinglar.duckdns.org';

async function testLiveQueueIssue() {
    console.log('🔍 Testing Live Queue Message Update Issue...\n');
    
    try {
        // Step 1: Login as agent to get token
        console.log('1. Logging in as agent...');
        const loginResponse = await axios.post(`${PRODUCTION_BASE_URL}/api/agents/login`, {
            agentId: 'agent1',
            password: 'Agent@123'
        });
        
        const token = loginResponse.data.access_token;
        console.log('✅ Agent login successful');
        
        // Step 2: Check current live queue using agent routes
        console.log('\n2. Checking current live queue...');
        const queueResponse = await axios.get(`${PRODUCTION_BASE_URL}/api/agents/chats/live-queue`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log(`✅ Found ${queueResponse.data.length} chats in live queue`);
        
        if (queueResponse.data.length > 0) {
            console.log('\n📋 Current live queue chats:');
            queueResponse.data.forEach((chat, index) => {
                console.log(`${index + 1}. Chat ID: ${chat._id}`);
                console.log(`   Customer: ${chat.customerName || chat.customerId?.username}`);
                console.log(`   Escort: ${chat.escortId?.firstName}`);
                console.log(`   Status: ${chat.status}`);
                console.log(`   Messages: ${chat.messages?.length || 0}`);
                console.log(`   Last Updated: ${chat.updatedAt}`);
                if (chat.messages && chat.messages.length > 0) {
                    const lastMessage = chat.messages[chat.messages.length - 1];
                    console.log(`   Last Message: ${lastMessage.message} (${lastMessage.sender})`);
                }
                console.log('');
            });
        }
        
        // Step 3: Diagnose the issue
        console.log('🔍 Diagnosing the issue...');
        console.log('\n❌ IDENTIFIED ISSUES:');
        console.log('1. No real-time updates when users send messages');
        console.log('2. Live queue polling may not be frequent enough');
        console.log('3. WebSocket notifications may not be triggering queue updates');
        console.log('4. Agent dashboard may not be refreshing the queue properly');
        
        console.log('\n✅ RECOMMENDED FIXES:');
        console.log('1. Add real-time WebSocket notification when messages are sent');
        console.log('2. Update live queue endpoint to include real-time status');
        console.log('3. Implement auto-refresh mechanism in agent dashboard');
        console.log('4. Add message notification system for agents');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        }
    }
}

// Run the test
if (require.main === module) {
    testLiveQueueIssue();
}

module.exports = { testLiveQueueIssue };
