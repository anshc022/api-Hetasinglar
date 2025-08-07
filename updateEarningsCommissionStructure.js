const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const earningsSchema = new mongoose.Schema({}, { strict: false });
const Earnings = mongoose.model('Earnings', earningsSchema);

async function updateEarningsCommissionStructure() {
  try {
    console.log('🔄 Starting commission structure migration...');
    
    // Get all earnings records
    const earnings = await Earnings.find({});
    console.log(`📊 Found ${earnings.length} earnings records to update`);
    
    let updated = 0;
    
    for (const earning of earnings) {
      let needsUpdate = false;
      const updateFields = {};
      
      // Ensure coinsUsed is set (prefer coinsUsed over creditsUsed)
      if (!earning.coinsUsed && earning.creditsUsed) {
        updateFields.coinsUsed = earning.creditsUsed;
        needsUpdate = true;
      } else if (!earning.coinsUsed) {
        updateFields.coinsUsed = 0;
        needsUpdate = true;
      }
      
      // Ensure coinValue is set
      if (!earning.coinValue) {
        updateFields.coinValue = earning.costPerCredit || 1.0;
        needsUpdate = true;
      }
      
      // Ensure totalAmount is set
      if (!earning.totalAmount) {
        updateFields.totalAmount = (earning.coinsUsed || earning.creditsUsed || 0) * (earning.coinValue || 1.0);
        needsUpdate = true;
      }
      
      // Standardize commission structure - extract values first
      let agentCommissionAmount = 0;
      let agentCommissionPercentage = 30;
      let affiliateCommissionAmount = 0;
      let affiliateCommissionPercentage = 20;
      let adminCommissionAmount = 0;
      let adminCommissionPercentage = 50;
      
      const totalAmount = updateFields.totalAmount || earning.totalAmount || 0;
      
      if (earning.chatAgentCommission && earning.chatAgentCommission.amount) {
        agentCommissionAmount = earning.chatAgentCommission.amount;
        agentCommissionPercentage = earning.chatAgentCommission.percentage || 30;
      } else if (!earning.agentCommission) {
        agentCommissionAmount = totalAmount * 0.30;
      }
      
      if (earning.affiliateCommission && typeof earning.affiliateCommission === 'object' && earning.affiliateCommission.amount) {
        affiliateCommissionAmount = earning.affiliateCommission.amount;
        affiliateCommissionPercentage = earning.affiliateCommission.percentage || 20;
      } else if (earning.affiliateAgentId && (typeof earning.affiliateCommission !== 'number')) {
        affiliateCommissionAmount = totalAmount * 0.20;
      }
      
      if (earning.adminCommission && typeof earning.adminCommission === 'object' && earning.adminCommission.amount) {
        adminCommissionAmount = earning.adminCommission.amount;
        adminCommissionPercentage = earning.adminCommission.percentage || 50;
      } else if (typeof earning.adminCommission !== 'number') {
        adminCommissionAmount = totalAmount * 0.50;
      }
      
      // Set the new field values
      if (agentCommissionAmount > 0 || !earning.agentCommission) {
        updateFields.agentCommission = agentCommissionAmount;
        updateFields.agentCommissionPercentage = agentCommissionPercentage;
        needsUpdate = true;
      }
      
      if (affiliateCommissionAmount > 0 || (earning.affiliateAgentId && typeof earning.affiliateCommission !== 'number')) {
        updateFields.affiliateCommission = affiliateCommissionAmount;
        updateFields.affiliateCommissionPercentage = affiliateCommissionPercentage;
        needsUpdate = true;
      }
      
      if (adminCommissionAmount > 0 || typeof earning.adminCommission !== 'number') {
        updateFields.adminCommission = adminCommissionAmount;
        updateFields.adminCommissionPercentage = adminCommissionPercentage;
        needsUpdate = true;
      }
      
      // Remove legacy fields only if they are objects (not if they're already numbers)
      const unsetFields = {};
      if (earning.creditsUsed !== undefined) {
        unsetFields.creditsUsed = "";
      }
      if (earning.costPerCredit !== undefined) {
        unsetFields.costPerCredit = "";
      }
      if (earning.chatAgentCommission !== undefined) {
        unsetFields.chatAgentCommission = "";
      }
      if (earning.affiliateCommission !== undefined && typeof earning.affiliateCommission === 'object') {
        unsetFields['affiliateCommission'] = "";
        needsUpdate = true;
      }
      if (earning.adminCommission !== undefined && typeof earning.adminCommission === 'object') {
        unsetFields['adminCommission'] = "";
        needsUpdate = true;
      }
      
      if (needsUpdate || Object.keys(unsetFields).length > 0) {
        // First, remove legacy fields if needed
        if (Object.keys(unsetFields).length > 0) {
          await Earnings.updateOne({ _id: earning._id }, { $unset: unsetFields });
        }
        
        // Then, set new field values if needed
        if (Object.keys(updateFields).length > 0) {
          await Earnings.updateOne({ _id: earning._id }, { $set: updateFields });
        }
        
        updated++;
        
        if (updated % 10 === 0) {
          console.log(`✅ Updated ${updated}/${earnings.length} records...`);
        }
      }
    }
    
    console.log(`🎉 Commission structure migration completed!`);
    console.log(`📈 Updated ${updated} out of ${earnings.length} earnings records`);
    
    // Verify the update
    const sampleEarning = await Earnings.findOne({});
    if (sampleEarning) {
      console.log('\n📋 Sample updated earning record:');
      console.log('- Coins Used:', sampleEarning.coinsUsed);
      console.log('- Coin Value:', sampleEarning.coinValue);
      console.log('- Total Amount:', sampleEarning.totalAmount);
      console.log('- Agent Commission:', sampleEarning.agentCommission, `(${sampleEarning.agentCommissionPercentage}%)`);
      console.log('- Affiliate Commission:', sampleEarning.affiliateCommission, `(${sampleEarning.affiliateCommissionPercentage}%)`);
      console.log('- Admin Commission:', sampleEarning.adminCommission, `(${sampleEarning.adminCommissionPercentage}%)`);
    }
    
  } catch (error) {
    console.error('❌ Error updating commission structure:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
updateEarningsCommissionStructure();
