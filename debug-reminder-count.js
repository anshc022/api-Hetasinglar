const mongoose = require('mongoose');
const Chat = require('./models/Chat');

// Connect to MongoDB
mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function checkReminderStatus() {
  try {
    // Count reminders that should be visible (reminderHandled !== true)
    const activeReminders = await Chat.countDocuments({
      $and: [
        {
          $or: [
            { reminderActive: true },
            { chatType: 'reminder' }
          ]
        },
        { isInPanicRoom: { $ne: true } },
        { 
          $or: [
            { unreadCount: { $exists: false } },
            { unreadCount: 0 }
          ]
        },
        {
          $or: [
            { reminderHandled: { $exists: false } },
            { reminderHandled: false },
            { reminderHandled: null }
          ]
        }
      ]
    });

    // Count total reminders (regardless of handled status)
    const totalReminders = await Chat.countDocuments({
      $or: [
        { reminderActive: true },
        { chatType: 'reminder' }
      ]
    });

    // Count handled reminders
    const handledReminders = await Chat.countDocuments({
      $and: [
        {
          $or: [
            { reminderActive: true },
            { chatType: 'reminder' }
          ]
        },
        { reminderHandled: true }
      ]
    });

    console.log('=== REMINDER STATUS ===');
    console.log(`Total reminder chats: ${totalReminders}`);
    console.log(`Handled reminders: ${handledReminders}`);
    console.log(`Active (visible) reminders: ${activeReminders}`);
    
    // Show a few examples
    console.log('\n=== SAMPLE REMINDER CHATS ===');
    const sampleChats = await Chat.find({
      $or: [
        { reminderActive: true },
        { chatType: 'reminder' }
      ]
    })
    .select('_id customerName reminderActive reminderHandled chatType unreadCount isInPanicRoom')
    .limit(10)
    .lean();

    sampleChats.forEach((chat, index) => {
      const shouldBeVisible = !chat.isInPanicRoom && 
        (chat.reminderActive || chat.chatType === 'reminder') && 
        (!chat.unreadCount || chat.unreadCount === 0) && 
        chat.reminderHandled !== true;
      
      console.log(`${index + 1}. Chat ${chat._id}:`);
      console.log(`   - customerName: ${chat.customerName || 'N/A'}`);
      console.log(`   - reminderActive: ${chat.reminderActive}`);
      console.log(`   - reminderHandled: ${chat.reminderHandled}`);
      console.log(`   - chatType: ${chat.chatType}`);
      console.log(`   - unreadCount: ${chat.unreadCount}`);
      console.log(`   - isInPanicRoom: ${chat.isInPanicRoom}`);
      console.log(`   - Should be visible: ${shouldBeVisible}`);
      console.log('   ---');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkReminderStatus();
