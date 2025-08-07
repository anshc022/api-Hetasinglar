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
    
    // Create sample earnings
    const sampleEarnings = [
      {
        transactionId: `test-${Date.now()}-1`,
        userId: users[0]._id,
        chatId: chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: null, // No affiliate for now
        coinsUsed: 5,
        coinValue: 1.0,
        totalAmount: 5.0,
        agentCommission: 1.5, // 30%
        agentCommissionPercentage: 30,
        affiliateCommission: 0, // No affiliate
        affiliateCommissionPercentage: 0,
        adminCommission: 3.5, // 70% (no affiliate)
        adminCommissionPercentage: 70,
        messageType: 'text',
        description: 'Sample earning without affiliate'
      },
      {
        transactionId: `test-${Date.now()}-2`,
        userId: users[1]._id,
        chatId: chats[1]._id,
        agentId: agents[0]._id,
        // No affiliate
        coinsUsed: 3,
        coinValue: 1.0,
        totalAmount: 3.0,
        agentCommission: 0.9, // 30%
        agentCommissionPercentage: 30,
        affiliateCommission: 0, // 0% (no affiliate)
        affiliateCommissionPercentage: 0,
        adminCommission: 2.1, // 70%
        adminCommissionPercentage: 70,
        messageType: 'text',
        description: 'Sample earning without affiliate'
      },
      {
        transactionId: `test-${Date.now()}-3`,
        userId: users[2]._id,
        chatId: chats[2]._id,
        agentId: agents[0]._id,
        affiliateAgentId: null, // No affiliate
        coinsUsed: 7,
        coinValue: 1.0,
        totalAmount: 7.0,
        agentCommission: 2.1, // 30%
        agentCommissionPercentage: 30,
        affiliateCommission: 0, // No affiliate
        affiliateCommissionPercentage: 0,
        adminCommission: 4.9, // 70% (no affiliate)
        adminCommissionPercentage: 70,
        messageType: 'image',
        description: 'Sample earning with image message (no affiliate)'
      }
    ];
    
    for (const earningData of sampleEarnings) {
      const earning = new Earnings(earningData);
      await earning.save();
      console.log(`✅ Created earning: ${earning.transactionId} - $${earning.totalAmount} (${earning.coinsUsed} coins)`);
    }
    
    console.log('\n🎉 Sample earnings created successfully!');
    
    // Verify the created earnings
    const newEarnings = await Earnings.find({ 
      transactionId: { $regex: '^test-' } 
    }).populate('userId', 'username').populate('agentId', 'agentId');
    
    console.log('\n📋 Created earnings:');
    newEarnings.forEach(earning => {
      console.log(`- Customer: ${earning.userId?.username || 'Unknown'}`);
      console.log(`  Agent: ${earning.agentId?.agentId || 'Unknown'}`);
      console.log(`  Coins: ${earning.coinsUsed} → Total: $${earning.totalAmount}`);
      console.log(`  Agent Commission: $${earning.agentCommission} (${earning.agentCommissionPercentage}%)`);
      console.log(`  Affiliate Commission: $${earning.affiliateCommission} (${earning.affiliateCommissionPercentage}%)`);
      console.log(`  Admin Commission: $${earning.adminCommission} (${earning.adminCommissionPercentage}%)`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error creating sample earnings:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
createSampleEarnings();
