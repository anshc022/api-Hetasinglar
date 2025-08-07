const agentAuth = require('./auth');
const Chat = require('./models/Chat');
const mongoose = require('mongoose');

async function testLiveQueueAPI() {
  try {
    console.log('🔍 TESTING LIVE QUEUE API');
    console.log('=========================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB\n');

    // Simulate the live queue API call
    console.log('📡 Simulating /agents/chats/live-queue API call...');
    
    const chats = await Chat.find({
      messages: { $exists: true, $ne: [] }
    })
    .sort({ updatedAt: -1 })
    .limit(10);

    console.log(`Found ${chats.length} chats`);

    // Format for frontend (like the API does)
    const formattedChats = chats.map(chat => ({
      _id: chat._id,
      customerId: chat.customerId,
      escortId: chat.escortId,
      agentId: chat.agentId,
      status: chat.status,
      messages: chat.messages,
      customerName: chat.customerName,
      lastCustomerResponse: chat.lastCustomerResponse,
      lastAgentResponse: chat.lastAgentResponse,
      requiresFollowUp: chat.requiresFollowUp,
      followUpDue: chat.followUpDue,
      reminderHandled: chat.reminderHandled,
      reminderHandledAt: chat.reminderHandledAt,
      reminderSnoozedUntil: chat.reminderSnoozedUntil,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      isUserActive: false
    }));

    console.log('\n📋 Sample formatted chats:');
    formattedChats.slice(0, 3).forEach((chat, index) => {
      console.log(`\nChat ${index + 1}:`);
      console.log(`  ID: ${chat._id}`);
      console.log(`  Messages: ${chat.messages?.length || 0}`);
      console.log(`  Reminder handled: ${chat.reminderHandled || 'false'}`);
      console.log(`  Reminder snoozed: ${chat.reminderSnoozedUntil || 'false'}`);
      
      if (chat.messages && chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        const hoursSince = Math.floor((new Date() - new Date(lastMessage.timestamp)) / (1000 * 60 * 60));
        console.log(`  Last message: ${lastMessage.sender} - "${lastMessage.message?.substring(0, 30)}..."`);
        console.log(`  Hours since: ${hoursSince}h`);
        console.log(`  Should remind: ${hoursSince >= 4 && lastMessage.sender === 'agent' && !chat.reminderHandled ? '✅ YES' : '❌ NO'}`);
      }
    });

    // Test the frontend filtering logic
    console.log('\n🔍 TESTING FRONTEND FILTERING LOGIC');
    console.log('===================================');
    
    const unansweredChats = formattedChats.filter(chat => {
      if (!chat.messages || chat.messages.length === 0) return false;
      
      // Skip if reminder is snoozed
      if (chat.reminderSnoozedUntil && new Date(chat.reminderSnoozedUntil) > new Date()) {
        return false;
      }
      
      // Skip if reminder was already handled
      if (chat.reminderHandled) {
        return false;
      }
      
      // Get the last message
      const lastMessage = chat.messages[chat.messages.length - 1];
      
      // Check if last message was from agent and customer hasn't replied for 4+ hours
      if (lastMessage.sender === 'agent') {
        const hoursSinceLastMessage = Math.floor((new Date() - new Date(lastMessage.timestamp)) / (1000 * 60 * 60));
        
        // Only show reminders if it's been 4+ hours since the last agent message
        // AND the message wasn't marked as a follow-up response
        return hoursSinceLastMessage >= 4 && !lastMessage.isFollowUpResponse;
      }
      
      return false;
    });

    console.log(`Found ${unansweredChats.length} chats matching frontend filter`);
    
    unansweredChats.slice(0, 5).forEach((chat, index) => {
      const lastMessage = chat.messages[chat.messages.length - 1];
      const hoursSince = Math.floor((new Date() - new Date(lastMessage.timestamp)) / (1000 * 60 * 60));
      console.log(`  ${index + 1}. Chat ${chat._id}: ${hoursSince}h since agent message`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n📊 MongoDB connection closed');
  }
}

testLiveQueueAPI();
