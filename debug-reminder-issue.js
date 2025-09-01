const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const User = require('./models/User');

async function debugReminderIssue() {
  try {
    // Connect to database
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Find the user qauser_y56fw4
    const user = await User.findOne({ username: 'qauser_y56fw4' });
    if (!user) {
      console.log('❌ User qauser_y56fw4 not found');
      return;
    }
    console.log('✅ Found user:', user.username);

    // Find chat for this user
    const chat = await Chat.findOne({ customerId: user._id }).populate('customerId', 'username');
    if (!chat) {
      console.log('❌ No chat found for user');
      return;
    }

    console.log('\n📋 CHAT ANALYSIS:');
    console.log('Chat ID:', chat._id);
    console.log('Customer:', chat.customerId?.username);
    console.log('Status:', chat.status);
    console.log('Created:', chat.createdAt);
    console.log('Updated:', chat.updatedAt);
    console.log('Last Customer Response:', chat.lastCustomerResponse);
    console.log('Reminder Handled:', chat.reminderHandled);
    console.log('Requires Follow Up:', chat.requiresFollowUp);
    console.log('Reminder Snoozed Until:', chat.reminderSnoozedUntil);
    console.log('Is In Panic Room:', chat.isInPanicRoom);

    // Analyze messages
    console.log('\n📨 MESSAGE ANALYSIS:');
    console.log('Total messages:', chat.messages.length);
    
    const customerMessages = chat.messages.filter(m => m.sender === 'customer');
    const agentMessages = chat.messages.filter(m => m.sender === 'agent');
    const unreadCustomerMessages = chat.messages.filter(m => m.sender === 'customer' && !m.readByAgent);
    
    console.log('Customer messages:', customerMessages.length);
    console.log('Agent messages:', agentMessages.length);
    console.log('Unread customer messages:', unreadCustomerMessages.length);

    // Get last customer message
    const lastCustomerMessage = customerMessages[customerMessages.length - 1];
    if (lastCustomerMessage) {
      const now = new Date();
      const hoursSinceLastCustomer = (now - lastCustomerMessage.timestamp) / (1000 * 60 * 60);
      const minutesSinceLastCustomer = (now - lastCustomerMessage.timestamp) / (1000 * 60);
      
      console.log('\n⏰ TIME ANALYSIS:');
      console.log('Last customer message at:', lastCustomerMessage.timestamp);
      console.log('Current time:', now);
      console.log('Minutes since last customer message:', Math.floor(minutesSinceLastCustomer));
      console.log('Hours since last customer message:', hoursSinceLastCustomer.toFixed(2));
      console.log('Read by agent:', lastCustomerMessage.readByAgent);
    }

    // Show last few messages for context
    console.log('\n💬 LAST 5 MESSAGES:');
    const lastMessages = chat.messages.slice(-5);
    lastMessages.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg.sender} at ${msg.timestamp.toISOString()}: "${msg.text || msg.messageType}" (Read: ${msg.readByAgent})`);
    });

    // Simulate the live queue aggregation logic for this specific chat
    console.log('\n🔍 LIVE QUEUE LOGIC SIMULATION:');
    
    const unreadCount = unreadCustomerMessages.length;
    console.log('Unread count:', unreadCount);

    let hoursSinceLastCustomer = 0;
    if (chat.lastCustomerResponse) {
      hoursSinceLastCustomer = (new Date() - chat.lastCustomerResponse) / (1000 * 60 * 60);
    } else if (lastCustomerMessage) {
      hoursSinceLastCustomer = (new Date() - lastCustomerMessage.timestamp) / (1000 * 60 * 60);
    } else {
      hoursSinceLastCustomer = (new Date() - chat.updatedAt) / (1000 * 60 * 60);
    }

    console.log('Hours calculation base:', chat.lastCustomerResponse ? 'lastCustomerResponse' : lastCustomerMessage ? 'lastCustomerMessage.timestamp' : 'updatedAt');
    console.log('Hours since last customer:', hoursSinceLastCustomer.toFixed(2));

    // Determine chat type based on live queue logic
    let chatType = 'queue';
    let priority = 1;

    if (chat.isInPanicRoom) {
      chatType = 'panic';
      priority = 5;
    } else if (unreadCount > 0) {
      chatType = 'queue';
      if (unreadCount > 5) {
        priority = 3;
      } else {
        priority = 2;
      }
    } else if (chat.reminderHandled !== true && hoursSinceLastCustomer >= 6) {
      chatType = 'reminder';
      priority = 4;
    } else if (chat.requiresFollowUp && unreadCount === 0) {
      chatType = 'reminder';
      priority = 4;
    }

    console.log('Determined chat type:', chatType);
    console.log('Determined priority:', priority);

    // Check if this should show as reminder
    const shouldBeReminder = (
      unreadCount === 0 && 
      chat.reminderHandled !== true && 
      hoursSinceLastCustomer >= 6
    ) || (
      chat.requiresFollowUp && 
      unreadCount === 0
    );

    console.log('\n✅ REMINDER LOGIC CHECK:');
    console.log('Unread count is 0:', unreadCount === 0);
    console.log('Reminder not handled:', chat.reminderHandled !== true);
    console.log('Hours >= 6:', hoursSinceLastCustomer >= 6);
    console.log('Requires follow up:', chat.requiresFollowUp);
    console.log('Should be reminder:', shouldBeReminder);

    if (chatType === 'reminder' && hoursSinceLastCustomer < 6) {
      console.log('\n🚨 PROBLEM DETECTED:');
      console.log('Chat is showing as reminder but only', hoursSinceLastCustomer.toFixed(2), 'hours have passed!');
      console.log('Expected: At least 6 hours should pass before showing as reminder');
      
      // Check if requiresFollowUp is the culprit
      if (chat.requiresFollowUp) {
        console.log('🔍 CAUSE: requiresFollowUp flag is set to true');
        console.log('This makes the chat show as reminder regardless of time');
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Analysis complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

// Run the debug
debugReminderIssue();
