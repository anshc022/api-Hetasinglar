const mongoose = require('mongoose');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Earnings = require('./models/Earnings');
const AffiliateRegistration = require('./models/AffiliateRegistration');
const Admin = require('./models/Admin');
require('dotenv').config();

async function showCommissionSummary() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('🔗 Connected to MongoDB');
    console.log('\n=== HETASINGLAR COMMISSION SYSTEM SUMMARY ===\n');

    // Get all earnings data
    const earnings = await Earnings.aggregate([
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          totalCoinsUsed: { $sum: '$coinsUsed' },
          totalAgentCommission: { $sum: '$agentCommission' },
          totalAffiliateCommission: { $sum: '$affiliateCommission' },
          totalAdminCommission: { $sum: '$adminCommission' }
        }
      }
    ]);

    if (earnings.length > 0) {
      const summary = earnings[0];
      
      console.log('💰 PLATFORM REVENUE & COMMISSIONS');
      console.log('================================');
      console.log(`📊 Total transactions: ${summary.totalTransactions}`);
      console.log(`🪙 Total coins used: ${summary.totalCoinsUsed} coins`);
      console.log(`💵 Total revenue: $${summary.totalAmount.toFixed(2)}`);
      console.log('');
      
      console.log('💸 COMMISSION BREAKDOWN');
      console.log('======================');
      console.log(`🤵 Agents (30%): $${summary.totalAgentCommission.toFixed(2)}`);
      console.log(`🤝 Affiliates (20%): $${summary.totalAffiliateCommission.toFixed(2)}`);
      console.log(`👑 Admin (50%): $${summary.totalAdminCommission.toFixed(2)}`);
      console.log(`📈 Total distributed: $${(summary.totalAgentCommission + summary.totalAffiliateCommission + summary.totalAdminCommission).toFixed(2)}`);
      console.log('');
      
      // Verify totals
      const calculatedTotal = summary.totalAgentCommission + summary.totalAffiliateCommission + summary.totalAdminCommission;
      console.log('✅ VERIFICATION');
      console.log('==============');
      console.log(`Revenue: $${summary.totalAmount.toFixed(2)}`);
      console.log(`Commissions: $${calculatedTotal.toFixed(2)}`);
      console.log(`Match: ${Math.abs(summary.totalAmount - calculatedTotal) < 0.01 ? '✅ YES' : '❌ NO'}`);
    }

    // Get individual agent performance
    console.log('\n👨‍💼 AGENT PERFORMANCE');
    console.log('==================');
    
    const agents = await Agent.find({ 
      $or: [
        { agentType: 'chat' },
        { agentType: 'both' }
      ]
    });

    for (const agent of agents) {
      console.log(`\n🤵 ${agent.agentId}`);
      console.log(`   Type: ${agent.agentType}`);
      
      if (agent.earnings) {
        console.log(`   💰 Total earned: $${(agent.earnings.totalEarned || 0).toFixed(2)}`);
        console.log(`   ⏳ Pending: $${(agent.earnings.pendingAmount || 0).toFixed(2)}`);
        console.log(`   ✅ Paid: $${(agent.earnings.paidAmount || 0).toFixed(2)}`);
      } else {
        console.log(`   💰 No earnings recorded`);
      }

      // Get chat statistics
      const agentEarnings = await Earnings.aggregate([
        { $match: { agentId: agent._id } },
        {
          $group: {
            _id: null,
            transactions: { $sum: 1 },
            totalCommission: { $sum: '$agentCommission' },
            coinsHandled: { $sum: '$coinsUsed' }
          }
        }
      ]);

      if (agentEarnings.length > 0) {
        const stats = agentEarnings[0];
        console.log(`   📊 Transactions: ${stats.transactions}`);
        console.log(`   🪙 Coins handled: ${stats.coinsHandled}`);
        console.log(`   💵 Commission earned: $${stats.totalCommission.toFixed(2)}`);
      }

      // Affiliate stats if applicable
      if (agent.agentType === 'both' || agent.agentType === 'affiliate') {
        const affiliateStats = await AffiliateRegistration.aggregate([
          { $match: { affiliateAgentId: agent._id } },
          {
            $group: {
              _id: null,
              customers: { $sum: 1 },
              totalCommission: { $sum: '$totalCommissionEarned' },
              totalCredits: { $sum: '$totalCreditsGenerated' }
            }
          }
        ]);

        if (affiliateStats.length > 0) {
          const affStats = affiliateStats[0];
          console.log(`   🤝 Referred customers: ${affStats.customers}`);
          console.log(`   💰 Affiliate commission: $${affStats.totalCommission.toFixed(2)}`);
          console.log(`   🎯 Credits generated: ${affStats.totalCredits}`);
        }
      }
    }

    // Customer statistics
    console.log('\n👥 CUSTOMER STATISTICS');
    console.log('====================');
    
    const customers = await User.find({});
    let totalCustomerSpent = 0;
    let totalCoinsBalance = 0;

    for (const customer of customers) {
      console.log(`\n👤 ${customer.username}`);
      console.log(`   🪙 Current balance: ${customer.coins.balance} coins`);
      console.log(`   💳 Total purchased: ${customer.coins.totalPurchased} coins`);
      console.log(`   💸 Total used: ${customer.coins.totalUsed} coins`);
      
      totalCustomerSpent += customer.coins.totalUsed;
      totalCoinsBalance += customer.coins.balance;

      // Check if referred by affiliate
      const affiliateReg = await AffiliateRegistration.findOne({
        customerId: customer._id
      }).populate('affiliateAgentId');

      if (affiliateReg) {
        console.log(`   🤝 Referred by: ${affiliateReg.affiliateAgentId.agentId}`);
        console.log(`   💰 Generated commission: $${affiliateReg.totalCommissionEarned.toFixed(2)}`);
      }
    }

    console.log('\n📈 PLATFORM TOTALS');
    console.log('=================');
    console.log(`🪙 Total coins in circulation: ${totalCoinsBalance}`);
    console.log(`💸 Total coins spent by customers: ${totalCustomerSpent}`);
    console.log(`👥 Total active customers: ${customers.length}`);
    console.log(`👨‍💼 Total agents: ${agents.length}`);

  } catch (error) {
    console.error('❌ Error generating summary:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

showCommissionSummary();
