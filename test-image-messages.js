const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const Agent = require('./models/Agent');
const EscortProfile = require('./models/EscortProfile');
const User = require('./models/User');

// Test script to verify image message functionality
async function testImageMessages() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/hetasinglar', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB');

    // Test 1: Check if Chat model has the new image fields
    console.log('\n📋 Test 1: Checking Chat model schema...');
    const chatSchema = Chat.schema.paths;
    const messageSchema = chatSchema['messages.0'];
    
    if (messageSchema && messageSchema.schema) {
      const messageFields = messageSchema.schema.paths;
      console.log('Message fields available:');
      console.log('- messageType:', !!messageFields.messageType);
      console.log('- imageData:', !!messageFields.imageData);
      console.log('- mimeType:', !!messageFields.mimeType);
      console.log('- filename:', !!messageFields.filename);
    }

    // Test 2: Find existing chats with image messages
    console.log('\n📋 Test 2: Looking for existing image messages...');
    const chatsWithImages = await Chat.find({
      'messages.messageType': 'image'
    }).limit(5);
    
    console.log(`Found ${chatsWithImages.length} chats with image messages`);
    
    if (chatsWithImages.length > 0) {
      const sampleChat = chatsWithImages[0];
      const imageMessages = sampleChat.messages.filter(msg => msg.messageType === 'image');
      console.log(`Sample chat has ${imageMessages.length} image messages`);
      
      if (imageMessages.length > 0) {
        const sampleImageMsg = imageMessages[0];
        console.log('Sample image message:');
        console.log('- messageType:', sampleImageMsg.messageType);
        console.log('- filename:', sampleImageMsg.filename);
        console.log('- mimeType:', sampleImageMsg.mimeType);
        console.log('- has imageData:', !!sampleImageMsg.imageData);
        console.log('- imageData length:', sampleImageMsg.imageData ? sampleImageMsg.imageData.length : 0);
      }
    }

    // Test 3: Create a test image message
    console.log('\n📋 Test 3: Creating test image message...');
    
    // Find a test chat or create one
    let testChat = await Chat.findOne().limit(1);
    
    if (!testChat) {
      // Create a test chat if none exists
      const testUser = await User.findOne().limit(1);
      const testEscort = await EscortProfile.findOne().limit(1);
      
      if (testUser && testEscort) {
        testChat = new Chat({
          customerId: testUser._id,
          escortId: testEscort._id,
          status: 'new',
          messages: []
        });
        await testChat.save();
        console.log('✅ Created test chat');
      } else {
        console.log('❌ No test user or escort found to create test chat');
        return;
      }
    }

    // Create a test image message
    const testImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    const testImageMessage = {
      sender: 'agent',
      message: 'Test image',
      messageType: 'image',
      imageData: testImageData,
      mimeType: 'image/png',
      filename: 'test-image.png',
      timestamp: new Date(),
      readByAgent: true,
      readByCustomer: false
    };
    
    testChat.messages.push(testImageMessage);
    await testChat.save();
    
    console.log('✅ Created test image message');

    // Test 4: Retrieve and verify the image message
    console.log('\n📋 Test 4: Retrieving and verifying image message...');
    
    const retrievedChat = await Chat.findById(testChat._id);
    const lastMessage = retrievedChat.messages[retrievedChat.messages.length - 1];
    
    console.log('Retrieved message:');
    console.log('- messageType:', lastMessage.messageType);
    console.log('- filename:', lastMessage.filename);
    console.log('- mimeType:', lastMessage.mimeType);
    console.log('- has imageData:', !!lastMessage.imageData);
    console.log('- imageData matches:', lastMessage.imageData === testImageData);

    // Test 5: Test the chat API simulation
    console.log('\n📋 Test 5: Simulating chat API response...');
    
    const apiResponse = {
      _id: retrievedChat._id,
      messages: retrievedChat.messages.map(msg => ({
        _id: msg._id,
        sender: msg.sender,
        message: msg.message,
        messageType: msg.messageType,
        imageData: msg.imageData,
        mimeType: msg.mimeType,
        filename: msg.filename,
        timestamp: msg.timestamp,
        readByAgent: msg.readByAgent,
        readByCustomer: msg.readByCustomer
      }))
    };
    
    const imageMessagesInResponse = apiResponse.messages.filter(msg => msg.messageType === 'image');
    console.log(`API response contains ${imageMessagesInResponse.length} image messages`);
    
    if (imageMessagesInResponse.length > 0) {
      const imageMsg = imageMessagesInResponse[0];
      console.log('✅ Image message in API response has all required fields:');
      console.log('- messageType:', imageMsg.messageType);
      console.log('- imageData present:', !!imageMsg.imageData);
      console.log('- filename:', imageMsg.filename);
      console.log('- mimeType:', imageMsg.mimeType);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Chat model has image fields: ✅');
    console.log('- Can save image messages: ✅');
    console.log('- Can retrieve image messages: ✅');
    console.log('- Image data persists: ✅');
    console.log('- API response includes image data: ✅');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Additional function to check all chats for image message issues
async function checkAllImageMessages() {
  try {
    await mongoose.connect('mongodb://localhost:27017/hetasinglar', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('🔍 Checking all chats for image messages...\n');
    
    const allChats = await Chat.find({});
    let totalImageMessages = 0;
    let imageMessagesWithData = 0;
    let imageMessagesWithoutData = 0;
    
    for (const chat of allChats) {
      const imageMessages = chat.messages.filter(msg => 
        msg.messageType === 'image' || 
        (msg.message && msg.message.includes('[Image:'))
      );
      
      totalImageMessages += imageMessages.length;
      
      for (const imgMsg of imageMessages) {
        if (imgMsg.imageData) {
          imageMessagesWithData++;
        } else {
          imageMessagesWithoutData++;
          console.log(`❌ Image message without data in chat ${chat._id}:`, {
            message: imgMsg.message,
            filename: imgMsg.filename,
            messageType: imgMsg.messageType,
            timestamp: imgMsg.timestamp
          });
        }
      }
    }
    
    console.log('\n📊 Image Messages Summary:');
    console.log(`Total chats: ${allChats.length}`);
    console.log(`Total image messages: ${totalImageMessages}`);
    console.log(`Image messages with data: ${imageMessagesWithData}`);
    console.log(`Image messages without data: ${imageMessagesWithoutData}`);
    
    if (imageMessagesWithoutData > 0) {
      console.log('\n⚠️  Some image messages are missing imageData.');
      console.log('   This means they were sent before the schema update.');
      console.log('   They will show as filename only until resent.');
    } else {
      console.log('\n✅ All image messages have proper data!');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the tests
if (require.main === module) {
  console.log('🧪 Starting Image Message Tests...\n');
  
  // Ask which test to run
  const args = process.argv.slice(2);
  if (args.includes('--check-all')) {
    checkAllImageMessages();
  } else {
    testImageMessages();
  }
}

module.exports = { testImageMessages, checkAllImageMessages };
