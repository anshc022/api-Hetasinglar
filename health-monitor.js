#!/usr/bin/env node

const axios = require('axios');

const SERVER_URL = 'http://localhost:5000';
const CHECK_INTERVAL = 10000; // 10 seconds

let isMonitoring = true;

console.log('\n🏥 HETASINGLAR API HEALTH MONITOR');
console.log('═'.repeat(50));
console.log(`🔍 Monitoring: ${SERVER_URL}`);
console.log(`⏱️  Check interval: ${CHECK_INTERVAL / 1000} seconds`);
console.log(`⏰ Started at: ${new Date().toISOString()}`);
console.log('═'.repeat(50));
console.log('Press Ctrl+C to stop monitoring\n');

async function checkServerHealth() {
  try {
    const startTime = Date.now();
    const response = await axios.get(`${SERVER_URL}/api/health`, {
      timeout: 5000
    });
    const responseTime = Date.now() - startTime;
    
    const timestamp = new Date().toISOString();
    const data = response.data;
    
    console.log('🟢 SERVER STATUS: HEALTHY');
    console.log('━'.repeat(40));
    console.log(`⏰ Check time: ${timestamp}`);
    console.log(`⚡ Response time: ${responseTime}ms`);
    console.log(`📊 Status: ${data.status}`);
    console.log(`⏱️  Uptime: ${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`);
    console.log(`🗄️  Database: ${data.services.database}`);
    console.log(`🔗 WebSocket clients: ${data.services.websocket}`);
    console.log(`💾 Memory: ${Math.round(data.memory.heapUsed / 1024 / 1024)}MB`);
    console.log(`🏷️  Version: ${data.version}`);
    console.log('━'.repeat(40));
    
  } catch (error) {
    const timestamp = new Date().toISOString();
    
    if (error.code === 'ECONNREFUSED') {
      console.log('🔴 SERVER STATUS: OFFLINE');
      console.log('━'.repeat(40));
      console.log(`⏰ Check time: ${timestamp}`);
      console.log(`❌ Error: Server is not running`);
      console.log(`🔍 URL: ${SERVER_URL}`);
      console.log('💡 Start the server with: npm start or node server.js');
      console.log('━'.repeat(40));
    } else if (error.code === 'ETIMEDOUT') {
      console.log('🟡 SERVER STATUS: TIMEOUT');
      console.log('━'.repeat(40));
      console.log(`⏰ Check time: ${timestamp}`);
      console.log(`⏱️  Error: Server response timeout (>5s)`);
      console.log(`🔍 URL: ${SERVER_URL}`);
      console.log('━'.repeat(40));
    } else {
      console.log('🟠 SERVER STATUS: ERROR');
      console.log('━'.repeat(40));
      console.log(`⏰ Check time: ${timestamp}`);
      console.log(`❌ Error: ${error.message}`);
      console.log(`🔍 URL: ${SERVER_URL}`);
      console.log('━'.repeat(40));
    }
  }
  console.log(''); // Add spacing
}

// Initial check
checkServerHealth();

// Set up monitoring interval
const monitorInterval = setInterval(() => {
  if (isMonitoring) {
    checkServerHealth();
  }
}, CHECK_INTERVAL);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 STOPPING HEALTH MONITOR');
  console.log('━'.repeat(30));
  console.log('👋 Health monitoring stopped');
  console.log(`⏰ Stopped at: ${new Date().toISOString()}\n`);
  
  isMonitoring = false;
  clearInterval(monitorInterval);
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n🚨 MONITOR ERROR');
  console.error('━'.repeat(30));
  console.error(`❌ ${error.message}`);
  console.error('━'.repeat(30));
});
