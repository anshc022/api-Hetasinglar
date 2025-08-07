#!/usr/bin/env node

const { spawn } = require('child_process');
const axios = require('axios');

// Configuration
const ENVIRONMENTS = {
  local: 'http://localhost:5000',
  production: 'https://api-hetasinglar.onrender.com'
};

// Get environment from command line argument or default to local
const environment = process.argv[2] || 'local';
const SERVER_URL = ENVIRONMENTS[environment];

if (!SERVER_URL) {
  console.log('❌ Invalid environment. Use: local or production');
  console.log('Example: npm run start-with-alerts production');
  process.exit(1);
}

const MAX_STARTUP_TIME = 30000; // 30 seconds

console.log('\n🚀 HETASINGLAR BACKEND STARTUP ASSISTANT');
console.log('═'.repeat(60));
console.log(`🌐 Environment: ${environment.toUpperCase()}`);
console.log(`🔍 Target URL: ${SERVER_URL}`);
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
  console.log(`🔍 Checking if ${environment} server is already running...`);
  
  if (await checkIfServerRunning()) {
    console.log(`✅ ${environment.toUpperCase()} server is already running!`);
    console.log('━'.repeat(40));
    
    try {
      const response = await axios.get(`${SERVER_URL}/api/health`);
      const data = response.data;
      
      console.log(`🟢 CURRENT ${environment.toUpperCase()} SERVER STATUS:`);
      console.log(`📍 URL: ${SERVER_URL}`);
      console.log(`📊 Status: ${data.status}`);
      console.log(`⏱️  Uptime: ${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`);
      console.log(`🗄️  Database: ${data.services.database}`);
      console.log(`🔗 WebSocket clients: ${data.services.websocket}`);
      console.log(`🏷️  Version: ${data.version}`);
      console.log(`🌐 Environment: ${data.environment}`);
      console.log('━'.repeat(40));
      console.log(`💡 Use "npm run monitor ${environment}" to continuously monitor server health`);
      
    } catch (error) {
      console.log('⚠️  Server is running but health check failed');
    }
    
    console.log('');
    return;
  }
  
  // For production, we can't start the server locally, just show status
  if (environment === 'production') {
    console.log('🔴 PRODUCTION SERVER NOT RESPONDING');
    console.log('━'.repeat(40));
    console.log('⚠️  Production server is not accessible');
    console.log(`🔍 URL: ${SERVER_URL}`);
    console.log('💡 Check your Render deployment at: https://dashboard.render.com');
    console.log('💡 Possible issues:');
    console.log('   • Deployment failed or crashed');
    console.log('   • Environment variables not set');
    console.log('   • Database connection issues');
    console.log('   • Service sleeping (free tier)');
    console.log('━'.repeat(40));
    console.log(`💡 Monitor production status: npm run monitor production`);
    console.log('');
    return;
  }
  
  // Start the server (only for local environment)
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
