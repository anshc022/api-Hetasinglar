const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import models
const User = require('./models/User');
const AffiliateLink = require('./models/AffiliateLink');
const Agent = require('./models/Agent');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testAffiliateReferrals() {
  try {
    console.log('Testing affiliate referrals endpoint logic...');

    // Find the first agent (should be the one with affiliate link)
    const agent = await Agent.findOne({});
    if (!agent) {
      console.log('No agents found');
      return;
    }

    console.log('Using agent:', agent.username, agent._id);

    // Get all affiliate links ever created by this agent (active and inactive)
    const affiliateLinks = await AffiliateLink.find({ agentId: agent._id });
    console.log('Found affiliate links:', affiliateLinks.length);

    if (affiliateLinks.length === 0) {
      console.log('No affiliate links found for agent');
      return;
    }

    // Get all affiliate codes ever used by this agent
    const affiliateCodes = affiliateLinks.map(link => link.affiliateCode);
    console.log('Affiliate codes:', affiliateCodes);

    // Get users who joined through any of this agent's affiliate codes
    const referrals = await User.find({ 
      'referral.affiliateCode': { $in: affiliateCodes }
    }).select('username email createdAt totalCoinsUsed lastActive referral').sort({ createdAt: -1 });

    console.log('Found referrals:', referrals.length);

    // Map referrals with affiliate link information
    const referralsWithLinkInfo = referrals.map(user => {
      const affiliateCode = user.referral?.affiliateCode;
      const affiliateLink = affiliateLinks.find(link => link.affiliateCode === affiliateCode);
      
      return {
        id: user._id,
        username: user.username,
        email: user.email,
        joinedDate: user.createdAt,
        totalCoinsUsed: user.totalCoinsUsed || 0,
        lastActive: user.lastActive,
        isActive: user.lastActive && new Date() - new Date(user.lastActive) < 30 * 24 * 60 * 60 * 1000, // Active in last 30 days
        affiliateCode: affiliateCode,
        linkStatus: affiliateLink ? (affiliateLink.isActive ? 'Active' : 'Revoked') : 'Unknown',
        linkCreatedDate: affiliateLink?.createdAt
      };
    });

    console.log('Processed referrals with link info:');
    referralsWithLinkInfo.forEach(ref => {
      console.log(`- ${ref.username} (${ref.email}) - Affiliate: ${ref.affiliateCode} - Status: ${ref.linkStatus}`);
    });

    const result = { 
      referrals: referralsWithLinkInfo,
      totalAffiliateLinks: affiliateLinks.length,
      activeLinks: affiliateLinks.filter(link => link.isActive).length,
      revokedLinks: affiliateLinks.filter(link => !link.isActive).length
    };

    console.log('Final result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

testAffiliateReferrals();
