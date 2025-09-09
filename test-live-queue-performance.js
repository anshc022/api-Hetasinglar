const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testLiveQueuePerformance() {
    console.log('🚀 Testing Live Queue Performance...\n');
    
    try {
        // First, login as agent to get token
        const loginResponse = await axios.post(`${BASE_URL}/api/agents/login`, {
            agentId: 'Ansh',
            password: '111111'
        });
        
        const token = loginResponse.data.access_token;
        console.log('✅ Agent login successful\n');
        
        // Test the optimized endpoint (/api/agents/chats/live-queue)
        console.log('🔍 Testing OPTIMIZED endpoint: /api/agents/chats/live-queue');
        const startOptimized = Date.now();
        
        const optimizedResponse = await axios.get(`${BASE_URL}/api/agents/chats/live-queue`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const optimizedTime = Date.now() - startOptimized;
        console.log(`✅ Optimized endpoint: ${optimizedTime}ms`);
        console.log(`   Returned: ${optimizedResponse.data.length} chats`);
        
        // Test the deprecated endpoint (/api/chats/live-queue) - if it exists
        console.log('\n🔍 Testing DEPRECATED endpoint: /api/chats/live-queue');
        const startDeprecated = Date.now();
        
        try {
            const deprecatedResponse = await axios.get(`${BASE_URL}/api/chats/live-queue`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const deprecatedTime = Date.now() - startDeprecated;
            console.log(`⚠️ Deprecated endpoint: ${deprecatedTime}ms`);
            console.log(`   Returned: ${deprecatedResponse.data.length} chats`);
            
            // Compare performance
            const difference = deprecatedTime - optimizedTime;
            console.log(`\n📊 Performance Comparison:`);
            console.log(`   Optimized:  ${optimizedTime}ms`);
            console.log(`   Deprecated: ${deprecatedTime}ms`);
            console.log(`   Difference: ${difference > 0 ? '+' : ''}${difference}ms`);
            
            if (deprecatedTime > 500) {
                console.log(`\n🚨 WARNING: Deprecated endpoint is slow (${deprecatedTime}ms)`);
                console.log(`   This could be the source of your slow request issue!`);
            }
            
        } catch (deprecatedError) {
            if (deprecatedError.response && deprecatedError.response.status === 404) {
                console.log('✅ Deprecated endpoint not found (good - it\'s been removed)');
            } else {
                console.log(`❌ Error testing deprecated endpoint: ${deprecatedError.message}`);
            }
        }
        
        // Test multiple rapid calls to optimized endpoint to check caching
        console.log('\n🔄 Testing caching with multiple rapid calls...');
        const cachingTimes = [];
        
        for (let i = 0; i < 5; i++) {
            const cacheStart = Date.now();
            await axios.get(`${BASE_URL}/api/agents/chats/live-queue`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const cacheTime = Date.now() - cacheStart;
            cachingTimes.push(cacheTime);
            console.log(`   Call ${i + 1}: ${cacheTime}ms`);
            
            // Small delay between calls
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const avgCacheTime = cachingTimes.reduce((a, b) => a + b, 0) / cachingTimes.length;
        console.log(`\n📈 Average cached response time: ${avgCacheTime.toFixed(1)}ms`);
        
        if (avgCacheTime < 100) {
            console.log('✅ Caching is working well!');
        } else {
            console.log('⚠️ Caching might need optimization');
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        }
    }
}

testLiveQueuePerformance();
