const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const reminderService = require('./services/reminderService');

async function testReminderFlow() {
  try {
    console.log('🔍 TESTING REMINDER FLOW');
    console.log('========================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB\n');

    // Find a sample chat that should have reminders
    const sampleChat = await Chat.findOne({
      messages: { $exists: true, $ne: [] }
    }).sort({ updatedAt: -1 });

    if (!sampleChat) {
      console.log('❌ No chats found');
      return;
    }

    console.log('📋 Testing with chat:', sampleChat._id);
    
    // Check current reminder state
    console.log('\n🔍 Current state:');
    console.log('reminderHandled:', sampleChat.reminderHandled);
    console.log('reminderHandledAt:', sampleChat.reminderHandledAt);
    console.log('reminderSnoozedUntil:', sampleChat.reminderSnoozedUntil);

    // Test 1: Create a reminder
    console.log('\n📝 TEST 1: Creating reminder...');
    await reminderService.createNewReminder(sampleChat._id.toString());
    
    let updatedChat = await Chat.findById(sampleChat._id);
    console.log('After creating reminder:');
    console.log('reminderHandled:', updatedChat.reminderHandled);
    console.log('reminderHandledAt:', updatedChat.reminderHandledAt);

    // Test 2: Handle follow-up action (agent sends message)
    console.log('\n🔄 TEST 2: Handling follow-up action...');
    await reminderService.handleFollowUpAction(sampleChat._id.toString());
    
    updatedChat = await Chat.findById(sampleChat._id);
    console.log('After follow-up action:');
    console.log('reminderHandled:', updatedChat.reminderHandled);
    console.log('reminderHandledAt:', updatedChat.reminderHandledAt);

    // Test 3: Handle customer response (customer sends message)
    console.log('\n💬 TEST 3: Handling customer response...');
    await reminderService.handleCustomerResponse(sampleChat._id.toString());
    
    updatedChat = await Chat.findById(sampleChat._id);
    console.log('After customer response:');
    console.log('reminderHandled:', updatedChat.reminderHandled);
    console.log('reminderHandledAt:', updatedChat.reminderHandledAt);

    // Test 4: Check if reminder would be recreated
    console.log('\n🔄 TEST 4: Checking reminder recreation...');
    await reminderService.checkAndCreateReminders();
    
    updatedChat = await Chat.findById(sampleChat._id);
    console.log('After reminder check:');
    console.log('reminderHandled:', updatedChat.reminderHandled);
    console.log('reminderHandledAt:', updatedChat.reminderHandledAt);

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n📊 MongoDB connection closed');
  }
}

testReminderFlow();
