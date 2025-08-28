/**
 * Test Live Queue Data Structure
 * Verify the enhanced live queue data is working correctly
 */

const axios = require('axios');

const LOCAL_BASE_URL = 'http://localhost:5000';

async function testLiveQueueData() {
    console.log('🔍 Testing Enhanced Live Queue Data...\n');
    
    try {
        // Login as agent
        const agentLoginResponse = await axios.post(`${LOCAL_BASE_URL}/api/agents/login`, {
            agentId: 'agent1',
            password: 'agent123'
        });
        
        const agentToken = agentLoginResponse.data.access_token;
        console.log('✅ Agent login successful');

        // Get live queue data
        const queueResponse = await axios.get(`${LOCAL_BASE_URL}/api/agents/chats/live-queue`, {
            headers: { 'Authorization': `Bearer ${agentToken}` }
        });
        
        console.log(`\n📊 Live Queue Analysis - ${queueResponse.data.length} chats found\n`);
        
        // Analyze the data structure
        queueResponse.data.slice(0, 5).forEach((chat, index) => {
            console.log(`📋 Chat ${index + 1}:`);
            console.log(`   ID: ${chat._id}`);
            console.log(`   Customer: ${chat.customerName || chat.customerId?.username || 'Unknown'}`);
            console.log(`   Escort: ${chat.escortId?.firstName || 'Unknown'}`);
            console.log(`   Status: ${chat.status}`);
            console.log(`   Total Messages: ${chat.messages?.length || 0}`);
            
            // Check if enhanced data exists
            if (chat.unreadCount !== undefined) {
                console.log(`   ✅ Unread Count: ${chat.unreadCount}`);
            } else {
                console.log(`   ❌ Unread Count: Missing`);
            }
            
            if (chat.priority !== undefined) {
                console.log(`   ✅ Priority: ${chat.priority}`);
            } else {
                console.log(`   ❌ Priority: Missing`);
            }
            
            if (chat.hasNewMessages !== undefined) {
                console.log(`   ✅ Has New Messages: ${chat.hasNewMessages}`);
            } else {
                console.log(`   ❌ Has New Messages: Missing`);
            }
            
            if (chat.lastMessage) {
                console.log(`   ✅ Last Message: "${chat.lastMessage.message}" (${chat.lastMessage.sender})`);
            } else {
                console.log(`   ❌ Last Message: Missing`);
            }
            
            console.log('');
        });

        // Check sorting by priority
        console.log('🎯 Priority Analysis:');
        const priorityGroups = {
            high: queueResponse.data.filter(chat => chat.priority === 'high').length,
            medium: queueResponse.data.filter(chat => chat.priority === 'medium').length,
            normal: queueResponse.data.filter(chat => chat.priority === 'normal').length
        };
        
        console.log(`   High Priority: ${priorityGroups.high} chats`);
        console.log(`   Medium Priority: ${priorityGroups.medium} chats`);
        console.log(`   Normal Priority: ${priorityGroups.normal} chats`);
        
        // Check unread message distribution
        console.log('\n📬 Unread Messages Analysis:');
        const unreadStats = {
            noUnread: queueResponse.data.filter(chat => chat.unreadCount === 0).length,
            lowUnread: queueResponse.data.filter(chat => chat.unreadCount > 0 && chat.unreadCount <= 5).length,
            highUnread: queueResponse.data.filter(chat => chat.unreadCount > 5).length
        };
        
        console.log(`   No unread messages: ${unreadStats.noUnread} chats`);
        console.log(`   1-5 unread messages: ${unreadStats.lowUnread} chats`);
        console.log(`   >5 unread messages: ${unreadStats.highUnread} chats`);
        
        // Show top priority chats
        const topChats = queueResponse.data.filter(chat => chat.unreadCount > 0).slice(0, 3);
        if (topChats.length > 0) {
            console.log('\n🚨 Top Priority Chats (with unread messages):');
            topChats.forEach((chat, index) => {
                console.log(`   ${index + 1}. ${chat.customerName} - ${chat.unreadCount} unread (${chat.priority})`);
            });
        } else {
            console.log('\n✅ No chats with unread messages found');
        }

        console.log('\n🎉 ENHANCED LIVE QUEUE TEST COMPLETE!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        }
    }
}

if (require.main === module) {
    testLiveQueueData();
}

module.exports = { testLiveQueueData };
