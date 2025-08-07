#!/usr/bin/env node

const { spawn } = require('child_process');
const axios = require('axios');

const SERVER_URL = 'http://localhost:5000';
const MAX_STARTUP_TIME = 30000; // 30 seconds

console.log('\n🚀 HETASINGLAR BACKEND STARTUP ASSISTANT');
console.log('═'.repeat(60));
console.log(`⏰ Started at: ${new Date().toISOString()}`);
console.log('═'.repeat(60));

// Function to check if server is already running
async function checkIfServerRunning() {
  try {
    const response = await axios.get(`${SERVER_URL}/api/health`, { timeout: 3000 });
    return true;
  } catch (error) {
    return false;
  }
}

// Function to wait for server to start
async function waitForServer() {
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_STARTUP_TIME) {
    try {
      const response = await axios.get(`${SERVER_URL}/api/health`, { timeout: 2000 });
      if (response.data.status === 'OK') {
        return true;
      }
    } catch (error) {
      // Server not ready yet, continue waiting
    }
    
    // Wait 1 second before next check
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return false;
}

async function main() {
  // Check if server is already running
  console.log('🔍 Checking if server is already running...');
  
  if (await checkIfServerRunning()) {
    console.log('✅ Server is already running!');
    console.log('━'.repeat(40));
    
    try {
      const response = await axios.get(`${SERVER_URL}/api/health`);
      const data = response.data;
      
      console.log('🟢 CURRENT SERVER STATUS:');
      console.log(`📍 URL: ${SERVER_URL}`);
      console.log(`📊 Status: ${data.status}`);
      console.log(`⏱️  Uptime: ${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`);
      console.log(`🗄️  Database: ${data.services.database}`);
      console.log(`🔗 WebSocket clients: ${data.services.websocket}`);
      console.log(`🏷️  Version: ${data.version}`);
      console.log('━'.repeat(40));
      console.log('💡 Use "npm run monitor" to continuously monitor server health');
      
    } catch (error) {
      console.log('⚠️  Server is running but health check failed');
    }
    
    console.log('');
    return;
  }
  
  // Start the server
  console.log('🚀 Starting HetaSinglar Backend Server...');
  console.log('━'.repeat(40));
  
  const serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  serverProcess.on('error', (error) => {
    console.error('🔴 Failed to start server:', error.message);
    process.exit(1);
  });
  
  // Wait for server to be ready
  console.log('⏳ Waiting for server to start...');
  
  const serverReady = await waitForServer();
  
  if (serverReady) {
    console.log('\n🎉 SERVER STARTUP COMPLETE!');
    console.log('═'.repeat(50));
    
    try {
      const response = await axios.get(`${SERVER_URL}/api/health`);
      const data = response.data;
      
      console.log('🟢 SERVER READY AND HEALTHY');
      console.log(`📍 Server URL: ${SERVER_URL}`);
      console.log(`📊 Status: ${data.status}`);
      console.log(`🗄️  Database: ${data.services.database}`);
      console.log(`🔗 WebSocket: Active`);
      console.log(`🏷️  Version: ${data.version}`);
      console.log('═'.repeat(50));
      console.log('✅ All systems operational - Backend ready for connections!');
      
    } catch (error) {
      console.log('⚠️  Server started but health check details unavailable');
    }
    
  } else {
    console.log('\n🟡 SERVER STARTUP TIMEOUT');
    console.log('━'.repeat(40));
    console.log('⚠️  Server is taking longer than expected to start');
    console.log('💡 Check the server logs for any issues');
    console.log('🔍 You can manually check: ' + SERVER_URL + '/api/health');
  }
  
  console.log('\n💡 HELPFUL COMMANDS:');
  console.log('   • npm run monitor  - Monitor server health');
  console.log('   • npm start        - Start server normally');
  console.log('   • npm run dev      - Start with auto-restart');
  console.log('');
  
  // Keep process alive to maintain server
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down startup assistant...');
    serverProcess.kill('SIGTERM');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('\n🚨 STARTUP ERROR');
  console.error('━'.repeat(30));
  console.error(`❌ ${error.message}`);
  console.error('━'.repeat(30));
  process.exit(1);
});
