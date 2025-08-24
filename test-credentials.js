const https = require('https');

function testEndpoint(path, description) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'apihetasinglar.duckdns.org',
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Origin': 'https://hetasinglar.vercel.app',
        'Content-Type': 'application/json'
      }
    };

    console.log(`\n🧪 Testing: ${description}`);
    console.log(`   URL: https://apihetasinglar.duckdns.org${path}`);

    const req = https.request(options, (res) => {
      console.log(`   Status: ${res.statusCode}`);
      console.log('   CORS Headers:');
      console.log(`     Access-Control-Allow-Origin: ${res.headers['access-control-allow-origin'] || 'MISSING'}`);
      console.log(`     Access-Control-Allow-Credentials: ${res.headers['access-control-allow-credentials'] || 'MISSING'}`);
      console.log(`     Access-Control-Allow-Methods: ${res.headers['access-control-allow-methods'] || 'MISSING'}`);
      
      // Check if suitable for credentialed requests
      const origin = res.headers['access-control-allow-origin'];
      const credentials = res.headers['access-control-allow-credentials'];
      const credentialsOk = origin === 'https://hetasinglar.vercel.app' && credentials === 'true';
      
      console.log(`   Credentials Support: ${credentialsOk ? '✅' : '❌'} ${credentialsOk ? 'OK' : 'FAIL - needs specific origin + credentials=true'}`);
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve());
    });

    req.on('error', (err) => {
      console.error(`   Error: ${err.message}`);
      resolve();
    });

    if (path.includes('login') || path.includes('check-username')) {
      req.write(JSON.stringify({ email: 'test@example.com', password: 'test', username: 'test' }));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('🚀 CORS Credentials Test');
  console.log('Frontend: https://hetasinglar.vercel.app');
  console.log('Backend: https://apihetasinglar.duckdns.org');
  
  await testEndpoint('/api/health', 'Health Check');
  await testEndpoint('/api/auth/check-username', 'Username Check (credentialed)');
  await testEndpoint('/api/agents/login', 'Agent Login (credentialed)');
  await testEndpoint('/api/admin/login', 'Admin Login (credentialed)');
  
  console.log('\n📋 Summary:');
  console.log('For credentialed requests (withCredentials: true), we need:');
  console.log('- Access-Control-Allow-Origin: https://hetasinglar.vercel.app (specific, not *)');
  console.log('- Access-Control-Allow-Credentials: true');
}

runTests();
