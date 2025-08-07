const mongoose = require('mongoose');
const Agent = require('./models/Agent');
const User = require('./models/User');
const Earnings = require('./models/Earnings');
const AffiliateRegistration = require('./models/AffiliateRegistration');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function fixAffiliateCustomerData() {
  try {
    console.log('Starting affiliate customer data fix...');

    // Get the agent (agent1 / ansh)
    const agent = await Agent.findOne({ agentId: 'agent1' });
    if (!agent) {
      console.log('Agent not found!');
      return;
    }

    console.log(`Found agent: ${agent.name} (${agent.agentId})`);
    console.log(`Agent ID: ${agent._id}`);

    // Find all earnings for this affiliate agent
    const earnings = await Earnings.find({ affiliateAgentId: agent._id })
      .populate('userId', 'username email')
      .sort({ transactionDate: -1 });

    console.log(`Found ${earnings.length} earnings records for this affiliate agent`);

    if (earnings.length === 0) {
      console.log('No earnings found. Nothing to fix.');
      return;
    }

    // Group earnings by customer
    const customerData = {};
    
    earnings.forEach(earning => {
      if (!earning.userId) {
        console.log('Warning: Found earning without userId:', earning._id);
        return;
      }

      const customerId = earning.userId._id.toString();
      
      if (!customerData[customerId]) {
        customerData[customerId] = {
          userId: earning.userId,
          totalCommissionEarned: 0,
          totalTransactions: 0,
          totalCreditsGenerated: 0,
          totalSpent: 0,
          firstPurchaseDate: earning.transactionDate,
          lastPurchaseDate: earning.transactionDate,
          earnings: []
        };
      }

      customerData[customerId].totalCommissionEarned += earning.affiliateCommission.amount;
      customerData[customerId].totalTransactions += 1;
      customerData[customerId].totalCreditsGenerated += earning.creditsUsed || earning.coinsUsed || 0;
      customerData[customerId].totalSpent += earning.totalAmount;
      
      // Update date ranges
      if (earning.transactionDate < customerData[customerId].firstPurchaseDate) {
        customerData[customerId].firstPurchaseDate = earning.transactionDate;
      }
      if (earning.transactionDate > customerData[customerId].lastPurchaseDate) {
        customerData[customerId].lastPurchaseDate = earning.transactionDate;
      }
      
      customerData[customerId].earnings.push(earning);
    });

    console.log(`\nFound ${Object.keys(customerData).length} unique customers:`);
    
    // Create or update affiliate registrations
    for (const [customerId, data] of Object.entries(customerData)) {
      console.log(`\nProcessing customer: ${data.userId.username} (${customerId})`);
      console.log(`  - Total Commission: $${data.totalCommissionEarned.toFixed(2)}`);
      console.log(`  - Total Transactions: ${data.totalTransactions}`);
      console.log(`  - Total Credits: ${data.totalCreditsGenerated}`);
      console.log(`  - Total Spent: $${data.totalSpent.toFixed(2)}`);

      // Check if affiliate registration already exists
      let registration = await AffiliateRegistration.findOne({
        affiliateAgentId: agent._id,
        customerId: customerId
      });

      if (registration) {
        console.log(`  - Updating existing registration...`);
        
        // Update existing registration
        registration.totalCommissionEarned = data.totalCommissionEarned;
        registration.totalTransactions = data.totalTransactions;
        registration.totalCreditsGenerated = data.totalCreditsGenerated;
        registration.customerActivity.totalSpent = data.totalSpent;
        registration.customerActivity.firstPurchaseDate = data.firstPurchaseDate;
        registration.customerActivity.lastPurchaseDate = data.lastPurchaseDate;
        registration.customerActivity.lastActivityDate = data.lastPurchaseDate;
        registration.customerActivity.isActive = true;
        
        // Calculate metrics
        const daysSinceRegistration = Math.ceil((new Date() - registration.registrationDate) / (1000 * 60 * 60 * 24));
        if (data.totalTransactions > 0 && daysSinceRegistration > 0) {
          registration.metrics.conversionRate = Math.min(100, (data.totalTransactions / daysSinceRegistration) * 100);
          registration.metrics.averageOrderValue = data.totalSpent / data.totalTransactions;
          registration.metrics.customerLifetimeValue = data.totalSpent;
        }
        
        const daysSinceLastActivity = Math.ceil((new Date() - data.lastPurchaseDate) / (1000 * 60 * 60 * 24));
        registration.metrics.retentionRate = daysSinceLastActivity <= 30 ? 100 : Math.max(0, 100 - daysSinceLastActivity);
        
        await registration.save();
        console.log(`  - Registration updated successfully`);
        
      } else {
        console.log(`  - Creating new registration...`);
        
        // Create new registration
        registration = new AffiliateRegistration({
          affiliateAgentId: agent._id,
          customerId: customerId,
          registrationSource: 'manual_assignment',
          status: 'active',
          totalCommissionEarned: data.totalCommissionEarned,
          totalTransactions: data.totalTransactions,
          totalCreditsGenerated: data.totalCreditsGenerated,
          customerActivity: {
            firstPurchaseDate: data.firstPurchaseDate,
            lastPurchaseDate: data.lastPurchaseDate,
            totalSpent: data.totalSpent,
            isActive: true,
            lastActivityDate: data.lastPurchaseDate
          },
          registrationDate: data.firstPurchaseDate, // Use first purchase as registration date
          activationDate: data.firstPurchaseDate
        });

        // Calculate metrics
        const daysSinceRegistration = Math.ceil((new Date() - data.firstPurchaseDate) / (1000 * 60 * 60 * 24));
        if (data.totalTransactions > 0 && daysSinceRegistration > 0) {
          registration.metrics.conversionRate = Math.min(100, (data.totalTransactions / daysSinceRegistration) * 100);
          registration.metrics.averageOrderValue = data.totalSpent / data.totalTransactions;
          registration.metrics.customerLifetimeValue = data.totalSpent;
        }
        
        const daysSinceLastActivity = Math.ceil((new Date() - data.lastPurchaseDate) / (1000 * 60 * 60 * 24));
        registration.metrics.retentionRate = daysSinceLastActivity <= 30 ? 100 : Math.max(0, 100 - daysSinceLastActivity);

        await registration.save();
        console.log(`  - Registration created successfully`);
      }
    }

    // Verify the fix by getting updated stats
    console.log('\n=== VERIFICATION ===');
    const affiliateStats = await AffiliateRegistration.getAffiliateStats(agent._id);
    console.log('Updated affiliate stats:', affiliateStats[0] || 'No stats found');

    const affiliateCustomers = await AffiliateRegistration.getAffiliateCustomers(agent._id, { limit: 100 });
    console.log(`Total affiliate customers: ${affiliateCustomers.length}`);

    console.log('\nAffiliate customer data fix completed successfully!');

  } catch (error) {
    console.error('Error fixing affiliate customer data:', error);
  } finally {
    mongoose.connection.close();
  }
}

fixAffiliateCustomerData();
