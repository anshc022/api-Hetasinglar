const mongoose = require('mongoose');
const Chat = require('./models/Chat');

async function checkRawChatData() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    const chatId = '68b442cf69b96038c254aa60';
    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      console.log('❌ Chat not found');
      return;
    }

    console.log('\n📋 RAW CHAT DATA:');
    console.log('Chat ID:', chat._id);
    console.log('reminderHandled:', chat.reminderHandled);
    console.log('requiresFollowUp:', chat.requiresFollowUp);
    console.log('lastCustomerResponse:', chat.lastCustomerResponse);
    console.log('updatedAt:', chat.updatedAt);
    console.log('Total messages:', chat.messages.length);
    
    // Count unread messages manually
    const unreadMessages = chat.messages.filter(m => m.sender === 'customer' && !m.readByAgent);
    console.log('Unread customer messages:', unreadMessages.length);
    
    // Calculate hours manually
    const now = new Date();
    const hoursSinceLastCustomer = (now - chat.lastCustomerResponse) / (1000 * 60 * 60);
    console.log('Hours since last customer:', hoursSinceLastCustomer.toFixed(2));
    
    console.log('\n💬 ALL MESSAGES:');
    chat.messages.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg.sender} at ${msg.timestamp}: "${msg.text || msg.messageType}" (readByAgent: ${msg.readByAgent})`);
    });

    console.log('\n🧮 MANUAL LOGIC CHECK:');
    console.log('Unread count === 0:', unreadMessages.length === 0);
    console.log('Reminder not handled:', chat.reminderHandled !== true);
    console.log('Hours >= 6:', hoursSinceLastCustomer >= 6);
    console.log('Should be reminder:', 
      unreadMessages.length === 0 && 
      chat.reminderHandled !== true && 
      hoursSinceLastCustomer >= 6
    );

    await mongoose.disconnect();
    console.log('\n✅ Raw data check complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

checkRawChatData();
