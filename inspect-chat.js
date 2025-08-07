const mongoose = require('mongoose');
const Chat = require('./models/Chat');

async function inspectChatStructure() {
  try {
    console.log('🔍 INSPECTING CHAT STRUCTURE');
    console.log('============================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB\n');

    // Get a sample chat to examine its structure
    const sampleChat = await Chat.findOne({
      messages: { $exists: true, $ne: [] }
    }).sort({ updatedAt: -1 });

    if (sampleChat) {
      console.log('📋 Sample Chat Structure:');
      console.log('========================');
      console.log('Chat ID:', sampleChat._id);
      console.log('Messages count:', sampleChat.messages.length);
      console.log('');

      // Examine message structure
      if (sampleChat.messages.length > 0) {
        console.log('Sample Messages:');
        sampleChat.messages.slice(-3).forEach((msg, index) => {
          console.log(`Message ${index + 1}:`);
          console.log('  Sender:', msg.sender);
          console.log('  Text:', msg.text || msg.message || msg.content || 'NO TEXT FIELD');
          console.log('  Timestamp:', msg.timestamp);
          console.log('  Full message object keys:', Object.keys(msg));
          console.log('  Full message:', JSON.stringify(msg, null, 2));
          console.log('');
        });
      }

      // Check reminder fields
      console.log('Reminder Fields:');
      console.log('===============');
      console.log('reminderHandled:', sampleChat.reminderHandled);
      console.log('reminderHandledAt:', sampleChat.reminderHandledAt);
      console.log('reminderSnoozedUntil:', sampleChat.reminderSnoozedUntil);
      console.log('');

      // Show full chat structure (limited)
      console.log('Full Chat Keys:', Object.keys(sampleChat.toObject()));
    }

  } catch (error) {
    console.error('❌ Inspection failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n📊 MongoDB connection closed');
  }
}

inspectChatStructure();
