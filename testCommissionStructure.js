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

async function testCommissionStructure() {
  try {
    console.log('🧪 Testing Commission Structure...\n');
    
    // Find some existing data
    const users = await User.find().limit(2);
    const agents = await Agent.find().limit(2);
    const chats = await Chat.find().limit(2);
    
    if (users.length === 0 || agents.length === 0 || chats.length === 0) {
      console.log('❌ Need at least 1 user, 1 agent, and 1 chat to test');
      return;
    }
    
    console.log('📊 Testing scenarios...\n');
    
    // Test 1: Customer without affiliate (Agent 30%, Admin 70%)
    console.log('🔸 Test 1: Customer uses 10 coins WITHOUT affiliate');
    const earning1 = new Earnings({
      transactionId: `test-commission-${Date.now()}-1`,
      userId: users[0]._id,
      chatId: chats[0]._id,
      agentId: agents[0]._id,
      affiliateAgentId: null, // No affiliate
      coinsUsed: 10,
      coinValue: 1.0,
      description: 'Test without affiliate'
    });
    
    await earning1.save();
    console.log(`   💰 Total: $${earning1.totalAmount}`);
    console.log(`   📈 Agent Commission: $${earning1.agentCommission} (${earning1.agentCommissionPercentage}%)`);
    console.log(`   🔗 Affiliate Commission: $${earning1.affiliateCommission} (${earning1.affiliateCommissionPercentage}%)`);
    console.log(`   🏢 Admin Commission: $${earning1.adminCommission} (${earning1.adminCommissionPercentage}%)`);
    
    const total1 = earning1.agentCommission + earning1.affiliateCommission + earning1.adminCommission;
    console.log(`   ✅ Math Check: $${total1.toFixed(2)} = $${earning1.totalAmount.toFixed(2)} ${Math.abs(total1 - earning1.totalAmount) < 0.01 ? '✓' : '✗'}\n`);
    
    // Test 2: Customer with affiliate (Agent 30%, Affiliate 20%, Admin 50%)
    if (agents.length > 1) {
      console.log('🔸 Test 2: Customer uses 15 coins WITH affiliate');
      const earning2 = new Earnings({
        transactionId: `test-commission-${Date.now()}-2`,
        userId: users[0]._id,
        chatId: chats[0]._id,
        agentId: agents[0]._id,
        affiliateAgentId: agents[1]._id, // Has affiliate
        coinsUsed: 15,
        coinValue: 1.0,
        description: 'Test with affiliate'
      });
      
      await earning2.save();
      console.log(`   💰 Total: $${earning2.totalAmount}`);
      console.log(`   📈 Agent Commission: $${earning2.agentCommission} (${earning2.agentCommissionPercentage}%)`);
      console.log(`   🔗 Affiliate Commission: $${earning2.affiliateCommission} (${earning2.affiliateCommissionPercentage}%)`);
      console.log(`   🏢 Admin Commission: $${earning2.adminCommission} (${earning2.adminCommissionPercentage}%)`);
      
      const total2 = earning2.agentCommission + earning2.affiliateCommission + earning2.adminCommission;
      console.log(`   ✅ Math Check: $${total2.toFixed(2)} = $${earning2.totalAmount.toFixed(2)} ${Math.abs(total2 - earning2.totalAmount) < 0.01 ? '✓' : '✗'}\n`);
    }
    
    console.log('🎯 Expected Commission Structure:');
    console.log('   • Customer → Buys coins → Uses to chat with agents');
    console.log('   • Agent → Earns 30% of used coins');
    console.log('   • Affiliate Agent → Gets 20% of coins (if assigned)');
    console.log('   • Admin → Earns 50% (with affiliate) or 70% (without affiliate)');
    
    console.log('\n✅ Commission structure test completed!');
    
  } catch (error) {
    console.error('❌ Error testing commission structure:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the test
testCommissionStructure();
