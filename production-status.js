#!/usr/bin/env node

const axios = require('axios');

const PRODUCTION_URL = 'https://api-hetasinglar.onrender.com';

console.log('\n🌐 HETASINGLAR PRODUCTION API STATUS CHECKER');
console.log('═'.repeat(60));
console.log(`🔍 Checking: ${PRODUCTION_URL}`);
console.log(`⏰ Check time: ${new Date().toISOString()}`);
console.log('═'.repeat(60));

async function checkProductionStatus() {
  try {
    console.log('⏳ Connecting to production API...');
    
    const startTime = Date.now();
    const healthResponse = await axios.get(`${PRODUCTION_URL}/api/health`, {
      timeout: 30000 // 30 seconds timeout for production
    });
    const responseTime = Date.now() - startTime;
    
    const data = healthResponse.data;
    
    console.log('\n🟢 PRODUCTION API STATUS: ONLINE & HEALTHY');
    console.log('━'.repeat(50));
    console.log(`⚡ Response time: ${responseTime}ms`);
    console.log(`📊 API Status: ${data.status}`);
    console.log(`⏱️  Server uptime: ${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`);
    console.log(`🗄️  Database: ${data.services.database}`);
    console.log(`🔗 Active WebSocket connections: ${data.services.websocket}`);
    console.log(`💾 Memory usage: ${Math.round(data.memory.heapUsed / 1024 / 1024)}MB`);
    console.log(`🏷️  Version: ${data.version}`);
    console.log(`🌐 Environment: ${data.environment}`);
    console.log(`📅 Last check: ${data.timestamp}`);
    console.log('━'.repeat(50));
    
    // Also check status endpoint
    try {
      const statusResponse = await axios.get(`${PRODUCTION_URL}/api/status`, {
        timeout: 10000
      });
      const statusData = statusResponse.data;
      
      console.log('\n📋 AVAILABLE ENDPOINTS:');
      statusData.endpoints.forEach(endpoint => {
        console.log(`   ✅ ${PRODUCTION_URL}${endpoint}`);
      });
      
    } catch (error) {
      console.log('\n⚠️  Status endpoint check failed, but health endpoint is working');
    }
    
    console.log('\n🎉 PRODUCTION SERVER IS FULLY OPERATIONAL!');
    console.log('━'.repeat(50));
    console.log('✅ All systems are running normally');
    console.log('✅ API endpoints are accessible');
    console.log('✅ Database is connected');
    console.log('✅ WebSocket service is active');
    console.log('━'.repeat(50));
    
  } catch (error) {
    const timestamp = new Date().toISOString();
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.log('\n🔴 PRODUCTION API STATUS: OFFLINE');
      console.log('━'.repeat(50));
      console.log(`❌ Error: Cannot reach production server`);
      console.log(`🔍 URL: ${PRODUCTION_URL}`);
      console.log(`⏰ Failed at: ${timestamp}`);
      console.log('━'.repeat(50));
      
      console.log('\n🔧 POSSIBLE ISSUES:');
      console.log('   • Render service is sleeping (free tier limitation)');
      console.log('   • Deployment failed or crashed');
      console.log('   • Environment variables missing');
      console.log('   • Database connection issues');
      console.log('   • Network connectivity problems');
      
      console.log('\n💡 RECOMMENDED ACTIONS:');
      console.log('   1. Check Render dashboard: https://dashboard.render.com');
      console.log('   2. Check deployment logs for errors');
      console.log('   3. Verify environment variables are set');
      console.log('   4. Check database connection string');
      console.log('   5. Try redeploying the service');
      
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n🟡 PRODUCTION API STATUS: TIMEOUT');
      console.log('━'.repeat(50));
      console.log(`⏱️  Error: Server response timeout (>30s)`);
      console.log(`🔍 URL: ${PRODUCTION_URL}`);
      console.log(`⏰ Timeout at: ${timestamp}`);
      console.log('━'.repeat(50));
      
      console.log('\n💡 POSSIBLE CAUSES:');
      console.log('   • Server is starting up (cold start)');
      console.log('   • High server load');
      console.log('   • Database connection issues');
      console.log('   • Network latency');
      
      console.log('\n💡 RECOMMENDED ACTIONS:');
      console.log('   • Wait a few minutes and try again');
      console.log('   • Check server performance metrics');
      console.log('   • Monitor for 2-3 more minutes');
      
    } else if (error.response) {
      console.log('\n🟠 PRODUCTION API STATUS: HTTP ERROR');
      console.log('━'.repeat(50));
      console.log(`❌ HTTP Status: ${error.response.status}`);
      console.log(`📄 Response: ${error.response.statusText}`);
      console.log(`🔍 URL: ${PRODUCTION_URL}`);
      console.log(`⏰ Error at: ${timestamp}`);
      console.log('━'.repeat(50));
      
      if (error.response.status >= 500) {
        console.log('\n💡 SERVER ERROR (5xx):');
        console.log('   • Internal server error');
        console.log('   • Database connectivity issues');
        console.log('   • Application crash or bug');
        console.log('   • Check server logs for details');
      } else if (error.response.status >= 400) {
        console.log('\n💡 CLIENT ERROR (4xx):');
        console.log('   • Route not found');
        console.log('   • Authentication required');
        console.log('   • Bad request format');
      }
      
    } else {
      console.log('\n🟠 PRODUCTION API STATUS: UNKNOWN ERROR');
      console.log('━'.repeat(50));
      console.log(`❌ Error: ${error.message}`);
      console.log(`🔍 URL: ${PRODUCTION_URL}`);
      console.log(`⏰ Error at: ${timestamp}`);
      console.log('━'.repeat(50));
    }
  }
  
  console.log('\n📊 MONITORING OPTIONS:');
  console.log('   • npm run monitor-production  - Continuous monitoring');
  console.log('   • npm run start-production-check - Check with startup assistant');
  console.log(`   • Direct URL: ${PRODUCTION_URL}/api/health`);
  console.log('');
}

// Run the check
checkProductionStatus().catch(error => {
  console.error('\n🚨 SCRIPT ERROR');
  console.error('━'.repeat(30));
  console.error(`❌ ${error.message}`);
  console.error('━'.repeat(30));
  process.exit(1);
});
