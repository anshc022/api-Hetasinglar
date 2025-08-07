const mongoose = require('mongoose');
const AffiliateRegistration = require('./models/AffiliateRegistration');
require('dotenv').config();

async function fixAffiliateData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Update all affiliate registrations to fix field names
    const registrations = await AffiliateRegistration.find({});
    console.log(`Found ${registrations.length} affiliate registrations`);

    for (const reg of registrations) {
      const updates = {};
      
      // Add missing fields that the aggregation expects
      if (reg.totalCreditsGenerated && !reg.totalCoins) {
        updates.totalCoins = reg.totalCreditsGenerated;
      }
      
      if (reg.totalCommissionEarned && !reg.totalCommission) {
        updates.totalCommission = reg.totalCommissionEarned;
      }

      if (Object.keys(updates).length > 0) {
        await AffiliateRegistration.findByIdAndUpdate(reg._id, updates);
        console.log(`✅ Updated registration ${reg._id} with:`, updates);
      }
    }

    console.log('✅ Affiliate data fix completed!');

  } catch (error) {
    console.error('❌ Error fixing affiliate data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

fixAffiliateData();
