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

async function fixAllOldChatsEarnings() {
  try {
    console.log('🚀 Comprehensive Fix for All Old Chats...\n');
    
    // Get all agents to assign
    const agents = await Agent.find();
    if (agents.length === 0) {
      console.log('❌ No agents found - cannot proceed');
      return;
    }
    
    console.log(`👥 Found ${agents.length} agents available for assignment`);
    agents.forEach(agent => {
      console.log(`   - ${agent.agentId} (${agent._id})`);
    });
    
    // Find all chats that need fixing
    const allChats = await Chat.find().populate('customerId', 'username');
    console.log(`\n📊 Analyzing ${allChats.length} chats...\n`);
    
    let fixedChats = 0;
    let totalEarningsCreated = 0;
    
    for (const chat of allChats) {
      // Skip if no customer
      if (!chat.customerId) {
        continue;
      }
      
      // Skip if no messages
      if (!chat.messages || chat.messages.length === 0) {
        continue;
      }
      
      // Count customer messages (only these generate earnings)
      const customerMessages = chat.messages.filter(m => m.sender === 'customer');
      if (customerMessages.length === 0) {
        continue;
      }
      
      // Check if already has earnings
      const existingEarnings = await Earnings.find({ chatId: chat._id });
      if (existingEarnings.length > 0) {
        continue; // Already has earnings, skip
      }
      
      console.log(`🔧 Fixing chat ${chat._id}:`);
      console.log(`   Customer: ${chat.customerId.username || 'Unknown'}`);
      console.log(`   Current agent: ${chat.agentId ? 'Assigned' : 'NONE'}`);
      console.log(`   Customer messages: ${customerMessages.length}`);
      
      // Assign an agent if none assigned
      if (!chat.agentId) {
        chat.agentId = agents[0]._id; // Assign the first agent
        chat.status = 'assigned';
        await chat.save();
        console.log(`   ✅ Assigned agent: ${agents[0].agentId}`);
      }
      
      // Create earnings for each customer message
      for (let i = 0; i < customerMessages.length; i++) {
        const message = customerMessages[i];
        const coinsUsed = 5; // Default 5 coins per message
        
        try {
          const earning = new Earnings({
            transactionId: `retro-${chat._id}-msg-${i + 1}-${Date.now()}`,
            userId: chat.customerId._id,
            chatId: chat._id,
            agentId: chat.agentId,
            affiliateAgentId: null, // Old chats typically don't have affiliates
            coinsUsed: coinsUsed,
            coinValue: 1.0,
            description: 'Retroactive earning for old chat',
            messageType: message.messageType || 'text',
            transactionDate: message.timestamp || new Date()
          });
          
          await earning.save();
          totalEarningsCreated++;
          console.log(`     💰 Earning ${i + 1}: $${earning.totalAmount} (Agent: $${earning.agentCommission}, Admin: $${earning.adminCommission})`);
          
        } catch (error) {
          console.log(`     ❌ Failed to create earning ${i + 1}:`, error.message);
        }
      }
      
      fixedChats++;
      console.log('');
    }
    
    console.log('🎉 Fix Completed!');
    console.log(`   ✅ Fixed chats: ${fixedChats}`);
    console.log(`   💰 Total earnings created: ${totalEarningsCreated}`);
    
    // Show updated agent earnings
    const agentEarnings = await Earnings.aggregate([
      {
        $group: {
          _id: '$agentId',
          totalEarnings: { $sum: '$agentCommission' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    console.log('\n👥 Updated Agent Earnings:');
    for (const agentEarning of agentEarnings) {
      const agent = await Agent.findById(agentEarning._id);
      console.log(`   ${agent?.agentId || 'Unknown'}: $${agentEarning.totalEarnings.toFixed(2)} (${agentEarning.transactionCount} transactions)`);
    }
    
    // Show admin earnings
    const adminEarnings = await Earnings.aggregate([
      {
        $group: {
          _id: null,
          totalAdminEarnings: { $sum: '$adminCommission' },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);
    
    if (adminEarnings.length > 0) {
      console.log(`\n🏢 Admin Total Earnings: $${adminEarnings[0].totalAdminEarnings.toFixed(2)} (${adminEarnings[0].totalTransactions} transactions)`);
    }
    
  } catch (error) {
    console.error('❌ Error in comprehensive fix:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the comprehensive fix
fixAllOldChatsEarnings();
