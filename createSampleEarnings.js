// Create sample earnings data for testing
const mongoose = require('mongoose');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Earnings = require('./models/Earnings');
const Chat = require('./models/Chat');

async function createSampleEarnings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');    // Find a user, agent, and escort
    const user = await User.findOne();
    const agent = await Agent.findOne();
    const EscortProfile = require('./models/EscortProfile');
    let escort = await EscortProfile.findOne();
    
    if (!user || !agent) {
      console.log('No user or agent found. Please create users and agents first.');
      return;
    }

    // Create a sample escort if none exists
    if (!escort) {
      escort = new EscortProfile({
        firstName: 'Sample',
        lastName: 'Escort',
        email: 'sample@escort.com',
        age: 25,
        description: 'Sample escort for testing',
        isActive: true,
        agentId: agent._id
      });
      await escort.save();
      console.log('Created sample escort');
    }

    console.log(`Found user: ${user.username}, agent: ${agent.name}, escort: ${escort.firstName}`);

    // Create a dummy chat
    let chat = await Chat.findOne({ customerId: user._id, agentId: agent._id });
    if (!chat) {
      chat = new Chat({
        customerId: user._id,
        agentId: agent._id,
        escortId: escort._id,
        status: 'assigned', // Use valid status
        messages: []
      });
      await chat.save();
      console.log('Created sample chat');
    }

    // Create sample earnings with coin system
    const sampleEarnings = [];
    for (let i = 0; i < 5; i++) {
      const coinsUsed = Math.floor(Math.random() * 10) + 5; // 5-15 coins per transaction
      const coinValue = 1.0; // $1 per coin
      const totalAmount = coinsUsed * coinValue;
      
      const earning = new Earnings({
        transactionId: `TXN-${Date.now()}-${i}`,
        userId: user._id,
        chatId: chat._id,
        agentId: agent._id,
        totalAmount,
        coinsUsed,
        coinValue,
        // Keep legacy fields for backward compatibility
        creditsUsed: coinsUsed,
        costPerCredit: coinValue,
        adminCommission: {
          percentage: 50,
          amount: totalAmount * 0.5
        },
        chatAgentCommission: {
          percentage: 30,
          amount: totalAmount * 0.3
        },
        affiliateCommission: {
          percentage: 20,
          amount: totalAmount * 0.2
        },
        transactionDate: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)), // Different days
        messageType: i % 3 === 0 ? 'image' : 'text',
        description: `Sample coin transaction ${i + 1} - ${coinsUsed} coins used`,
        paymentStatus: i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'processed' : 'paid'
      });

      await earning.save();
      sampleEarnings.push(earning);
    }

    console.log(`Created ${sampleEarnings.length} sample earnings`);
    console.log('Sample data created successfully!');

  } catch (error) {
    console.error('Error creating sample earnings:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createSampleEarnings();
