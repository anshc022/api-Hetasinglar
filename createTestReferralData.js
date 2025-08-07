const mongoose = require('mongoose');
const User = require('./models/User');
const AffiliateLink = require('./models/AffiliateLink');
const Agent = require('./models/Agent');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function createTestReferralData() {
  try {
    console.log('Creating test referral data...');

    // Find any agent to use for testing
    const agent = await Agent.findOne({});
    if (!agent) {
      console.log('No agents found. Please create an agent first.');
      return;
    }

    console.log('Using agent:', agent.username);

    // Find or create an affiliate link for this agent
    let affiliateLink = await AffiliateLink.findOne({ agentId: agent._id });
    
    if (!affiliateLink) {
      // Generate a random 8-character affiliate code
      const generateAffiliateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      affiliateLink = new AffiliateLink({
        agentId: agent._id,
        affiliateCode: generateAffiliateCode(),
        link: `http://localhost:8000/?ref=${generateAffiliateCode()}`,
        isActive: true,
        clicks: 0,
        conversions: 0
      });
      await affiliateLink.save();
      console.log('Created affiliate link:', affiliateLink.affiliateCode);
    } else {
      console.log('Using existing affiliate link:', affiliateLink.affiliateCode);
    }

    // Create test users with referral data
    const testUsers = [
      {
        username: 'testuser1',
        email: 'testuser1@example.com',
        password: 'password123',
        full_name: 'Test User One',
        totalCoinsUsed: 150,
        referral: {
          affiliateCode: affiliateLink.affiliateCode,
          referredBy: agent._id,
          referredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
        },
        lastActive: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      },
      {
        username: 'testuser2',
        email: 'testuser2@example.com',
        password: 'password123',
        full_name: 'Test User Two',
        totalCoinsUsed: 300,
        referral: {
          affiliateCode: affiliateLink.affiliateCode,
          referredBy: agent._id,
          referredAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
        },
        lastActive: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      },
      {
        username: 'testuser3',
        email: 'testuser3@example.com',
        password: 'password123',
        full_name: 'Test User Three',
        totalCoinsUsed: 75,
        referral: {
          affiliateCode: affiliateLink.affiliateCode,
          referredBy: agent._id,
          referredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
        },
        lastActive: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      }
    ];

    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ 
        $or: [
          { username: userData.username },
          { email: userData.email }
        ]
      });

      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        console.log(`Created test user: ${userData.username}`);
      } else {
        // Update existing user with referral data if they don't have it
        if (!existingUser.referral || !existingUser.referral.affiliateCode) {
          existingUser.referral = userData.referral;
          existingUser.totalCoinsUsed = userData.totalCoinsUsed;
          existingUser.lastActive = userData.lastActive;
          await existingUser.save();
          console.log(`Updated existing user with referral data: ${userData.username}`);
        } else {
          console.log(`User already exists with referral data: ${userData.username}`);
        }
      }
    }

    // Update affiliate link stats
    const referralCount = await User.countDocuments({ 
      'referral.affiliateCode': affiliateLink.affiliateCode 
    });
    
    affiliateLink.conversions = referralCount;
    affiliateLink.clicks = referralCount * 2; // Simulate some clicks that didn't convert
    await affiliateLink.save();

    console.log('Test referral data created successfully!');
    console.log(`Affiliate link: ${affiliateLink.link}`);
    console.log(`Total referrals: ${referralCount}`);

  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    mongoose.disconnect();
  }
}

createTestReferralData();
