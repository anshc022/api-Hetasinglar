const mongoose = require('mongoose');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Chat = require('./models/Chat');
const Earnings = require('./models/Earnings');
const AffiliateRegistration = require('./models/AffiliateRegistration');
const Admin = require('./models/Admin');
require('dotenv').config();

async function runMultipleTransactions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('🔗 Connected to MongoDB');
    console.log('\n=== MULTIPLE TRANSACTIONS DEMONSTRATION ===\n');

    // Simulate 5 different chat transactions
    const transactions = [
      { customer: 'testuser1', agent: 'agent1', coinsUsed: 25, messageType: 'text' },
      { customer: 'testuser2', agent: 'agent1', coinsUsed: 40, messageType: 'image' },
      { customer: 'testuser1', agent: 'agent1', coinsUsed: 15, messageType: 'text' },
      { customer: 'testuser3', agent: 'agent1', coinsUsed: 60, messageType: 'video' },
      { customer: 'testuser2', agent: 'agent1', coinsUsed: 30, messageType: 'text' }
    ];

    const coinPrice = 1.0; // $1 per coin
    
    console.log('🚀 Processing transactions...\n');

    for (let i = 0; i < transactions.length; i++) {
      const { customer: customerUsername, agent: agentId, coinsUsed, messageType } = transactions[i];
      
      console.log(`💬 Transaction ${i + 1}: ${customerUsername} → ${agentId} (${coinsUsed} coins, ${messageType})`);
      
      // Get customer and agent
      const customer = await User.findOne({ username: customerUsername });
      const agent = await Agent.findOne({ agentId });
      
      if (!customer || !agent) {
        console.log(`   ❌ Customer or agent not found`);
        continue;
      }

      // Check if customer has enough coins
      if (customer.coins.balance < coinsUsed) {
        console.log(`   ⚠️  Customer has insufficient coins (${customer.coins.balance} available)`);
        continue;
      }

      const transactionValue = coinsUsed * coinPrice;
      
      // Create or update chat
      let chat = await Chat.findOne({ 
        customerId: customer._id, 
        agentId: agent._id 
      });
      
      if (!chat) {
        chat = new Chat({
          customerId: customer._id,
          agentId: agent._id,
          chatType: messageType,
          status: 'active',
          totalCoinsUsed: 0,
          totalMessages: 0
        });
      }
      
      chat.totalCoinsUsed += coinsUsed;
      chat.totalMessages += 1;
      chat.lastMessageDate = new Date();
      await chat.save();

      // Deduct coins from customer
      await customer.useCoins(coinsUsed, {
        chatId: chat._id,
        messageType
      });

      // Calculate commissions
      const agentCommission = transactionValue * 0.30; // 30%
      const affiliateCommission = transactionValue * 0.20; // 20%
      const adminCommission = transactionValue * 0.50; // 50%

      // Check for affiliate
      const affiliateReg = await AffiliateRegistration.findOne({
        customerId: customer._id
      }).populate('affiliateAgentId');

      // Create earnings record
      const earnings = new Earnings({
        transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: customer._id,
        chatId: chat._id,
        agentId: agent._id,
        affiliateAgentId: affiliateReg ? affiliateReg.affiliateAgentId._id : null,
        coinsUsed,
        coinValue: coinPrice,
        totalAmount: transactionValue,
        agentCommission,
        agentCommissionPercentage: 30,
        affiliateCommission: affiliateReg ? affiliateCommission : 0,
        affiliateCommissionPercentage: affiliateReg ? 20 : 0,
        adminCommission,
        adminCommissionPercentage: 50,
        paymentStatus: 'pending',
        description: `${messageType} message - ${coinsUsed} coins used`,
        messageType
      });
      
      await earnings.save();

      // Update agent earnings
      if (!agent.earnings) {
        agent.earnings = { totalEarned: 0, pendingAmount: 0 };
      }
      agent.earnings.totalEarned = (agent.earnings.totalEarned || 0) + agentCommission;
      agent.earnings.pendingAmount = (agent.earnings.pendingAmount || 0) + agentCommission;
      await agent.save();

      // Update affiliate earnings if exists
      if (affiliateReg) {
        const affiliateAgent = affiliateReg.affiliateAgentId;
        if (!affiliateAgent.earnings) {
          affiliateAgent.earnings = { totalEarned: 0, pendingAmount: 0 };
        }
        affiliateAgent.earnings.totalEarned = (affiliateAgent.earnings.totalEarned || 0) + affiliateCommission;
        affiliateAgent.earnings.pendingAmount = (affiliateAgent.earnings.pendingAmount || 0) + affiliateCommission;
        
        if (affiliateAgent.affiliateData) {
          affiliateAgent.affiliateData.totalCommissionEarned = (affiliateAgent.affiliateData.totalCommissionEarned || 0) + affiliateCommission;
        }
        
        await affiliateAgent.save();

        // Update affiliate registration
        affiliateReg.totalCommissionEarned = (affiliateReg.totalCommissionEarned || 0) + affiliateCommission;
        affiliateReg.totalCreditsGenerated = (affiliateReg.totalCreditsGenerated || 0) + coinsUsed;
        affiliateReg.customerActivity.totalSpent = (affiliateReg.customerActivity.totalSpent || 0) + transactionValue;
        affiliateReg.customerActivity.lastActivityDate = new Date();
        await affiliateReg.save();
      }

      // Update admin earnings
      const admin = await Admin.findOne({ role: 'super_admin' });
      if (admin) {
        if (!admin.earnings) {
          admin.earnings = { totalEarned: 0, pendingAmount: 0, totalTransactions: 0 };
        }
        admin.earnings.totalEarned = (admin.earnings.totalEarned || 0) + adminCommission;
        admin.earnings.pendingAmount = (admin.earnings.pendingAmount || 0) + adminCommission;
        admin.earnings.totalTransactions = (admin.earnings.totalTransactions || 0) + 1;
        await admin.save();
      }

      console.log(`   💰 Agent: $${agentCommission.toFixed(2)} | Affiliate: $${affiliateReg ? affiliateCommission.toFixed(2) : '0.00'} | Admin: $${adminCommission.toFixed(2)}`);
      console.log(`   💳 Customer balance: ${customer.coins.balance} coins remaining\n`);
    }

    // Final summary
    console.log('📊 FINAL SUMMARY');
    console.log('================');
    
    const agent = await Agent.findOne({ agentId: 'agent1' });
    const admin = await Admin.findOne({ role: 'super_admin' });
    const totalEarnings = await Earnings.aggregate([
      { $group: { 
        _id: null, 
        totalAmount: { $sum: '$totalAmount' },
        totalAgentCommission: { $sum: '$agentCommission' },
        totalAffiliateCommission: { $sum: '$affiliateCommission' },
        totalAdminCommission: { $sum: '$adminCommission' },
        transactionCount: { $sum: 1 }
      }}
    ]);

    if (totalEarnings.length > 0) {
      const summary = totalEarnings[0];
      console.log(`💼 Total platform transactions: ${summary.transactionCount}`);
      console.log(`💰 Total transaction value: $${summary.totalAmount.toFixed(2)}`);
      console.log(`🤵 Total agent commissions: $${summary.totalAgentCommission.toFixed(2)}`);
      console.log(`🤝 Total affiliate commissions: $${summary.totalAffiliateCommission.toFixed(2)}`);
      console.log(`👑 Total admin commissions: $${summary.totalAdminCommission.toFixed(2)}`);
      console.log(`📈 Total commissions distributed: $${(summary.totalAgentCommission + summary.totalAffiliateCommission + summary.totalAdminCommission).toFixed(2)}`);
    }

    if (agent && agent.earnings) {
      console.log(`\n👨‍💼 Agent1 earnings: $${agent.earnings.totalEarned.toFixed(2)} (pending: $${agent.earnings.pendingAmount.toFixed(2)})`);
    }

    if (admin && admin.earnings) {
      console.log(`👑 Admin earnings: $${admin.earnings.totalEarned.toFixed(2)} (pending: $${admin.earnings.pendingAmount.toFixed(2)})`);
    }

    console.log('\n✅ Multiple transactions completed successfully!');

  } catch (error) {
    console.error('❌ Error in multiple transactions:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

runMultipleTransactions();
