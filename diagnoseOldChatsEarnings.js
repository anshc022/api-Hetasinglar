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

async function diagnoseOldChatsEarnings() {
  try {
    console.log('🔍 Diagnosing Old Chat Earnings Issues...\n');
    
    // Check existing chats
    const chats = await Chat.find().populate('customerId', 'username').populate('agentId', 'agentId').limit(10);
    console.log(`📊 Found ${chats.length} chats in database\n`);
    
    if (chats.length === 0) {
      console.log('❌ No chats found in database');
      return;
    }
    
    // Check each chat for earnings
    for (let i = 0; i < Math.min(5, chats.length); i++) {
      const chat = chats[i];
      console.log(`🔸 Chat ${i + 1}: ${chat._id}`);
      console.log(`   Customer: ${chat.customerId?.username || chat.customerName || 'Unknown'}`);
      console.log(`   Agent: ${chat.agentId?.agentId || 'Unassigned'}`);
      
      // Check if this chat has any earnings
      const earnings = await Earnings.find({ chatId: chat._id });
      console.log(`   💰 Earnings records: ${earnings.length}`);
      
      if (earnings.length === 0) {
        console.log('   ❌ NO EARNINGS FOUND - This is the problem!');
        
        // Check if chat has messages
        console.log(`   💬 Messages count: ${chat.messages?.length || 0}`);
        if (chat.messages && chat.messages.length > 0) {
          console.log('   ⚠️  Chat has messages but no earnings records');
          // Count messages from each sender
          const customerMessages = chat.messages.filter(m => m.sender === 'customer').length;
          const agentMessages = chat.messages.filter(m => m.sender === 'agent').length;
          console.log(`      Customer messages: ${customerMessages}, Agent messages: ${agentMessages}`);
        }
      } else {
        console.log('   ✅ Earnings found:');
        earnings.forEach((earning, idx) => {
          console.log(`      ${idx + 1}. Agent: $${earning.agentCommission}, Admin: $${earning.adminCommission}, Affiliate: $${earning.affiliateCommission}`);
        });
      }
      console.log('');
    }
    
    // Check total earnings vs total chats
    const totalEarnings = await Earnings.countDocuments();
    const totalChats = await Chat.countDocuments();
    
    console.log('📈 Summary:');
    console.log(`   Total Chats: ${totalChats}`);
    console.log(`   Total Earnings: ${totalEarnings}`);
    console.log(`   Chats without earnings: ${totalChats - totalEarnings}`);
    
    if (totalEarnings < totalChats) {
      console.log('\n🚨 ISSUE IDENTIFIED:');
      console.log('   Many chats exist but have no earnings records!');
      console.log('   This means agents and admin are not getting paid for old chats.');
      console.log('\n💡 SOLUTION NEEDED:');
      console.log('   Create earnings records for existing chats that have messages.');
    }
    
    // Check if any agent has earnings
    const agentEarnings = await Earnings.aggregate([
      {
        $group: {
          _id: '$agentId',
          totalEarnings: { $sum: '$agentCommission' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    console.log('\n👥 Agent Earnings Summary:');
    if (agentEarnings.length === 0) {
      console.log('   ❌ NO AGENTS HAVE ANY EARNINGS!');
    } else {
      for (const agentEarning of agentEarnings) {
        const agent = await Agent.findById(agentEarning._id);
        console.log(`   ${agent?.agentId || 'Unknown'}: $${agentEarning.totalEarnings.toFixed(2)} (${agentEarning.transactionCount} transactions)`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error diagnosing chat earnings:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the diagnosis
diagnoseOldChatsEarnings();
