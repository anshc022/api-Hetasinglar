#!/usr/bin/env node

/**
 * TEST: Single Chat Endpoint Performance
 * Tests the optimized GET /:chatId endpoint
 */

const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';
const SLOW_CHAT_ID = '68bd9ff3c680003e3eb0b655'; // From the logs

// Mock auth token - replace with actual token if auth is required
const AUTH_TOKEN = 'your-auth-token-here';

async function testSingleChatPerformance() {
    console.log('\n🔍 SINGLE CHAT ENDPOINT PERFORMANCE TEST');
    console.log('==========================================');
    
    const headers = {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
    };

    try {
        // Test 1: Cold cache (first request)
        console.log('\n📊 Test 1: Cold Cache Request');
        const start1 = Date.now();
        
        try {
            const response1 = await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}`, { headers });
            const time1 = Date.now() - start1;
            
            console.log(`⏱️  First request: ${time1}ms`);
            console.log(`📨 Total messages: ${response1.data.totalMessages || 'N/A'}`);
            console.log(`📑 Messages shown: ${response1.data.messagesShown || response1.data.messages?.length || 'N/A'}`);
            console.log(`📬 Unread count: ${response1.data.unreadCount || 'N/A'}`);
            
            if (time1 > 1000) {
                console.log('🚨 STILL SLOW! Optimization may not be working');
            } else if (time1 > 500) {
                console.log('⚠️  Moderate performance improvement');
            } else {
                console.log('✅ Good performance!');
            }
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('🔐 Authentication required - testing without auth token');
                // Retry without auth
                const response1 = await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}`);
                const time1 = Date.now() - start1;
                console.log(`⏱️  First request (no auth): ${time1}ms`);
            } else {
                throw error;
            }
        }

        // Test 2: Warm cache (immediate second request)
        console.log('\n📊 Test 2: Warm Cache Request');
        const start2 = Date.now();
        
        try {
            const response2 = await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}`, { headers });
            const time2 = Date.now() - start2;
            
            console.log(`⏱️  Cached request: ${time2}ms`);
            
            if (time2 < 50) {
                console.log('🚀 Excellent caching performance!');
            } else if (time2 < 200) {
                console.log('✅ Good caching performance');
            } else {
                console.log('⚠️  Cache might not be working properly');
            }
        } catch (error) {
            if (error.response?.status === 401) {
                const response2 = await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}`);
                const time2 = Date.now() - start2;
                console.log(`⏱️  Cached request (no auth): ${time2}ms`);
            } else {
                throw error;
            }
        }

        // Test 3: Multiple rapid requests (cache stress test)
        console.log('\n📊 Test 3: Cache Stress Test (5 rapid requests)');
        const rapidTimes = [];
        
        for (let i = 0; i < 5; i++) {
            const startRapid = Date.now();
            
            try {
                await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}`, { headers });
            } catch (error) {
                if (error.response?.status === 401) {
                    await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}`);
                } else {
                    throw error;
                }
            }
            
            const timeRapid = Date.now() - startRapid;
            rapidTimes.push(timeRapid);
            console.log(`   Request ${i + 1}: ${timeRapid}ms`);
        }
        
        const avgTime = Math.round(rapidTimes.reduce((a, b) => a + b, 0) / rapidTimes.length);
        console.log(`📊 Average cache response: ${avgTime}ms`);

        // Test 4: Full message history endpoint
        console.log('\n📊 Test 4: Full Message History Endpoint');
        const start4 = Date.now();
        
        try {
            const response4 = await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}/messages/full`, { headers });
            const time4 = Date.now() - start4;
            
            console.log(`⏱️  Full message history: ${time4}ms`);
            console.log(`📖 Total messages: ${response4.data.pagination?.totalMessages || 'N/A'}`);
            console.log(`📄 Current page messages: ${response4.data.messages?.length || 'N/A'}`);
            
        } catch (error) {
            if (error.response?.status === 401) {
                const response4 = await axios.get(`${API_BASE}/chats/${SLOW_CHAT_ID}/messages/full`);
                const time4 = Date.now() - start4;
                console.log(`⏱️  Full message history (no auth): ${time4}ms`);
            } else if (error.response?.status === 404) {
                console.log('❌ Chat not found or endpoint not available');
            } else {
                throw error;
            }
        }

        console.log('\n✅ PERFORMANCE TEST COMPLETE');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testSingleChatPerformance().catch(console.error);
