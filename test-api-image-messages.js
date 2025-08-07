const axios = require('axios');

// Simple test to verify image message API
async function testImageMessageAPI() {
  const BASE_URL = 'http://localhost:3001'; // Adjust port if needed
  
  try {
    console.log('🧪 Testing Image Message API...\n');
    
    // You'll need to replace these with actual values from your database
    const TEST_CHAT_ID = 'REPLACE_WITH_ACTUAL_CHAT_ID';
    const TEST_AGENT_TOKEN = 'REPLACE_WITH_ACTUAL_AGENT_TOKEN';
    
    // Sample base64 image (1x1 transparent PNG)
    const testImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    console.log('📤 Sending test image message...');
    
    const response = await axios.post(
      `${BASE_URL}/api/chats/${TEST_CHAT_ID}/message`,
      {
        message: 'Test image message',
        messageType: 'image',
        imageData: testImageData,
        mimeType: 'image/png',
        filename: 'test-image.png'
      },
      {
        headers: {
          'Authorization': `Bearer ${TEST_AGENT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Image message sent successfully!');
    console.log('Response:', response.data);
    
    // Test retrieving the chat to see if image data persists
    console.log('\n📥 Retrieving chat to verify image data...');
    
    const chatResponse = await axios.get(
      `${BASE_URL}/api/chats/${TEST_CHAT_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_AGENT_TOKEN}`
        }
      }
    );
    
    const imageMessages = chatResponse.data.messages.filter(msg => msg.messageType === 'image');
    console.log(`Found ${imageMessages.length} image messages in chat`);
    
    if (imageMessages.length > 0) {
      const lastImageMsg = imageMessages[imageMessages.length - 1];
      console.log('✅ Last image message data:');
      console.log('- messageType:', lastImageMsg.messageType);
      console.log('- filename:', lastImageMsg.filename);
      console.log('- mimeType:', lastImageMsg.mimeType);
      console.log('- has imageData:', !!lastImageMsg.imageData);
      console.log('- imageData length:', lastImageMsg.imageData ? lastImageMsg.imageData.length : 0);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 Tips:');
      console.log('1. Make sure you have a valid agent token');
      console.log('2. Replace TEST_AGENT_TOKEN with an actual token');
      console.log('3. Replace TEST_CHAT_ID with an actual chat ID');
    }
  }
}

// Test function to check a specific chat for image messages
async function checkChatImageMessages(chatId, token) {
  const BASE_URL = 'http://localhost:3001';
  
  try {
    console.log(`🔍 Checking chat ${chatId} for image messages...\n`);
    
    const response = await axios.get(
      `${BASE_URL}/api/chats/${chatId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const chat = response.data;
    const allMessages = chat.messages || [];
    const imageMessages = allMessages.filter(msg => 
      msg.messageType === 'image' || 
      (msg.message && msg.message.includes('[Image:'))
    );
    
    console.log(`📊 Chat Analysis:`);
    console.log(`- Total messages: ${allMessages.length}`);
    console.log(`- Image messages: ${imageMessages.length}`);
    
    imageMessages.forEach((msg, index) => {
      console.log(`\n📷 Image Message ${index + 1}:`);
      console.log(`- Message: ${msg.message}`);
      console.log(`- Type: ${msg.messageType || 'undefined'}`);
      console.log(`- Filename: ${msg.filename || 'undefined'}`);
      console.log(`- MIME Type: ${msg.mimeType || 'undefined'}`);
      console.log(`- Has imageData: ${!!msg.imageData}`);
      console.log(`- Timestamp: ${msg.timestamp}`);
      console.log(`- Sender: ${msg.sender}`);
    });
    
    return imageMessages;
    
  } catch (error) {
    console.error('❌ Failed to check chat:', error.response?.data || error.message);
    return [];
  }
}

// Helper function to get agent token (you'll need to implement this)
async function getAgentToken(agentId, password) {
  const BASE_URL = 'http://localhost:3001';
  
  try {
    const response = await axios.post(`${BASE_URL}/api/agents/login`, {
      agentId,
      password
    });
    
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Failed to get agent token:', error.response?.data || error.message);
    return null;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Image Message Tests...\n');
  
  const args = process.argv.slice(2);
  
  if (args.includes('--check-chat')) {
    const chatId = args[args.indexOf('--check-chat') + 1];
    const token = args[args.indexOf('--token') + 1];
    
    if (!chatId || !token) {
      console.log('❌ Usage: node test-image-messages.js --check-chat CHAT_ID --token TOKEN');
      return;
    }
    
    await checkChatImageMessages(chatId, token);
  } else if (args.includes('--login')) {
    const agentId = args[args.indexOf('--login') + 1];
    const password = args[args.indexOf('--password') + 1];
    
    if (!agentId || !password) {
      console.log('❌ Usage: node test-image-messages.js --login AGENT_ID --password PASSWORD');
      return;
    }
    
    const token = await getAgentToken(agentId, password);
    if (token) {
      console.log('✅ Agent token:', token);
      console.log('\n💡 Use this token with --check-chat or --send-test');
    }
  } else {
    console.log('📋 Available commands:');
    console.log('');
    console.log('1. Get agent token:');
    console.log('   node test-image-messages.js --login AGENT_ID --password PASSWORD');
    console.log('');
    console.log('2. Check chat for image messages:');
    console.log('   node test-image-messages.js --check-chat CHAT_ID --token TOKEN');
    console.log('');
    console.log('3. Send test image message:');
    console.log('   node test-image-messages.js --send-test CHAT_ID --token TOKEN');
    console.log('');
    console.log('💡 Run the database test first:');
    console.log('   node test-image-messages.js');
  }
}

// Run tests
if (require.main === module) {
  runTests();
}

module.exports = { 
  testImageMessageAPI, 
  checkChatImageMessages, 
  getAgentToken 
};
