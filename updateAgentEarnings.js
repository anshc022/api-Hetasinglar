const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Earnings = require('./models/Earnings');
const Agent = require('./models/Agent');
const Chat = require('./models/Chat');

async function updateAgentEarnings() {
  try {
    console.log('🔄 Updating agent earnings from transaction data...');
    
    const agents = await Agent.find();
    
    for (const agent of agents) {
      // Calculate total earnings from Earnings collection
      const earningsStats = await Earnings.aggregate([
        { $match: { agentId: agent._id } },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$agentCommission' },
            totalCoinsUsed: { $sum: '$coinsUsed' },
            totalTransactions: { $sum: 1 },
            pendingEarnings: {
              $sum: {
                $cond: [
                  { $eq: ['$paymentStatus', 'pending'] },
                  '$agentCommission',
                  0
                ]
              }
            }
          }
        }
      ]);

      // Calculate chat statistics
      const chatStats = await Chat.aggregate([
        { $match: { agentId: agent._id } },
        {
          $group: {
            _id: null,
            totalChats: { $sum: 1 },
            totalMessages: { $sum: '$messageCount' }
          }
        }
      ]);

      const earnings = earningsStats[0] || { 
        totalEarnings: 0, 
        totalCoinsUsed: 0, 
        totalTransactions: 0,
        pendingEarnings: 0 
      };
      
      const chats = chatStats[0] || { 
        totalChats: 0, 
        totalMessages: 0 
      };

      // Update agent with calculated values
      await Agent.findByIdAndUpdate(agent._id, {
        $set: {
          'earnings.totalEarnings': earnings.totalEarnings,
          'earnings.pendingEarnings': earnings.pendingEarnings,
          'earnings.paidEarnings': earnings.totalEarnings - earnings.pendingEarnings,
          'stats.totalChatSessions': chats.totalChats,
          'stats.totalMessagesSent': chats.totalMessages,
          'stats.totalCreditsGenerated': earnings.totalCoinsUsed
        }
      });

      console.log(`✅ Updated ${agent.name || agent.agentId}:`);
      console.log(`   💰 Total Earnings: $${earnings.totalEarnings}`);
      console.log(`   ⏳ Pending: $${earnings.pendingEarnings}`);
      console.log(`   💬 Total Chats: ${chats.totalChats}`);
      console.log(`   🪙 Coins Used: ${earnings.totalCoinsUsed}`);
    }
    
    console.log('🎉 All agent earnings updated successfully!');
    
  } catch (error) {
    console.error('❌ Error updating agent earnings:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateAgentEarnings();
