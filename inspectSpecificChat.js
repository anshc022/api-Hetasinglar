const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Chat = require('./models/Chat');
const Earnings = require('./models/Earnings');
const Agent = require('./models/Agent');
const User = require('./models/User');

async function inspectSpecificChat() {
  try {
    console.log('🔍 Inspecting Specific Chat with Messages but No Earnings...\n');
    
    // Find the chat that had messages but no earnings
    const problematicChat = await Chat.findById('680142671a6ce86051e908ff').populate('customerId', 'username');
    
    if (!problematicChat) {
      console.log('❌ Chat not found');
      return;
    }
    
    console.log('📊 Chat Details:');
    console.log(`   ID: ${problematicChat._id}`);
    console.log(`   Customer ID: ${problematicChat.customerId}`);
    console.log(`   Customer Name: ${problematicChat.customerName}`);
    console.log(`   Agent ID: ${problematicChat.agentId}`);
    console.log(`   Status: ${problematicChat.status}`);
    console.log(`   Messages: ${problematicChat.messages?.length || 0}`);
    
    if (problematicChat.messages && problematicChat.messages.length > 0) {
      console.log('\n📝 Messages:');
      problematicChat.messages.forEach((msg, idx) => {
        console.log(`   ${idx + 1}. ${msg.sender}: "${msg.message}" (${new Date(msg.timestamp).toLocaleString()})`);
      });
    }
    
    // Check if customer exists
    const customer = await User.findById(problematicChat.customerId);
    console.log(`\n👤 Customer exists: ${customer ? 'Yes' : 'No'}`);
    if (customer) {
      console.log(`   Username: ${customer.username}`);
      console.log(`   Coins: ${customer.coins?.balance || 0}`);
    }
    
    // Check agents available
    const agents = await Agent.find();
    console.log(`\n👥 Available agents: ${agents.length}`);
    agents.forEach(agent => {
      console.log(`   - ${agent.agentId} (${agent._id})`);
    });
    
    // Let's assign an agent and create earnings for this chat
    if (!problematicChat.agentId && agents.length > 0) {
      console.log('\n🔧 Assigning agent and creating earnings...');
      
      // Assign the first available agent
      problematicChat.agentId = agents[0]._id;
      problematicChat.status = 'assigned';
      await problematicChat.save();
      
      console.log(`✅ Assigned agent: ${agents[0].agentId}`);
      
      // Create earnings for customer messages
      const customerMessages = problematicChat.messages.filter(m => m.sender === 'customer');
      
      for (let i = 0; i < customerMessages.length; i++) {
        const message = customerMessages[i];
        const coinsUsed = 5; // Default coins per message
        
        const earning = new Earnings({
          transactionId: `retro-fix-${problematicChat._id}-${i + 1}`,
          userId: problematicChat.customerId,
          chatId: problematicChat._id,
          agentId: agents[0]._id,
          affiliateAgentId: null,
          coinsUsed: coinsUsed,
          coinValue: 1.0,
          description: `Retroactive earning for customer message`,
          messageType: message.messageType || 'text',
          transactionDate: message.timestamp || new Date()
        });
        
        await earning.save();
        console.log(`   💰 Created earning ${i + 1}: $${earning.totalAmount} (Agent: $${earning.agentCommission}, Admin: $${earning.adminCommission})`);
      }
    }
    
    console.log('\n✅ Chat inspection and fix completed!');
    
  } catch (error) {
    console.error('❌ Error inspecting chat:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the inspection
inspectSpecificChat();
