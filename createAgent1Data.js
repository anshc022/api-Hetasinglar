// Create sample data for agent1 testing
const mongoose = require('mongoose');
const User = require('./models/User');
const Agent = require('./models/Agent');
const Earnings = require('./models/Earnings');
const Chat = require('./models/Chat');
const AgentCustomer = require('./models/AgentCustomer');
const AffiliateRegistration = require('./models/AffiliateRegistration');

async function createAgent1SampleData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Find or create agent1
    let agent1 = await Agent.findOne({ agentId: 'agent1' });
    if (!agent1) {
      agent1 = new Agent({
        agentId: 'agent1',
        password: '$2a$10$XnD5xYEH9QN1K7qXZ8vQHeH8qPaQh1YqvLQu2i7uCZtq8vWj.mfqu', // 'agent1' hashed
        name: 'Agent One',
        email: 'agent1@test.com',
        role: 'agent',
        commissionSettings: {
          adminPercentage: 50,
          agentPercentage: 30,
          affiliatePercentage: 20
        },
        affiliateData: {
          isAffiliateAgent: true,
          affiliateCommissionRate: 20
        },
        earnings: {
          totalEarned: 0,
          pendingPayment: 0,
          lastPayoutDate: null
        }
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
          password: '$2a$10$XnD5xYEH9QN1K7qXZ8vQHeH8qPaQh1YqvLQu2i7uCZtq8vWj.mfqu', // 'password' hashed
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
    }    // Create agent-customer assignments
    // First, get or create an admin for the assignedBy field
    const Admin = require('./models/Admin');
    let admin = await Admin.findOne();
    if (!admin) {
      admin = new Admin({
        adminId: 'admin',
        password: '$2a$10$XnD5xYEH9QN1K7qXZ8vQHeH8qPaQh1YqvLQu2i7uCZtq8vWj.mfqu', // 'admin123' hashed
        name: 'Administrator',
        role: 'admin'
      });
      await admin.save();
      console.log('Created admin for assignments');
    }

    for (const user of testUsers) {
      const existingAssignment = await AgentCustomer.findOne({
        agentId: agent1._id,
        customerId: user._id
      });

      if (!existingAssignment) {
        const assignment = new AgentCustomer({
          agentId: agent1._id,
          customerId: user._id,
          assignedBy: admin._id,
          assignmentType: 'manual',
          assignedDate: new Date(),
          status: 'active',
          commissionSettings: {
            adminPercentage: 50,
            agentPercentage: 30,
            affiliatePercentage: 20
          }
        });
        await assignment.save();
        console.log(`Assigned ${user.username} to agent1`);
      }
    }

    // Create affiliate registrations (make some users affiliate customers)
    for (let i = 0; i < 2; i++) {
      const user = testUsers[i];
      const existingAffiliate = await AffiliateRegistration.findOne({
        affiliateAgentId: agent1._id,
        customerId: user._id
      });

      if (!existingAffiliate) {
        const affiliate = new AffiliateRegistration({
          affiliateAgentId: agent1._id,
          customerId: user._id,
          registrationDate: new Date(),
          status: 'active',
          commissionRate: 20,
          totalCommissionEarned: 0
        });
        await affiliate.save();
        console.log(`Created affiliate registration for ${user.username} under agent1`);

        // Update user to have affiliate agent
        user.affiliateAgent = agent1._id;
        await user.save();
      }
    }

    console.log('Sample data for agent1 created successfully!');
    console.log('\nTo test:');
    console.log('1. Login as agent1 with credentials: agentId: "agent1", password: "agent1"');
    console.log('2. Navigate to Commissions tab to see commission stats');
    console.log('3. Navigate to Affiliates tab to see affiliate customers');

  } catch (error) {
    console.error('Error creating agent1 sample data:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createAgent1SampleData();
