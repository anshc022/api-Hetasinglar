const http = require('http');

async function testLiveQueueAPI() {
  console.log('Testing live queue API...');
  
  // First, let's test without authentication to see if it returns anything
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/agents/chats/live-queue',
    method: 'GET',
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
        console.log('Status Code:', res.statusCode);
        console.log('Response Headers:', res.headers);
        
        try {
          const jsonData = JSON.parse(data);
          console.log('Response Data:', JSON.stringify(jsonData, null, 2));
          
          // Look for qauser_y56fw4 specifically
          if (Array.isArray(jsonData)) {
            const qaUserChat = jsonData.find(chat => 
              chat.customerId && chat.customerId.username === 'qauser_y56fw4'
            );
            if (qaUserChat) {
              console.log('\n🎯 FOUND qauser_y56fw4 in live queue:');
              console.log('Chat Type:', qaUserChat.chatType);
              console.log('Priority:', qaUserChat.priority);
              console.log('Unread Count:', qaUserChat.unreadCount);
              console.log('Hours Since Last Customer:', qaUserChat.hoursSinceLastCustomer);
              console.log('Full chat object:', JSON.stringify(qaUserChat, null, 2));
            } else {
              console.log('\n❌ qauser_y56fw4 NOT found in live queue response');
            }
          }
          
        } catch (e) {
          console.log('Raw response:', data);
        }
        
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });
    
    req.end();
  });
}

testLiveQueueAPI().catch(console.error);
