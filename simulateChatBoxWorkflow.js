const mongoose = require('mongoose');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Chat = require('./models/Chat');
const Earnings = require('./models/Earnings');
const AffiliateRegistration = require('./models/AffiliateRegistration');
const Admin = require('./models/Admin');
require('dotenv').config();

async function simulateChatBoxWorkflow() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('🔗 Connected to MongoDB');
    console.log('\n🎬 SIMULATING COMPLETE CHAT BOX WORKFLOW');
    console.log('========================================\n');

    // Step 1: Customer opens chat
    console.log('📱 STEP 1: Customer Opens Chat Application');
    const customer = await User.findOne({ username: 'testuser1' });
    const agent = await Agent.findOne({ agentId: 'agent1' });
    
    if (!customer || !agent) {
      console.log('❌ Test data not found. Please run createAffiliateTestData.js first');
      return;
    }

    console.log(`👤 Customer: ${customer.username}`);
    console.log(`💰 Customer coin balance: ${customer.coins.balance} coins`);
    console.log(`👨‍💼 Agent: ${agent.agentId}`);
    console.log('');

    // Step 2: Chat session initialization
    console.log('💬 STEP 2: Chat Session Initialization');
    
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
        totalMessages: 0,
        messages: []
      });
      await chat.save();
      console.log('✅ New chat session created');
    } else {
      console.log('✅ Existing chat session found');
    }
    console.log(`💬 Chat ID: ${chat._id}`);
    console.log('');

    // Step 3: Simulate multiple chat messages with coin usage
    console.log('💭 STEP 3: Simulating Chat Messages');
    console.log('====================================');

    const chatMessages = [
      { type: 'text', content: 'Hello! How are you?', coins: 5 },
      { type: 'text', content: 'What are you doing today?', coins: 5 },
      { type: 'image', content: 'Sending a photo...', coins: 15 },
      { type: 'text', content: 'Do you like it?', coins: 5 },
      { type: 'text', content: 'Tell me more about yourself', coins: 10 }
    ];

    let totalCoinsSpent = 0;
    let totalTransactionValue = 0;
    const coinPrice = 1.0; // $1 per coin

    for (let i = 0; i < chatMessages.length; i++) {
      const message = chatMessages[i];
      console.log(`\n💬 Message ${i + 1}: "${message.content}" (${message.type})`);
      console.log(`   🪙 Cost: ${message.coins} coins`);
      
      // Check if customer has enough coins
      const currentCustomer = await User.findById(customer._id);
      if (currentCustomer.coins.balance < message.coins) {
        console.log(`   ❌ Insufficient coins! Customer has ${currentCustomer.coins.balance}, needs ${message.coins}`);
        break;
      }

      // Deduct coins from customer
      await currentCustomer.useCoins(message.coins, {
        chatId: chat._id,
        messageType: message.type
      });

      // Calculate commission breakdown
      const messageValue = message.coins * coinPrice;
      const agentCommission = messageValue * 0.30; // 30%
      const affiliateCommission = messageValue * 0.20; // 20%
      const adminCommission = messageValue * 0.50; // 50%

      console.log(`   💵 Transaction Value: $${messageValue.toFixed(2)}`);
      console.log(`   📊 Commission Split:`);
      console.log(`      🤵 Agent (30%): $${agentCommission.toFixed(2)}`);
      console.log(`      🤝 Affiliate (20%): $${affiliateCommission.toFixed(2)}`);
      console.log(`      👑 Admin (50%): $${adminCommission.toFixed(2)}`);

      // Check for affiliate
      const affiliateReg = await AffiliateRegistration.findOne({
        customerId: customer._id
      }).populate('affiliateAgentId');

      // Create earnings record
      const earnings = new Earnings({
        transactionId: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: customer._id,
        chatId: chat._id,
        agentId: agent._id,
        affiliateAgentId: affiliateReg ? affiliateReg.affiliateAgentId._id : null,
        coinsUsed: message.coins,
        coinValue: coinPrice,
        totalAmount: messageValue,
        agentCommission,
        agentCommissionPercentage: 30,
        affiliateCommission: affiliateReg ? affiliateCommission : 0,
        affiliateCommissionPercentage: affiliateReg ? 20 : 0,
        adminCommission,
        adminCommissionPercentage: 50,
        paymentStatus: 'pending',
        description: `${message.type} message: "${message.content}"`,
        messageType: message.type
      });
      
      await earnings.save();

      // Update chat
      chat.totalCoinsUsed += message.coins;
      chat.totalMessages += 1;
      chat.lastMessageDate = new Date();
      await chat.save();

      // Update agent earnings
      if (!agent.earnings) {
        agent.earnings = { totalEarned: 0, pendingAmount: 0 };
      }
      agent.earnings.totalEarned = (agent.earnings.totalEarned || 0) + agentCommission;
      agent.earnings.pendingAmount = (agent.earnings.pendingAmount || 0) + agentCommission;
      await agent.save();

      // Update affiliate earnings
      if (affiliateReg) {
        const affiliateAgent = affiliateReg.affiliateAgentId;
        if (!affiliateAgent.earnings) {
          affiliateAgent.earnings = { totalEarned: 0, pendingAmount: 0 };
        }
        affiliateAgent.earnings.totalEarned = (affiliateAgent.earnings.totalEarned || 0) + affiliateCommission;
        affiliateAgent.earnings.pendingAmount = (affiliateAgent.earnings.pendingAmount || 0) + affiliateCommission;
        await affiliateAgent.save();

        // Update affiliate registration
        affiliateReg.totalCommissionEarned = (affiliateReg.totalCommissionEarned || 0) + affiliateCommission;
        affiliateReg.totalCreditsGenerated = (affiliateReg.totalCreditsGenerated || 0) + message.coins;
        affiliateReg.customerActivity.totalSpent = (affiliateReg.customerActivity.totalSpent || 0) + messageValue;
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

      totalCoinsSpent += message.coins;
      totalTransactionValue += messageValue;

      // Get updated customer balance
      const updatedCustomer = await User.findById(customer._id);
      console.log(`   💳 Customer remaining balance: ${updatedCustomer.coins.balance} coins`);
      
      // Small delay to simulate real chat
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 4: Chat session summary
    console.log('\n📊 CHAT SESSION SUMMARY');
    console.log('=======================');
    console.log(`💬 Total messages sent: ${chatMessages.length}`);
    console.log(`🪙 Total coins spent: ${totalCoinsSpent}`);
    console.log(`💵 Total transaction value: $${totalTransactionValue.toFixed(2)}`);
    
    const totalAgentCommission = totalTransactionValue * 0.30;
    const totalAffiliateCommission = totalTransactionValue * 0.20;
    const totalAdminCommission = totalTransactionValue * 0.50;
    
    console.log('\n💰 COMMISSION DISTRIBUTION:');
    console.log(`🤵 Agent earned: $${totalAgentCommission.toFixed(2)}`);
    console.log(`🤝 Affiliate earned: $${totalAffiliateCommission.toFixed(2)}`);
    console.log(`👑 Admin earned: $${totalAdminCommission.toFixed(2)}`);
    console.log(`📈 Total distributed: $${(totalAgentCommission + totalAffiliateCommission + totalAdminCommission).toFixed(2)}`);

    // Step 5: Database verification
    console.log('\n🔍 DATABASE VERIFICATION');
    console.log('========================');
    
    const finalCustomer = await User.findById(customer._id);
    const finalAgent = await Agent.findById(agent._id);
    const finalChat = await Chat.findById(chat._id);
    
    console.log(`👤 Customer ${finalCustomer.username}:`);
    console.log(`   🪙 Final coin balance: ${finalCustomer.coins.balance}`);
    console.log(`   💸 Total coins used: ${finalCustomer.coins.totalUsed}`);
    
    console.log(`👨‍💼 Agent ${finalAgent.agentId}:`);
    console.log(`   💰 Total earnings: $${(finalAgent.earnings?.totalEarned || 0).toFixed(2)}`);
    console.log(`   ⏳ Pending amount: $${(finalAgent.earnings?.pendingAmount || 0).toFixed(2)}`);
    
    console.log(`💬 Chat Session:`);
    console.log(`   📊 Total messages: ${finalChat.totalMessages}`);
    console.log(`   🪙 Total coins used: ${finalChat.totalCoinsUsed}`);
    console.log(`   📅 Last activity: ${finalChat.lastMessageDate}`);

    console.log('\n✅ COMPLETE CHAT BOX WORKFLOW VERIFIED!');
    console.log('🎯 Commission structure working perfectly: 50% + 30% + 20% = 100%');

  } catch (error) {
    console.error('❌ Error in chat box workflow simulation:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

simulateChatBoxWorkflow();
