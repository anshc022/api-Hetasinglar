const http = require('http');

// Simple script to clear the live queue cache
async function clearCache() {
  console.log('Clearing live queue cache...');
  
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/cache/clear',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Cache clear response:', res.statusCode, data);
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log('Cache clear request (this might fail without auth, that\'s ok):', err.message);
      resolve(); // Don't reject, it's ok if this fails
    });
    
    req.end();
  });
}

clearCache().then(() => {
  console.log('Cache clear attempt completed');
}).catch(console.error);
