const mongoose = require('mongoose');
const Earnings = require('./models/Earnings');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hetasinglar', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const updateAllEarningsToCoins = async () => {
  try {
    console.log('Starting earnings update to coin-based system...');
    
    // Get all earnings records
    const allEarnings = await Earnings.find({});
    console.log(`Found ${allEarnings.length} earnings records to update`);
    
    let updated = 0;
    let errors = 0;
    
    for (const earning of allEarnings) {
      try {
        let needsUpdate = false;
        
        // Ensure coinsUsed is set (use creditsUsed as fallback if needed)
        if (!earning.coinsUsed && earning.creditsUsed) {
          earning.coinsUsed = earning.creditsUsed;
          needsUpdate = true;
        }
        
        // Ensure coinValue is set
        if (!earning.coinValue) {
          earning.coinValue = 1.0; // $1 per coin
          needsUpdate = true;
        }
        
        // Calculate totalAmount if not set
        if (!earning.totalAmount || earning.totalAmount === 0) {
          earning.totalAmount = earning.coinsUsed * earning.coinValue;
          needsUpdate = true;
        }
        
        // Update commission structure - migrate from old field names to new ones
        if (earning.chatAgentCommission && !earning.agentCommission) {
          earning.agentCommission = {
            percentage: 30,
            amount: earning.chatAgentCommission.amount || 0
          };
          needsUpdate = true;
        }
        
        // Ensure all commission objects exist with correct structure
        if (!earning.agentCommission) {
          earning.agentCommission = {
            percentage: 30,
            amount: (earning.totalAmount * 30) / 100
          };
          needsUpdate = true;
        }
        
        if (!earning.affiliateCommission) {
          const hasAffiliate = !!earning.affiliateAgentId;
          earning.affiliateCommission = {
            percentage: hasAffiliate ? 20 : 0,
            amount: hasAffiliate ? (earning.totalAmount * 20) / 100 : 0
          };
          needsUpdate = true;
        }
        
        if (!earning.adminCommission) {
          const hasAffiliate = !!earning.affiliateAgentId;
          const adminPerc = hasAffiliate ? 50 : 70;
          earning.adminCommission = {
            percentage: adminPerc,
            amount: (earning.totalAmount * adminPerc) / 100
          };
          needsUpdate = true;
        }
        
        // Remove old creditsUsed and costPerCredit fields
        if (earning.creditsUsed !== undefined) {
          earning.creditsUsed = undefined;
          needsUpdate = true;
        }
        if (earning.costPerCredit !== undefined) {
          earning.costPerCredit = undefined;
          needsUpdate = true;
        }
        
        // Remove old chatAgentCommission field if it exists
        if (earning.chatAgentCommission !== undefined) {
          earning.chatAgentCommission = undefined;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          // Save without triggering pre-save middleware to avoid recalculation
          await Earnings.findByIdAndUpdate(earning._id, {
            coinsUsed: earning.coinsUsed,
            coinValue: earning.coinValue,
            totalAmount: earning.totalAmount,
            agentCommission: earning.agentCommission,
            affiliateCommission: earning.affiliateCommission,
            adminCommission: earning.adminCommission,
            $unset: { 
              creditsUsed: "",
              costPerCredit: "",
              chatAgentCommission: ""
            }
          });
          updated++;
        }
        
        if (updated % 50 === 0) {
          console.log(`Updated ${updated} records so far...`);
        }
        
      } catch (error) {
        console.error(`Error updating earning ${earning._id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n✅ Update completed!`);
    console.log(`📊 Total records processed: ${allEarnings.length}`);
    console.log(`✅ Successfully updated: ${updated}`);
    console.log(`❌ Errors: ${errors}`);
    
    // Verify the updates
    console.log('\n🔍 Verifying updates...');
    const updatedCount = await Earnings.countDocuments({ 
      coinsUsed: { $exists: true, $gt: 0 },
      'agentCommission.amount': { $exists: true }
    });
    console.log(`✅ Records with proper coin structure: ${updatedCount}`);
    
    const withCredits = await Earnings.countDocuments({ creditsUsed: { $exists: true } });
    console.log(`📋 Records still with old creditsUsed field: ${withCredits}`);
    
  } catch (error) {
    console.error('Error during earnings update:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the update
updateAllEarningsToCoins();
