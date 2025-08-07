const mongoose = require('mongoose');
const AffiliateRegistration = require('./models/AffiliateRegistration');
require('dotenv').config();

async function inspectAffiliateData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Get raw data
    const registrations = await AffiliateRegistration.find({}).limit(2);
    console.log('\nRaw affiliate registrations:');
    registrations.forEach((reg, index) => {
      console.log(`\nRegistration ${index + 1}:`);
      console.log('totalCoins:', reg.totalCoins);
      console.log('totalCommission:', reg.totalCommission);
      console.log('totalCreditsGenerated:', reg.totalCreditsGenerated);
      console.log('totalCommissionEarned:', reg.totalCommissionEarned);
      console.log('status:', reg.status);
    });

    // Test the aggregation step by step
    console.log('\n=== Testing aggregation ===');
    const result = await AffiliateRegistration.aggregate([
      {
        $lookup: {
          from: 'agents',
          localField: 'affiliateAgentId',
          foreignField: '_id',
          as: 'affiliateAgent'
        }
      },
      {
        $unwind: '$affiliateAgent'
      },
      {
        $group: {
          _id: '$affiliateAgentId',
          affiliateAgent: { $first: '$affiliateAgent' },
          assignedCustomers: { $sum: 1 },
          totalCoinsGenerated: { $sum: '$totalCreditsGenerated' },
          totalCommissionEarned: { $sum: '$totalCommissionEarned' },
          rawData: { $push: { totalCreditsGenerated: '$totalCreditsGenerated', totalCommissionEarned: '$totalCommissionEarned' } }
        }
      }
    ]);

    console.log('Aggregation result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Error inspecting affiliate data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

inspectAffiliateData();
