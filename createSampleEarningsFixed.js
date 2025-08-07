const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Earnings = require('./models/Earnings');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Chat = require('./models/Chat');

async function createSampleEarnings() {
  try {
    console.log('🔄 Creating sample earnings with new coin system...');
    
    // Find some existing users, agents, and chats
    const users = await User.find().limit(3);
    const agents = await Agent.find().limit(2);
    const chats = await Chat.find().limit(3);
    
    if (users.length === 0 || agents.length === 0 || chats.length === 0) {
      console.log('❌ Need at least 1 user, 1 agent, and 1 chat to create sample earnings');
      return;
    }
    
    console.log(`📊 Found ${users.length} users, ${agents.length} agents, ${chats.length} chats`);
    
    // Clear any existing test earnings
    await Earnings.deleteMany({ transactionId: { $regex: '^test-' } });
    console.log('🧹 Cleared existing test earnings');
    
    // Create sample earnings with proper coin-based commission
    const sampleEarnings = [
      {
        transactionId: `test-${Date.now()}-1`,
        userId: users[0]._id,
        chatId: chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: null, // No affiliate
        coinsUsed: 10,
        coinValue: 1.0,
        totalAmount: 10.0,
        agentCommission: 3.0, // 30% of 10.0
        agentCommissionPercentage: 30,
        affiliateCommission: 0, // No affiliate
        affiliateCommissionPercentage: 0,
        adminCommission: 7.0, // 70% when no affiliate
        adminCommissionPercentage: 70,
        messageType: 'text',
        description: 'Customer bought 10 coins, no affiliate agent'
      },
      {
        transactionId: `test-${Date.now()}-2`,
        userId: users[0]._id,
        chatId: chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: agents.length > 1 ? agents[1]._id : agents[0]._id, // With affiliate
        coinsUsed: 15,
        coinValue: 1.0,
        totalAmount: 15.0,
        agentCommission: 4.5, // 30% of 15.0
        agentCommissionPercentage: 30,
        affiliateCommission: 3.0, // 20% of 15.0
        affiliateCommissionPercentage: 20,
        adminCommission: 7.5, // 50% of 15.0
        adminCommissionPercentage: 50,
        messageType: 'text',
        description: 'Customer bought 15 coins, with affiliate agent'
      },
      {
        transactionId: `test-${Date.now()}-3`,
        userId: users.length > 1 ? users[1]._id : users[0]._id,
        chatId: chats.length > 1 ? chats[1]._id : chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: null, // No affiliate
        coinsUsed: 5,
        coinValue: 1.0,
        totalAmount: 5.0,
        agentCommission: 1.5, // 30% of 5.0
        agentCommissionPercentage: 30,
        affiliateCommission: 0, // No affiliate
        affiliateCommissionPercentage: 0,
        adminCommission: 3.5, // 70% when no affiliate
        adminCommissionPercentage: 70,
        messageType: 'image',
        description: 'Customer bought 5 coins for image message, no affiliate'
      },
      {
        transactionId: `test-${Date.now()}-4`,
        userId: users.length > 2 ? users[2]._id : users[0]._id,
        chatId: chats.length > 2 ? chats[2]._id : chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: agents.length > 1 ? agents[1]._id : users[0]._id, // With affiliate
        coinsUsed: 20,
        coinValue: 1.0,
        totalAmount: 20.0,
        agentCommission: 6.0, // 30% of 20.0
        agentCommissionPercentage: 30,
        affiliateCommission: 4.0, // 20% of 20.0
        affiliateCommissionPercentage: 20,
        adminCommission: 10.0, // 50% of 20.0
        adminCommissionPercentage: 50,
        messageType: 'video',
        description: 'Customer bought 20 coins for video message, with affiliate'
      }
    ];
    
    for (const earningData of sampleEarnings) {
      const earning = new Earnings(earningData);
      await earning.save();
      console.log(`✅ Created earning: ${earning.transactionId}`);
      console.log(`   💰 Customer spent: ${earning.coinsUsed} coins ($${earning.totalAmount})`);
      console.log(`   👤 Agent earns: $${earning.agentCommission} (${earning.agentCommissionPercentage}%)`);
      console.log(`   🤝 Affiliate earns: $${earning.affiliateCommission} (${earning.affiliateCommissionPercentage}%)`);
      console.log(`   🏢 Admin earns: $${earning.adminCommission} (${earning.adminCommissionPercentage}%)`);
      console.log('');
    }
    
    console.log('\n🎉 Sample earnings created successfully!');
    
    // Verify the created earnings
    const newEarnings = await Earnings.find({ 
      transactionId: { $regex: '^test-' } 
    }).populate('userId', 'username').populate('agentId', 'agentId');
    
    console.log('\n📊 Summary of all test earnings:');
    let totalCoinsUsed = 0;
    let totalAgentEarnings = 0;
    let totalAffiliateEarnings = 0;
    let totalAdminEarnings = 0;
    
    newEarnings.forEach(earning => {
      totalCoinsUsed += earning.coinsUsed;
      totalAgentEarnings += earning.agentCommission;
      totalAffiliateEarnings += earning.affiliateCommission;
      totalAdminEarnings += earning.adminCommission;
      
      console.log(`📋 ${earning.transactionId}:`);
      console.log(`   Customer: ${earning.userId?.username || 'Unknown'} used ${earning.coinsUsed} coins`);
      console.log(`   Agent: ${earning.agentId?.agentId || 'Unknown'} earned $${earning.agentCommission}`);
      console.log(`   Affiliate: ${earning.affiliateCommission > 0 ? `$${earning.affiliateCommission}` : 'None'}`);
      console.log(`   Admin: $${earning.adminCommission}`);
      console.log('');
    });
    
    console.log('💯 TOTALS:');
    console.log(`   🪙 Total coins used by customers: ${totalCoinsUsed}`);
    console.log(`   👤 Total agent earnings: $${totalAgentEarnings.toFixed(2)}`);
    console.log(`   🤝 Total affiliate earnings: $${totalAffiliateEarnings.toFixed(2)}`);
    console.log(`   🏢 Total admin earnings: $${totalAdminEarnings.toFixed(2)}`);
    console.log(`   💰 Total platform revenue: $${(totalAgentEarnings + totalAffiliateEarnings + totalAdminEarnings).toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error creating sample earnings:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
createSampleEarnings();
