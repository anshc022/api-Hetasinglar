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
    console.log('🔄 Creating sample earnings with new coin-based commission system...');
    
    // Find some existing users, agents, and chats
    const users = await User.find().limit(3);
    const agents = await Agent.find().limit(2);
    const chats = await Chat.find().limit(3);
    
    if (users.length === 0 || agents.length === 0 || chats.length === 0) {
      console.log('❌ Need at least 1 user, 1 agent, and 1 chat to create sample earnings');
      return;
    }
    
    console.log(`📊 Found ${users.length} users, ${agents.length} agents, ${chats.length} chats`);
    
    // Create sample earnings with the new coin-based commission structure
    const sampleEarnings = [
      // Scenario 1: Customer buys coins → Uses to chat with agent (no affiliate)
      // Agent earns 30%, Admin earns 70%
      {
        transactionId: `coin-test-${Date.now()}-1`,
        userId: users[0]._id,
        chatId: chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: null,
        coinsUsed: 10,
        coinValue: 1.0,
        totalAmount: 10.0,
        agentCommission: 3.0, // 30%
        agentCommissionPercentage: 30,
        affiliateCommission: 0, // No affiliate
        affiliateCommissionPercentage: 0,
        adminCommission: 7.0, // 70%
        adminCommissionPercentage: 70,
        messageType: 'text',
        description: 'Customer chat without affiliate - Agent earns 30%, Admin earns 70%'
      },
      
      // Scenario 2: Customer with affiliate agent → Uses coins to chat
      // Agent earns 30%, Affiliate earns 20%, Admin earns 50%
      {
        transactionId: `coin-test-${Date.now()}-2`,
        userId: users[1]._id,
        chatId: chats[1]._id,
        agentId: agents[0]._id,
        affiliateAgentId: agents.length > 1 ? agents[1]._id : null, // Has affiliate if available
        coinsUsed: 15,
        coinValue: 1.0,
        totalAmount: 15.0,
        agentCommission: 4.5, // 30%
        agentCommissionPercentage: 30,
        affiliateCommission: agents.length > 1 ? 3.0 : 0, // 20% if affiliate exists
        affiliateCommissionPercentage: agents.length > 1 ? 20 : 0,
        adminCommission: agents.length > 1 ? 7.5 : 10.5, // 50% with affiliate, 70% without
        adminCommissionPercentage: agents.length > 1 ? 50 : 70,
        messageType: 'image',
        description: agents.length > 1 ? 'Customer chat with affiliate - Agent earns 30%, Affiliate earns 20%, Admin earns 50%' : 'Customer chat without affiliate - Agent earns 30%, Admin earns 70%'
      },
      
      // Scenario 3: Another transaction without affiliate
      {
        transactionId: `coin-test-${Date.now()}-3`,
        userId: users[2]._id,
        chatId: chats[2]._id,
        agentId: agents[0]._id,
        affiliateAgentId: null,
        coinsUsed: 5,
        coinValue: 1.0,
        totalAmount: 5.0,
        agentCommission: 1.5, // 30%
        agentCommissionPercentage: 30,
        affiliateCommission: 0, // No affiliate
        affiliateCommissionPercentage: 0,
        adminCommission: 3.5, // 70%
        adminCommissionPercentage: 70,
        messageType: 'text',
        description: 'Another customer chat without affiliate - Agent earns 30%, Admin earns 70%'
      }
    ];
    
    for (const earningData of sampleEarnings) {
      const earning = new Earnings(earningData);
      await earning.save();
      console.log(`✅ Created earning: ${earning.transactionId} - $${earning.totalAmount} (${earning.coinsUsed} coins)`);
      console.log(`   💰 Commission breakdown: Agent ${earning.agentCommissionPercentage}% ($${earning.agentCommission}), Affiliate ${earning.affiliateCommissionPercentage}% ($${earning.affiliateCommission}), Admin ${earning.adminCommissionPercentage}% ($${earning.adminCommission})`);
    }
    
    console.log('\n🎉 Sample earnings created successfully!');
    console.log('\n📋 Commission Structure Summary:');
    console.log('🔹 Customer → Buys coins → Uses to chat with agents');
    console.log('🔹 Agent → Chats with customers → Earns 30% of used coins');
    console.log('🔹 Affiliate Agent → If assigned to customer → Gets 20% of their coin usage');
    console.log('🔹 Admin → Oversees the platform → Earns 50% (with affiliate) or 70% (without affiliate) of each transaction');
    
    // Verify the created earnings
    const newEarnings = await Earnings.find({ 
      transactionId: { $regex: '^coin-test-' } 
    }).populate('userId', 'username').populate('agentId', 'agentId').populate('affiliateAgentId', 'agentId');
    
    console.log('\n📊 Created earnings verification:');
    newEarnings.forEach((earning, index) => {
      console.log(`\n${index + 1}. ${earning.description}`);
      console.log(`   Customer: ${earning.userId?.username || 'Unknown'}`);
      console.log(`   Agent: ${earning.agentId?.agentId || 'Unknown'}`);
      console.log(`   Affiliate: ${earning.affiliateAgentId?.agentId || 'None'}`);
      console.log(`   Coins Used: ${earning.coinsUsed} → Total Amount: $${earning.totalAmount}`);
      console.log(`   Commission Breakdown:`);
      console.log(`     - Agent: $${earning.agentCommission} (${earning.agentCommissionPercentage}%)`);
      console.log(`     - Affiliate: $${earning.affiliateCommission} (${earning.affiliateCommissionPercentage}%)`);
      console.log(`     - Admin: $${earning.adminCommission} (${earning.adminCommissionPercentage}%)`);
      
      // Verify math
      const total = earning.agentCommission + earning.affiliateCommission + earning.adminCommission;
      const isCorrect = Math.abs(total - earning.totalAmount) < 0.01;
      console.log(`   ✅ Math check: $${total.toFixed(2)} ${isCorrect ? '=' : '≠'} $${earning.totalAmount} ${isCorrect ? '✓' : '✗'}`);
    });
    
  } catch (error) {
    console.error('❌ Error creating sample earnings:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the script
createSampleEarnings();
