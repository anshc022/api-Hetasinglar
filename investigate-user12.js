const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const User = require('./models/User');

async function investigateUser12Chats() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Find the user12
    const user = await User.findOne({ username: 'user12' });
    if (!user) {
      console.log('❌ User user12 not found');
      return;
    }
    console.log('✅ Found user12:', user._id);

    // Find all chats for user12
    const chats = await Chat.find({ customerId: user._id }).populate('customerId', 'username');
    console.log(`\n📋 FOUND ${chats.length} CHATS FOR user12:`);

    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      console.log(`\n--- CHAT ${i + 1} ---`);
      console.log('Chat ID:', chat._id);
      console.log('Status:', chat.status);
      console.log('Created:', chat.createdAt);
      console.log('Updated:', chat.updatedAt);
      console.log('Last Customer Response:', chat.lastCustomerResponse);
      console.log('Reminder Handled:', chat.reminderHandled);
      console.log('Requires Follow Up:', chat.requiresFollowUp);
      console.log('Messages count:', chat.messages.length);

      // Calculate unread count
      const unreadCount = chat.messages.filter(m => m.sender === 'customer' && !m.readByAgent).length;
      console.log('Unread customer messages:', unreadCount);

      // Calculate hours since last customer message
      const now = new Date();
      let hoursSinceLastCustomer = 0;
      
      if (chat.lastCustomerResponse) {
        hoursSinceLastCustomer = (now - chat.lastCustomerResponse) / (1000 * 60 * 60);
      } else {
        // Find last customer message manually
        const lastCustomerMsg = chat.messages.filter(m => m.sender === 'customer').pop();
        if (lastCustomerMsg) {
          hoursSinceLastCustomer = (now - lastCustomerMsg.timestamp) / (1000 * 60 * 60);
        } else {
          hoursSinceLastCustomer = (now - chat.updatedAt) / (1000 * 60 * 60);
        }
      }

      console.log('Hours since last customer activity:', hoursSinceLastCustomer.toFixed(2));

      // Determine what chatType this should be according to backend logic
      let expectedChatType = 'queue';
      
      if (chat.isInPanicRoom) {
        expectedChatType = 'panic';
      } else if (unreadCount > 0) {
        expectedChatType = 'queue';
      } else if (chat.reminderHandled !== true && hoursSinceLastCustomer >= 6) {
        expectedChatType = 'reminder';
      } else if (chat.requiresFollowUp && unreadCount === 0) {
        expectedChatType = 'reminder';
      }

      console.log('\n🧮 BACKEND LOGIC ANALYSIS:');
      console.log('Expected chatType:', expectedChatType);
      console.log('Should be reminder:', expectedChatType === 'reminder');
      
      console.log('\n📝 LOGIC BREAKDOWN:');
      console.log('- Is in panic room:', chat.isInPanicRoom);
      console.log('- Unread count > 0:', unreadCount > 0);
      console.log('- Reminder not handled:', chat.reminderHandled !== true);
      console.log('- Hours >= 6:', hoursSinceLastCustomer >= 6);
      console.log('- Requires follow up:', chat.requiresFollowUp);

      // Show last few messages
      console.log('\n💬 LAST 3 MESSAGES:');
      const lastMessages = chat.messages.slice(-3);
      lastMessages.forEach((msg, j) => {
        console.log(`${j + 1}. ${msg.sender} at ${msg.timestamp.toISOString()}: "${msg.text || msg.messageType}" (Read by agent: ${msg.readByAgent})`);
      });

      if (expectedChatType === 'reminder' && hoursSinceLastCustomer < 6) {
        console.log('\n🚨 PROBLEM: This would be marked as reminder but less than 6 hours!');
      }
      if (expectedChatType !== 'reminder' && hoursSinceLastCustomer >= 24) {
        console.log('\n🤔 NOTICE: This is old (24+ hours) but not marked as reminder - checking why...');
        if (unreadCount > 0) {
          console.log('   Reason: Has unread messages, so stays in queue');
        } else if (chat.reminderHandled === true) {
          console.log('   Reason: Reminder already handled');
        }
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Investigation complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

investigateUser12Chats();
