const https = require('https');

function testCors() {
  const options = {
    hostname: 'apihetasinglar.duckdns.org',
    port: 443,
    path: '/api/health',
    method: 'GET',
    headers: {
      'Origin': 'https://hetasinglar.vercel.app'
    }
  };

  const req = https.request(options, (res) => {
    console.log('Status:', res.statusCode);
    console.log('CORS Headers:');
    console.log('  Access-Control-Allow-Origin:', res.headers['access-control-allow-origin']);
    console.log('  Access-Control-Allow-Credentials:', res.headers['access-control-allow-credentials']);
    
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Response length:', data.length);
    });
  });

  req.on('error', (err) => {
    console.error('Error:', err.message);
  });

  req.end();
}

testCors();
