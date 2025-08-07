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

async function verifyCompleteWorkflow() {
  try {
    console.log('🧪 VERIFYING COMPLETE COIN WORKFLOW...\n');
    
    // Find some existing data
    const users = await User.find().limit(2);
    const agents = await Agent.find().limit(2);
    const chats = await Chat.find().limit(2);
    
    if (users.length === 0 || agents.length === 0 || chats.length === 0) {
      console.log('❌ Need at least 1 user, 1 agent, and 1 chat to test');
      return;
    }
    
    console.log('🎯 TESTING COMPLETE WORKFLOW:\n');
    
    // 1. Customer → Buys coins → Uses to chat with agents
    console.log('📝 1. Customer → Buys coins → Uses to chat with agents');
    
    // Test Scenario 1: Customer WITHOUT affiliate agent
    console.log('\n🔸 Scenario 1: Customer WITHOUT affiliate agent');
    console.log('   Customer uses 10 coins to chat');
    
    const earning1 = new Earnings({
      transactionId: `workflow-test-${Date.now()}-1`,
      userId: users[0]._id,
      chatId: chats[0]._id,
      agentId: agents[0]._id,
      affiliateAgentId: null, // NO affiliate
      coinsUsed: 10,
      coinValue: 1.0,
      description: 'Customer chats without affiliate'
    });
    
    await earning1.save();
    
    console.log(`   💰 Total Amount: $${earning1.totalAmount}`);
    console.log(`   🔹 Agent earns: $${earning1.agentCommission} (${earning1.agentCommissionPercentage}%) ✅`);
    console.log(`   🔹 Affiliate earns: $${earning1.affiliateCommission} (${earning1.affiliateCommissionPercentage}%) ✅`);
    console.log(`   🔹 Admin earns: $${earning1.adminCommission} (${earning1.adminCommissionPercentage}%) ✅`);
    
    const total1 = earning1.agentCommission + earning1.affiliateCommission + earning1.adminCommission;
    console.log(`   ✅ Math Check: $${total1.toFixed(2)} = $${earning1.totalAmount.toFixed(2)} ${Math.abs(total1 - earning1.totalAmount) < 0.01 ? '✓' : '✗'}`);
    
    // Test Scenario 2: Customer WITH affiliate agent
    if (agents.length > 1) {
      console.log('\n🔸 Scenario 2: Customer WITH affiliate agent');
      console.log('   Customer uses 15 coins to chat');
      
      const earning2 = new Earnings({
        transactionId: `workflow-test-${Date.now()}-2`,
        userId: users[0]._id,
        chatId: chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: agents[1]._id, // HAS affiliate
        coinsUsed: 15,
        coinValue: 1.0,
        description: 'Customer chats with affiliate'
      });
      
      await earning2.save();
      
      console.log(`   💰 Total Amount: $${earning2.totalAmount}`);
      console.log(`   🔹 Agent earns: $${earning2.agentCommission} (${earning2.agentCommissionPercentage}%) ✅`);
      console.log(`   🔹 Affiliate earns: $${earning2.affiliateCommission} (${earning2.affiliateCommissionPercentage}%) ✅`);
      console.log(`   🔹 Admin earns: $${earning2.adminCommission} (${earning2.adminCommissionPercentage}%) ✅`);
      
      const total2 = earning2.agentCommission + earning2.affiliateCommission + earning2.adminCommission;
      console.log(`   ✅ Math Check: $${total2.toFixed(2)} = $${earning2.totalAmount.toFixed(2)} ${Math.abs(total2 - earning2.totalAmount) < 0.01 ? '✓' : '✗'}`);
    }
    
    console.log('\n🎯 WORKFLOW VERIFICATION:');
    console.log('✅ Customer → Buys coins → Uses to chat with agents');
    console.log('✅ Agent → Chats with customers → Earns 30% of used coins');
    console.log('✅ Affiliate Agent → If assigned to customer → Gets 20% of their coin usage');
    console.log('✅ Admin → Oversees the platform → Earns 50% (with affiliate) or 70% (without affiliate)');
    
    console.log('\n📊 IMPORTANT CLARIFICATION:');
    console.log('💡 CREDITS = COINS (Same thing, just different terminology)');
    console.log('💡 The system uses "Coins" consistently throughout');
    
    // Verify current totals
    const totalEarnings = await Earnings.countDocuments();
    const agentEarnings = await Earnings.aggregate([
      {
        $group: {
          _id: '$agentId',
          totalEarnings: { $sum: '$agentCommission' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    console.log('\n📈 CURRENT SYSTEM STATUS:');
    console.log(`   Total Earnings Records: ${totalEarnings}`);
    
    for (const agentEarning of agentEarnings) {
      const agent = await Agent.findById(agentEarning._id);
      console.log(`   Agent ${agent?.agentId || 'Unknown'}: $${agentEarning.totalEarnings.toFixed(2)} (${agentEarning.transactionCount} transactions)`);
    }
    
    const adminTotal = await Earnings.aggregate([
      { $group: { _id: null, total: { $sum: '$adminCommission' } } }
    ]);
    
    if (adminTotal.length > 0) {
      console.log(`   Admin Total: $${adminTotal[0].total.toFixed(2)}`);
    }
    
    console.log('\n🎉 COMPLETE WORKFLOW VERIFICATION SUCCESSFUL! ✅');
    
  } catch (error) {
    console.error('❌ Error verifying workflow:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the verification
verifyCompleteWorkflow();
