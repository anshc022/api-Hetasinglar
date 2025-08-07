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

async function createEarningsForOldChats() {
  try {
    console.log('🔧 Creating Earnings for Old Chats...\n');
    
    // Find chats that have messages but no earnings
    const allChats = await Chat.find().populate('customerId', 'username').populate('agentId', 'agentId');
    console.log(`📊 Found ${allChats.length} total chats\n`);
    
    let fixedChats = 0;
    let skippedChats = 0;
    
    for (const chat of allChats) {
      // Check if chat has earnings
      const existingEarnings = await Earnings.find({ chatId: chat._id });
      
      // Skip if already has earnings
      if (existingEarnings.length > 0) {
        skippedChats++;
        continue;
      }
      
      // Skip if no messages
      if (!chat.messages || chat.messages.length === 0) {
        skippedChats++;
        continue;
      }
      
      // Skip if no agent assigned
      if (!chat.agentId) {
        console.log(`⚠️  Skipping chat ${chat._id} - no agent assigned`);
        skippedChats++;
        continue;
      }
      
      // Skip if no customer ID
      if (!chat.customerId) {
        console.log(`⚠️  Skipping chat ${chat._id} - no customer ID`);
        skippedChats++;
        continue;
      }
      
      // Count customer messages (these are what generate earnings)
      const customerMessages = chat.messages.filter(m => m.sender === 'customer');
      
      if (customerMessages.length === 0) {
        console.log(`⚠️  Skipping chat ${chat._id} - no customer messages`);
        skippedChats++;
        continue;
      }
      
      console.log(`🔧 Fixing chat ${chat._id}:`);
      console.log(`   Customer: ${chat.customerId?.username || chat.customerName || 'Unknown'}`);
      console.log(`   Agent: ${chat.agentId?.agentId || 'Unknown'}`);
      console.log(`   Customer messages: ${customerMessages.length}`);
      
      // Create earnings for each customer message (assuming 5 coins per message)
      for (let i = 0; i < customerMessages.length; i++) {
        const message = customerMessages[i];
        const coinsUsed = 5; // Default coins per message
        
        try {
          const earning = new Earnings({
            transactionId: `old-chat-fix-${chat._id}-${message._id}`,
            userId: chat.customerId,
            chatId: chat._id,
            agentId: chat.agentId._id,
            affiliateAgentId: null, // Most old chats probably don't have affiliates
            coinsUsed: coinsUsed,
            coinValue: 1.0,
            description: `Retroactive earning for old chat message`,
            messageType: message.messageType || 'text',
            transactionDate: message.timestamp || new Date()
          });
          
          await earning.save();
          console.log(`     ✅ Created earning for message ${i + 1}: $${earning.totalAmount} (Agent: $${earning.agentCommission}, Admin: $${earning.adminCommission})`);
          
        } catch (error) {
          console.log(`     ❌ Failed to create earning for message ${i + 1}:`, error.message);
        }
      }
      
      fixedChats++;
      console.log('');
    }
    
    console.log('📈 Summary:');
    console.log(`   ✅ Fixed chats: ${fixedChats}`);
    console.log(`   ⏭️  Skipped chats: ${skippedChats}`);
    console.log(`   📊 Total processed: ${allChats.length}`);
    
    // Verify the fix
    const totalEarningsAfter = await Earnings.countDocuments();
    console.log(`\n💰 Total earnings records after fix: ${totalEarningsAfter}`);
    
    // Check agent earnings now
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
    
    console.log('\n🎉 Old chat earnings fix completed!');
    
  } catch (error) {
    console.error('❌ Error fixing old chat earnings:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the fix
createEarningsForOldChats();
