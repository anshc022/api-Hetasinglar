const reminderService = require('./services/reminderService');
const mongoose = require('mongoose');
const Chat = require('./models/Chat');

async function debugReminders() {
  try {
    console.log('🔍 DEBUG: Checking Reminder System Status');
    console.log('=========================================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB\n');

    // Check total chats
    const totalChats = await Chat.countDocuments();
    console.log(`📊 Total chats in database: ${totalChats}`);

    // Check recent chats with messages
    const recentChats = await Chat.find({
      messages: { $exists: true, $ne: [] }
    })
    .sort({ updatedAt: -1 })
    .limit(10);

    console.log(`📋 Found ${recentChats.length} recent chats with messages:\n`);

    recentChats.forEach((chat, index) => {
      if (chat.messages && chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        const hoursSince = Math.floor((new Date() - new Date(lastMessage.timestamp)) / (1000 * 60 * 60));
        
        console.log(`Chat ${index + 1}:`);
        console.log(`  ID: ${chat._id}`);
        console.log(`  Last message: ${lastMessage.sender} - "${lastMessage.text?.substring(0, 50)}..."`);
        console.log(`  Hours since: ${hoursSince}h`);
        console.log(`  Should remind: ${hoursSince >= 4 && lastMessage.sender === 'agent' ? '✅ YES' : '❌ NO'}`);
        console.log(`  Reminder handled: ${chat.reminderHandled || 'false'}`);
        console.log(`  Reminder snoozed: ${chat.reminderSnoozedUntil || 'false'}`);
        console.log('');
      }
    });

    // Check reminder service stats
    console.log('📈 Reminder Service Statistics:');
    console.log('==============================');
    
    const stats = await reminderService.getStats();
    console.log(`Total chats: ${stats.totalChats || 0}`);
    console.log(`Chats needing reminders: ${stats.chatsNeedingReminders || 0}`);
    console.log(`Handled reminders: ${stats.handledReminders || 0}`);
    console.log(`Snoozed reminders: ${stats.snoozedReminders || 0}`);

    // Test reminder creation
    console.log('\n🔄 Testing reminder creation...');
    await reminderService.checkAndCreateReminders();
    console.log('✅ Reminder check completed');

    // Check updated stats
    const updatedStats = await reminderService.getStats();
    console.log('\n📊 Updated Statistics:');
    console.log(`Total chats: ${updatedStats.totalChats || 0}`);
    console.log(`Chats needing reminders: ${updatedStats.chatsNeedingReminders || 0}`);
    console.log(`Handled reminders: ${updatedStats.handledReminders || 0}`);
    console.log(`Snoozed reminders: ${updatedStats.snoozedReminders || 0}`);

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n📊 MongoDB connection closed');
  }
}

debugReminders();
