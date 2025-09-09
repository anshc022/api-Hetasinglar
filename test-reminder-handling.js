const mongoose = require('mongoose');
const Chat = require('./models/Chat');

// Connect to MongoDB
mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testReminderHandling() {
  try {
    // Find chats with reminders
    const reminderChats = await Chat.find({
      $or: [
        { reminderActive: true },
        { chatType: 'reminder' }
      ]
    }).select('_id customerName reminderActive reminderHandled chatType unreadCount');

    console.log('Found reminder chats:');
    reminderChats.forEach(chat => {
      console.log(`Chat ${chat._id}:`);
      console.log(`  - customerName: ${chat.customerName}`);
      console.log(`  - reminderActive: ${chat.reminderActive}`);
      console.log(`  - reminderHandled: ${chat.reminderHandled}`);
      console.log(`  - chatType: ${chat.chatType}`);
      console.log(`  - unreadCount: ${chat.unreadCount}`);
      console.log('---');
    });

    if (reminderChats.length > 0) {
      const testChat = reminderChats[0];
      console.log(`\nTesting reminder handling on chat ${testChat._id}`);
      
      // Simulate agent response
      const result = await Chat.findByIdAndUpdate(testChat._id, {
        $set: {
          reminderHandled: true,
          reminderHandledAt: new Date(),
          reminderActive: false
        },
        $unset: {
          reminderSnoozedUntil: 1,
          reminderPriority: 1
        }
      }, { new: true });

      console.log('After update:');
      console.log(`  - reminderActive: ${result.reminderActive}`);
      console.log(`  - reminderHandled: ${result.reminderHandled}`);
      console.log(`  - reminderHandledAt: ${result.reminderHandledAt}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testReminderHandling();
