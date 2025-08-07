const Agent = require('./models/Agent');
const User = require('./models/User');
const mongoose = require('mongoose');

const initializeCommissionSystem = async () => {
  try {
    console.log('Initializing commission and affiliate system...');

    // Update all existing agents to have default commission settings
    const agentsWithoutCommission = await Agent.find({
      $or: [
        { 'commissionSettings': { $exists: false } },
        { 'affiliateData': { $exists: false } },
        { 'earnings': { $exists: false } }
      ]
    });

    for (const agent of agentsWithoutCommission) {
      // Set default commission settings
      if (!agent.commissionSettings) {
        agent.commissionSettings = {
          chatCommissionPercentage: 30,
          affiliateCommissionPercentage: 20,
          customRatesEnabled: false,
          bonusThresholds: []
        };
      }

      // Set default affiliate data
      if (!agent.affiliateData) {
        agent.affiliateData = {
          isAffiliate: false,
          affiliateCode: null,
          totalReferrals: 0,
          activeReferrals: 0,
          referralEarnings: 0,
          conversionRate: 0
        };
      }

      // Set default earnings tracking
      if (!agent.earnings) {
        agent.earnings = {
          totalEarnings: 0,
          pendingEarnings: 0,
          paidEarnings: 0,
          thisMonthEarnings: 0,
          lastMonthEarnings: 0,
          lastPayoutDate: null,
          nextPayoutDate: null
        };
      }

      // Set agent type based on current capabilities
      if (!agent.agentType) {
        agent.agentType = 'chat';
      }

      await agent.save();
      console.log(`Updated agent: ${agent.agentId}`);
    }

    // Update all existing users to have credits system
    const usersWithoutCredits = await User.find({
      $or: [
        { 'credits': { $exists: false } },
        { 'affiliateAgent': { $exists: false } },
        { 'status': { $exists: false } }
      ]
    });

    for (const user of usersWithoutCredits) {
      // Set default credits
      if (!user.credits) {
        user.credits = {
          balance: 0,
          totalPurchased: 0,
          totalUsed: 0,
          lastPurchaseDate: null,
          lastUsageDate: null
        };
      }

      // Set default status
      if (!user.status) {
        user.status = 'active';
      }      // Set default registration source
      if (!user.registrationSource) {
        user.registrationSource = 'direct';
      }

      // Set default sex if not provided (required field)
      if (!user.sex) {
        user.sex = 'male'; // Default value
      }

      await user.save();
      console.log(`Updated user: ${user.username}`);
    }

    console.log('Commission and affiliate system initialization completed!');
    console.log(`Updated ${agentsWithoutCommission.length} agents and ${usersWithoutCredits.length} users`);

  } catch (error) {
    console.error('Error initializing commission system:', error);
  }
};

module.exports = initializeCommissionSystem;
