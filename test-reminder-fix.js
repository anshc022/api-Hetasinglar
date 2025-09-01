const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const User = require('./models/User');

async function testReminderLogicFix() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Find the user qauser_y56fw4 again
    const user = await User.findOne({ username: 'qauser_y56fw4' });
    if (!user) {
      console.log('❌ User qauser_y56fw4 not found');
      return;
    }

    const chat = await Chat.findOne({ customerId: user._id });
    if (!chat) {
      console.log('❌ No chat found for user');
      return;
    }

    console.log('📋 CHAT DATA:');
    console.log('Chat ID:', chat._id);
    console.log('Reminder Handled:', chat.reminderHandled);
    console.log('Requires Follow Up:', chat.requiresFollowUp);
    console.log('Created:', chat.createdAt);
    console.log('Updated:', chat.updatedAt);

    // Simulate the live queue aggregation to see what chatType it would get
    const now = new Date();
    const hoursSinceUpdated = (now - chat.updatedAt) / (1000 * 60 * 60);
    const unreadCount = 0; // no messages

    console.log('\n🧮 BACKEND LOGIC SIMULATION:');
    console.log('Hours since updated:', hoursSinceUpdated.toFixed(2));
    console.log('Unread count:', unreadCount);
    console.log('Reminder handled:', chat.reminderHandled);
    console.log('Requires follow up:', chat.requiresFollowUp);

    let chatType = 'queue';
    
    if (chat.isInPanicRoom) {
      chatType = 'panic';
    } else if (unreadCount > 0) {
      chatType = 'queue';
    } else if (chat.reminderHandled !== true && hoursSinceUpdated >= 6) {
      chatType = 'reminder';
    } else if (chat.requiresFollowUp && unreadCount === 0) {
      chatType = 'reminder';
    }

    console.log('\n✅ BACKEND WOULD CLASSIFY AS:', chatType);
    console.log('Should show as reminder in frontend:', chatType === 'reminder');

    await mongoose.disconnect();
    console.log('\n✅ Test complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

testReminderLogicFix();
