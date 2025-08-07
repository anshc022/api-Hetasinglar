const mongoose = require('mongoose');
require('dotenv').config();
const Agent = require('./models/Agent');
const User = require('./models/User');
const AffiliateRegistration = require('./models/AffiliateRegistration');

async function createAffiliateTestData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Enable affiliate capabilities for agent1
    const agent1 = await Agent.findOne({ agentId: 'agent1' });
    if (agent1) {
      agent1.agentType = 'both'; // both chat and affiliate
      agent1.affiliateData = {
        isAffiliate: true,
        commissionRate: 20,
        totalCommissionEarned: 0,
        customersReferred: 0,
        status: 'active'
      };
      await agent1.save();
      console.log('✅ Agent1 updated with affiliate capabilities');
    }

    // Create some test users if they don't exist
    const testUsers = [
      { 
        username: 'testuser1', 
        email: 'testuser1@example.com', 
        coinsBalance: 500,
        sex: 'male',
        dateOfBirth: new Date('1990-01-01')
      },
      { 
        username: 'testuser2', 
        email: 'testuser2@example.com', 
        coinsBalance: 300,
        sex: 'female',
        dateOfBirth: new Date('1995-06-15')
      },
      { 
        username: 'testuser3', 
        email: 'testuser3@example.com', 
        coinsBalance: 200,
        sex: 'male',
        dateOfBirth: new Date('1988-12-20')
      }
    ];

    for (const userData of testUsers) {
      let user = await User.findOne({ 
        $or: [
          { email: userData.email },
          { username: userData.username }
        ]
      });
      if (!user) {
        user = new User({
          username: userData.username,
          email: userData.email,
          password: 'hashedpassword123',
          dateOfBirth: userData.dateOfBirth,
          sex: userData.sex,
          coins: {
            balance: userData.coinsBalance,
            totalPurchased: userData.coinsBalance,
            totalUsed: 0,
            purchaseHistory: [],
            usageHistory: [],
            lastPurchaseDate: new Date()
          },
          credits: userData.coinsBalance, // Legacy field
          status: 'active'
        });
        await user.save();
        console.log(`✅ Created test user: ${userData.username}`);
      } else {
        console.log(`ℹ️  User already exists: ${userData.username}`);
      }
    }

    // Create affiliate registrations
    const users = await User.find({ 
      $or: [
        { email: { $in: testUsers.map(u => u.email) } },
        { username: { $in: testUsers.map(u => u.username) } }
      ]
    });
    
    for (const user of users) {
      // Check if affiliate registration already exists
      const existingReg = await AffiliateRegistration.findOne({
        affiliateAgentId: agent1._id,
        customerId: user._id
      });

      if (!existingReg) {
        const affiliateReg = new AffiliateRegistration({
          affiliateAgentId: agent1._id,
          customerId: user._id,
          registrationSource: 'manual_assignment',
          status: 'active',
          totalCommissionEarned: (user.coins?.balance || 0) * 0.20, // 20% commission
          totalCreditsGenerated: user.coins?.balance || 0,
          customerActivity: {
            isActive: true,
            totalSpent: user.coins?.balance || 0,
            firstPurchaseDate: new Date(),
            lastActivityDate: new Date()
          }
        });
        await affiliateReg.save();
        console.log(`✅ Created affiliate registration for user: ${user.username}`);
      }
    }

    // Update agent1's affiliate stats
    const totalCustomers = await AffiliateRegistration.countDocuments({
      affiliateAgentId: agent1._id
    });

    const totalCommission = await AffiliateRegistration.aggregate([
      { $match: { affiliateAgentId: agent1._id } },
      { $group: { _id: null, total: { $sum: '$totalCommissionEarned' } } }
    ]);

    agent1.affiliateData.customersReferred = totalCustomers;
    agent1.affiliateData.totalCommissionEarned = totalCommission[0]?.total || 0;
    await agent1.save();

    console.log('✅ Affiliate test data created successfully!');
    console.log(`   - Agent1 is now an affiliate agent`);
    console.log(`   - ${totalCustomers} customers referred`);
    console.log(`   - $${(totalCommission[0]?.total || 0).toFixed(2)} total commission`);

  } catch (error) {
    console.error('❌ Error creating affiliate test data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

createAffiliateTestData();
