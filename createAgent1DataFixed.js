// Create sample data for agent1 testing
const mongoose = require('mongoose');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Earnings = require('./models/Earnings');
const Chat = require('./models/Chat');
const AgentCustomer = require('./models/AgentCustomer');
const AffiliateRegistration = require('./models/AffiliateRegistration');
const Admin = require('./models/Admin');
const EscortProfile = require('./models/EscortProfile');

async function createAgent1SampleData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Clean up any invalid AgentCustomer records with null values
    await AgentCustomer.deleteMany({
      $or: [
        { agent: null },
        { user: null },
        { agentId: null },
        { customerId: null }
      ]
    });
    console.log('Cleaned up invalid agent-customer records');

    // Find or create agent1
    let agent1 = await Agent.findOne({ username: 'agent1' });
    if (!agent1) {
      agent1 = new Agent({
        username: 'agent1',
        password: 'agent123', // Will be hashed by the model
        name: 'Agent One',
        email: 'agent1@test.com',
        status: 'active',
        phone: '555-1234',
        credits: 500,
        commission_rate: 0.30
      });
      await agent1.save();
      console.log('Created agent1');
    } else {
      console.log('Found existing agent1');
    }

    // Create some test users
    const testUsers = [];
    for (let i = 1; i <= 3; i++) {
      let user = await User.findOne({ username: `testuser${i}` });
      if (!user) {
        user = new User({
          username: `testuser${i}`,
          email: `testuser${i}@test.com`,
          password: 'password123', // Will be hashed by the model
          dateOfBirth: new Date('1990-01-01'),
          sex: 'male',
          credits: {
            balance: 50,
            totalPurchased: 100,
            totalUsed: 50,
            lastPurchaseDate: new Date(),
            lastUsageDate: new Date()
          },
          status: 'active',
          registrationSource: 'direct'
        });
        await user.save();
        console.log(`Created testuser${i}`);
      }
      testUsers.push(user);
    }

    // Get or create an admin for the assignedBy field
    let admin = await Admin.findOne();
    if (!admin) {
      admin = new Admin({
        username: 'admin',
        password: 'admin123', // Will be hashed by the model
        name: 'Administrator',
        email: 'admin@test.com'
      });
      await admin.save();
      console.log('Created admin for assignments');
    }

    // Create agent-customer assignments
    for (const user of testUsers) {
      const existingAssignment = await AgentCustomer.findOne({
        agent: agent1._id,
        user: user._id
      });

      if (!existingAssignment) {
        const assignment = new AgentCustomer({
          agent: agent1._id,
          user: user._id,
          assignedBy: admin._id,
          assignmentType: 'manual',
          assignedDate: new Date(),
          status: 'active'
        });
        await assignment.save();
        console.log(`Assigned ${user.username} to agent1`);
      }
    }

    // Create affiliate registrations (make some users affiliate customers)
    for (let i = 0; i < 2; i++) {
      const user = testUsers[i];      const existingAffiliate = await AffiliateRegistration.findOne({
        affiliateAgentId: agent1._id,
        customerId: user._id
      });if (!existingAffiliate) {
        const affiliate = new AffiliateRegistration({
          affiliateAgentId: agent1._id,
          customerId: user._id,
          registrationSource: 'manual_assignment',
          registrationDate: new Date(),
          status: 'active',
          commissionRate: 20,
          totalCommissionEarned: Math.floor(Math.random() * 100) + 10 // Random amount 10-110
        });
        await affiliate.save();
        console.log(`Created affiliate registration for ${user.username} under agent1`);

        // Update user to have affiliate agent
        user.affiliateAgent = agent1._id;
        await user.save();
      }
    }

    // Create some escort profiles for the chats
    const escortProfiles = [];
    for (let i = 1; i <= 2; i++) {
      let escort = await EscortProfile.findOne({ username: `escort${i}` });
      if (!escort) {
        escort = new EscortProfile({
          username: `escort${i}`,
          firstName: `Escort ${i}`,
          gender: 'female',
          country: 'USA',
          region: 'California',
          status: 'active',
          createdBy: agent1._id,
          serialNumber: `ESC${String(i).padStart(3, '0')}`
        });
        await escort.save();
        console.log(`Created escort${i}`);
      }
      escortProfiles.push(escort);
    }

    // Create some sample chat sessions and earnings
    for (let i = 0; i < testUsers.length; i++) {
      const user = testUsers[i];
        // Create a few chat sessions
      for (let j = 0; j < 2 + i; j++) {
        const chat = new Chat({
          customerId: user._id,
          agentId: agent1._id,
          escortId: escortProfiles[j % escortProfiles.length]._id,
          messages: [
            {
              sender: 'customer',
              message: `Hello from ${user.username}!`,
              timestamp: new Date(Date.now() - Math.random() * 86400000 * 7), // Random time in last week
              senderName: user.username
            },
            {
              sender: 'agent',
              message: `Hi ${user.username}! How can I help you today?`,
              timestamp: new Date(Date.now() - Math.random() * 86400000 * 7),
              senderName: agent1.name
            }
          ],
          status: 'assigned',
          createdAt: new Date(Date.now() - Math.random() * 86400000 * 7),
          customerName: user.username
        });        await chat.save();        // Create corresponding earnings record
        const creditsUsed = Math.floor(Math.random() * 20) + 5; // 5-25 credits
        const costPerCredit = 0.5; // $0.50 per credit
        const totalAmount = creditsUsed * costPerCredit;
        
        // Ensure percentages add up to 100%
        const hasAffiliate = !!user.affiliateAgent;
        const adminPercentage = hasAffiliate ? 50 : 70;
        const agentPercentage = 30;
        const affiliatePercentage = hasAffiliate ? 20 : 0;
        
        const adminAmount = Math.floor(totalAmount * (adminPercentage / 100) * 100) / 100;
        const agentAmount = Math.floor(totalAmount * (agentPercentage / 100) * 100) / 100;
        const affiliateAmount = hasAffiliate ? Math.floor(totalAmount * (affiliatePercentage / 100) * 100) / 100 : 0;
        
        const earnings = new Earnings({
          transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: user._id,
          agentId: agent1._id,
          chatId: chat._id,
          affiliateAgentId: user.affiliateAgent || null,
          totalAmount: totalAmount,
          creditsUsed: creditsUsed,
          costPerCredit: costPerCredit,
          adminCommission: {
            percentage: adminPercentage,
            amount: adminAmount
          },
          chatAgentCommission: {
            percentage: agentPercentage,
            amount: agentAmount
          },
          affiliateCommission: {
            percentage: affiliatePercentage,
            amount: affiliateAmount
          },
          transactionDate: chat.createdAt,
          paymentStatus: 'pending'
        });
        await earnings.save();
      }
    }

    console.log('Sample data for agent1 created successfully!');
    console.log('\nTo test:');
    console.log('1. Login as agent1 with credentials: username: "agent1", password: "agent123"');
    console.log('2. Navigate to Commissions tab to see commission stats');
    console.log('3. Navigate to Affiliates tab to see affiliate customers');
    console.log('4. Check the chat history and earnings data');

  } catch (error) {
    console.error('Error creating agent1 sample data:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createAgent1SampleData();
