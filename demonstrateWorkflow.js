const mongoose = require('mongoose');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Chat = require('./models/Chat');
const Earnings = require('./models/Earnings');
const AffiliateRegistration = require('./models/AffiliateRegistration');
const Admin = require('./models/Admin');
require('dotenv').config();

async function demonstrateWorkflow() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('🔗 Connected to MongoDB');
    console.log('\n=== HETASINGLAR PLATFORM WORKFLOW DEMONSTRATION ===\n');

    // Step 1: Customer buys coins
    console.log('📝 STEP 1: Customer buys coins');
    const customer = await User.findOne({ username: 'testuser1' });
    if (!customer) {
      console.log('❌ Customer not found. Please run createAffiliateTestData.js first');
      return;
    }
    
    const coinsToBuy = 100;
    const coinPrice = 1.0; // $1 per coin
    const totalPurchaseAmount = coinsToBuy * coinPrice;
    
    console.log(`   Customer: ${customer.username}`);
    console.log(`   Coins bought: ${coinsToBuy} coins`);
    console.log(`   Price per coin: $${coinPrice}`);
    console.log(`   Total purchase: $${totalPurchaseAmount}`);
    console.log(`   Previous balance: ${customer.coins.balance} coins`);
    
    // Add coins to customer account
    await customer.addCoins(coinsToBuy, {
      packageId: null,
      price: totalPurchaseAmount,
      bonusAmount: 0
    });
    
    console.log(`   New balance: ${customer.coins.balance} coins`);
    console.log('   ✅ Coins purchased successfully!\n');

    // Step 2: Customer uses coins to chat with agent
    console.log('💬 STEP 2: Customer uses coins to chat with agent');
    const agent = await Agent.findOne({ agentId: 'agent1' });
    if (!agent) {
      console.log('❌ Agent not found');
      return;
    }
    
    const coinsUsedForChat = 30;
    console.log(`   Agent: ${agent.agentId}`);
    console.log(`   Coins used for chat: ${coinsUsedForChat} coins`);
    console.log(`   Chat value: $${coinsUsedForChat * coinPrice}`);
    
    // Create or find existing chat
    let chat = await Chat.findOne({ 
      customerId: customer._id, 
      agentId: agent._id 
    });
    
    if (!chat) {
      chat = new Chat({
        customerId: customer._id,
        agentId: agent._id,
        chatType: 'text',
        status: 'active',
        totalCoinsUsed: 0,
        totalMessages: 0
      });
    }
    
    // Update chat with new coin usage
    chat.totalCoinsUsed += coinsUsedForChat;
    chat.totalMessages += 1;
    chat.lastMessageDate = new Date();
    await chat.save();
    
    // Refresh customer document and deduct coins
    const refreshedCustomer = await User.findById(customer._id);
    await refreshedCustomer.useCoins(coinsUsedForChat, {
      chatId: chat._id,
      messageType: 'text'
    });
    
    console.log(`   Customer remaining balance: ${refreshedCustomer.coins.balance} coins`);
    console.log('   ✅ Chat transaction completed!\n');

    // Step 3: Calculate and distribute commissions
    console.log('💰 STEP 3: Calculate and distribute commissions');
    
    const totalTransactionValue = coinsUsedForChat * coinPrice;
    
    // Commission percentages (as per your requirements)
    const agentCommissionRate = 30; // 30%
    const affiliateCommissionRate = 20; // 20%
    const adminCommissionRate = 50; // 50%
    
    const agentCommission = totalTransactionValue * (agentCommissionRate / 100);
    const affiliateCommission = totalTransactionValue * (affiliateCommissionRate / 100);
    const adminCommission = totalTransactionValue * (adminCommissionRate / 100);
    
    console.log(`   Transaction value: $${totalTransactionValue}`);
    console.log(`   Agent commission (${agentCommissionRate}%): $${agentCommission.toFixed(2)}`);
    console.log(`   Affiliate commission (${affiliateCommissionRate}%): $${affiliateCommission.toFixed(2)}`);
    console.log(`   Admin commission (${adminCommissionRate}%): $${adminCommission.toFixed(2)}`);
    console.log(`   Total commissions: $${(agentCommission + affiliateCommission + adminCommission).toFixed(2)}`);
    
    // Check if customer has affiliate agent
    const affiliateRegistration = await AffiliateRegistration.findOne({
      customerId: customer._id
    }).populate('affiliateAgentId');
    
    let affiliateAgent = null;
    if (affiliateRegistration) {
      affiliateAgent = affiliateRegistration.affiliateAgentId;
      console.log(`   Customer is referred by affiliate: ${affiliateAgent.agentId}`);
    } else {
      console.log(`   Customer has no affiliate agent`);
    }
    
    // Create earnings record
    const earnings = new Earnings({
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: customer._id,
      chatId: chat._id,
      agentId: agent._id,
      affiliateAgentId: affiliateAgent ? affiliateAgent._id : null,
      coinsUsed: coinsUsedForChat,
      coinValue: coinPrice,
      totalAmount: totalTransactionValue,
      
      // Commission amounts
      agentCommission: agentCommission,
      agentCommissionPercentage: agentCommissionRate,
      affiliateCommission: affiliateAgent ? affiliateCommission : 0,
      affiliateCommissionPercentage: affiliateAgent ? affiliateCommissionRate : 0,
      adminCommission: adminCommission,
      adminCommissionPercentage: adminCommissionRate,
      
      paymentStatus: 'pending',
      description: `Chat message - ${coinsUsedForChat} coins used`,
      messageType: 'text'
    });
    
    await earnings.save();
    console.log('   ✅ Earnings recorded!\n');

    // Step 4: Update agent earnings
    console.log('👨‍💼 STEP 4: Update agent earnings');
    
    // Update chat agent earnings
    if (!agent.earnings) {
      agent.earnings = {
        totalEarned: 0,
        totalChats: 0,
        totalMessages: 0,
        pendingAmount: 0,
        paidAmount: 0,
        lastPayoutDate: null
      };
    }
    
    agent.earnings.totalEarned = (agent.earnings.totalEarned || 0) + agentCommission;
    agent.earnings.totalChats = await Chat.countDocuments({ agentId: agent._id });
    agent.earnings.totalMessages = (agent.earnings.totalMessages || 0) + 1;
    agent.earnings.pendingAmount = (agent.earnings.pendingAmount || 0) + agentCommission;
    await agent.save();
    
    console.log(`   Agent ${agent.agentId} earned: $${agentCommission.toFixed(2)}`);
    console.log(`   Agent total earnings: $${agent.earnings.totalEarned.toFixed(2)}`);
    
    // Update affiliate agent earnings (if exists)
    if (affiliateAgent) {
      if (!affiliateAgent.earnings) {
        affiliateAgent.earnings = {
          totalEarned: 0,
          totalChats: 0,
          totalMessages: 0,
          pendingAmount: 0,
          paidAmount: 0,
          lastPayoutDate: null
        };
      }
      
      affiliateAgent.earnings.totalEarned = (affiliateAgent.earnings.totalEarned || 0) + affiliateCommission;
      affiliateAgent.earnings.pendingAmount = (affiliateAgent.earnings.pendingAmount || 0) + affiliateCommission;
      
      // Update affiliate data
      if (affiliateAgent.affiliateData) {
        affiliateAgent.affiliateData.totalCommissionEarned = (affiliateAgent.affiliateData.totalCommissionEarned || 0) + affiliateCommission;
      }
      
      await affiliateAgent.save();
      
      // Update affiliate registration
      affiliateRegistration.totalCommissionEarned = (affiliateRegistration.totalCommissionEarned || 0) + affiliateCommission;
      affiliateRegistration.totalCreditsGenerated = (affiliateRegistration.totalCreditsGenerated || 0) + coinsUsedForChat;
      affiliateRegistration.customerActivity.totalSpent = (affiliateRegistration.customerActivity.totalSpent || 0) + totalTransactionValue;
      affiliateRegistration.customerActivity.lastActivityDate = new Date();
      await affiliateRegistration.save();
      
      console.log(`   Affiliate ${affiliateAgent.agentId} earned: $${affiliateCommission.toFixed(2)}`);
      console.log(`   Affiliate total earnings: $${affiliateAgent.earnings.totalEarned.toFixed(2)}`);
    }
    
    console.log('   ✅ Agent earnings updated!\n');

    // Step 5: Update admin earnings
    console.log('👑 STEP 5: Update admin earnings');
    
    const admin = await Admin.findOne({ role: 'super_admin' });
    if (admin) {
      if (!admin.earnings) {
        admin.earnings = {
          totalEarned: 0,
          totalTransactions: 0,
          pendingAmount: 0,
          paidAmount: 0,
          lastPayoutDate: null
        };
      }
      
      admin.earnings.totalEarned = (admin.earnings.totalEarned || 0) + adminCommission;
      admin.earnings.totalTransactions = (admin.earnings.totalTransactions || 0) + 1;
      admin.earnings.pendingAmount = (admin.earnings.pendingAmount || 0) + adminCommission;
      await admin.save();
      
      console.log(`   Admin earned: $${adminCommission.toFixed(2)}`);
      console.log(`   Admin total earnings: $${admin.earnings.totalEarned.toFixed(2)}`);
    } else {
      console.log('   ⚠️  No admin found to credit earnings');
    }
    
    console.log('   ✅ Admin earnings updated!\n');

    // Step 6: Summary report
    console.log('📊 WORKFLOW SUMMARY');
    console.log('==================');
    console.log(`💳 Customer Purchase: ${customer.username} bought ${coinsToBuy} coins for $${totalPurchaseAmount}`);
    console.log(`💬 Chat Transaction: Customer used ${coinsUsedForChat} coins ($${totalTransactionValue}) to chat with ${agent.agentId}`);
    console.log(`💰 Commission Distribution:`);
    console.log(`   🤵 Agent (${agentCommissionRate}%): $${agentCommission.toFixed(2)}`);
    if (affiliateAgent) {
      console.log(`   🤝 Affiliate (${affiliateCommissionRate}%): $${affiliateCommission.toFixed(2)}`);
    }
    console.log(`   👑 Admin (${adminCommissionRate}%): $${adminCommission.toFixed(2)}`);
    console.log(`   📈 Total distributed: $${(agentCommission + (affiliateAgent ? affiliateCommission : 0) + adminCommission).toFixed(2)}`);
    console.log('\n✅ Workflow completed successfully!');

  } catch (error) {
    console.error('❌ Error in workflow demonstration:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

demonstrateWorkflow();
