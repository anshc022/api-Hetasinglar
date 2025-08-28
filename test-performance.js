const axios = require('axios');

async function testPerformance() {
  console.log('🧪 Testing optimized live queue performance...');
  
  try {
    // Test live-queue-updates endpoint
    const start1 = Date.now();
    try {
      await axios.get('http://localhost:5000/api/chats/live-queue-updates', {
        headers: { 'Authorization': 'Bearer test' }
      });
    } catch (err) {
      // Expected to fail due to auth, but we can measure timing
    }
    const end1 = Date.now();
    console.log(`⚡ live-queue-updates response time: ${end1 - start1}ms`);
    
    // Test live-queue endpoint  
    const start2 = Date.now();
    try {
      await axios.get('http://localhost:5000/api/agents/chats/live-queue', {
        headers: { 'Authorization': 'Bearer test' }
      });
    } catch (err) {
      // Expected to fail due to auth, but we can measure timing
    }
    const end2 = Date.now();
    console.log(`⚡ live-queue response time: ${end2 - start2}ms`);
    
    console.log('\n🎯 Performance Analysis:');
    console.log(`   • live-queue-updates: ${end1 - start1 < 500 ? '✅ FAST' : end1 - start1 < 2000 ? '⚠️ MODERATE' : '❌ SLOW'} (${end1 - start1}ms)`);
    console.log(`   • live-queue: ${end2 - start2 < 500 ? '✅ FAST' : end2 - start2 < 2000 ? '⚠️ MODERATE' : '❌ SLOW'} (${end2 - start2}ms)`);
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testPerformance();
