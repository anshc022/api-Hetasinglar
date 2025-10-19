const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const AffiliateRegistration = require('../models/AffiliateRegistration');
const AffiliateLink = require('../models/AffiliateLink');
const Earnings = require('../models/Earnings');
const User = require('../models/User');
const { adminAuth, agentAuth } = require('../auth');

// Use a consistent frontend URL (avoid localhost in production)
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://hetasinglar.se').replace(/\/$/, '');


// Get affiliate dashboard data for agent
router.get('/dashboard/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;

    if (!req.agent) {
      return res.status(403).json({ error: 'Access denied: Agent not authenticated.' });
    }

    // An agent can see their own dashboard, or a manager can see any dashboard.
    if (req.agent._id.toString() !== agentId && req.agent.role !== 'manager') {
      return res.status(403).json({ error: 'Access denied: You can only view your own affiliate data.' });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if agent has affiliate capabilities
    if (!agent.affiliateData.isAffiliate && agent.agentType !== 'affiliate' && agent.agentType !== 'both') {
      return res.status(403).json({ 
        error: 'Access denied: Agent does not have affiliate capabilities.',
        agentType: agent.agentType,
        isAffiliate: agent.affiliateData.isAffiliate
      });
    }

    // Get affiliate customers
    const affiliateCustomers = await AffiliateRegistration.getAffiliateCustomers(agentId, {
      status: 'active',
      limit: 100
    });

    // Get affiliate stats
    const affiliateStats = await AffiliateRegistration.getAffiliateStats(agentId);

    // Get earnings for current month
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    
    const monthlyEarnings = await Earnings.getAffiliateEarnings(
      agentId,
      currentMonth.toISOString(),
      null
    );

    // Get recent earnings
    const recentEarnings = await Earnings.find({ affiliateAgentId: agentId })
      .populate('userId', 'username email')
      .populate('agentId', 'agentId name')
      .sort({ transactionDate: -1 })
      .limit(10);

    res.json({
      agent: {
        agentId: agent.agentId,
        name: agent.name,
        affiliateData: agent.affiliateData,
        earnings: agent.earnings
      },
      customers: affiliateCustomers,
      stats: affiliateStats[0] || {
        totalCustomers: 0,
        activeCustomers: 0,
        totalCommission: 0,
        totalTransactions: 0,
        totalCoins: 0,
        averageCommissionPerCustomer: 0,
        averageTransactionsPerCustomer: 0
      },
      monthlyEarnings: monthlyEarnings[0] || {
        totalEarnings: 0,
        totalTransactions: 0,
        totalCoinsUsed: 0,
        averagePerTransaction: 0
      },
      recentEarnings
    });

  } catch (error) {
    console.error('Error fetching affiliate dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate dashboard' });
  }
});

// Get affiliate commission stats
router.get('/commission-stats/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { startDate, endDate, period = 'month' } = req.query;

    if (!req.agent) {
      return res.status(403).json({ error: 'Access denied: Agent not authenticated.' });
    }
    // Check if user can access this agent's data
    if (req.agent._id.toString() !== agentId && req.agent.role !== 'manager') {
      return res.status(403).json({ error: 'Access denied: You can only view your own commission stats.' });
    }

    // Calculate date range based on period
    let start, end;
    const now = new Date();
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      switch (period) {
        case 'week':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          const quarter = Math.floor(now.getMonth() / 3);
          start = new Date(now.getFullYear(), quarter * 3, 1);
          break;
        case 'year':
          start = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      end = now;
    }

    // Get earnings data
    const earnings = await Earnings.find({
      affiliateAgentId: agentId,
      transactionDate: { $gte: start, $lte: end }
    }).populate('userId', 'username email');

    // Calculate stats
    const stats = {
      totalEarnings: earnings.reduce((sum, e) => sum + e.affiliateCommission.amount, 0),
      totalTransactions: earnings.length,
      totalCoinsGenerated: earnings.reduce((sum, e) => sum + (e.coinsUsed || 0), 0),
      averagePerTransaction: 0,
      topCustomers: [],
      earningsTimeline: []
    };

    if (stats.totalTransactions > 0) {
      stats.averagePerTransaction = stats.totalEarnings / stats.totalTransactions;
    }

    // Calculate top customers
    const customerEarnings = {};
    earnings.forEach(earning => {
      const customerId = earning.userId._id.toString();
      if (!customerEarnings[customerId]) {
        customerEarnings[customerId] = {
          customer: earning.userId,
          totalEarnings: 0,
          totalTransactions: 0,
          totalCoins: 0
        };
      }
      customerEarnings[customerId].totalEarnings += earning.affiliateCommission.amount;
      customerEarnings[customerId].totalTransactions += 1;
      customerEarnings[customerId].totalCoins += earning.coinsUsed || 0;
    });

    stats.topCustomers = Object.values(customerEarnings)
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 10);

    // Create earnings timeline (daily breakdown)
    const timelineMap = {};
    earnings.forEach(earning => {
      const date = earning.transactionDate.toISOString().split('T')[0];
      if (!timelineMap[date]) {
        timelineMap[date] = {
          date,
          earnings: 0,
          transactions: 0,
          credits: 0
        };
      }
      timelineMap[date].earnings += earning.affiliateCommission.amount;
      timelineMap[date].transactions += 1;
      timelineMap[date].coins += earning.coinsUsed || 0;
    });

    stats.earningsTimeline = Object.values(timelineMap).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    res.json({
      stats,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        type: period
      }
    });

  } catch (error) {
    console.error('Error fetching commission stats:', error);
    res.status(500).json({ error: 'Failed to fetch commission stats' });
  }
});

// Get affiliate customer list
router.get('/customers/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { status, search, page = 1, limit = 20 } = req.query;

    if (!req.agent) {
      return res.status(403).json({ error: 'Access denied: Agent not authenticated.' });
    }
    // Check if user can access this agent's data
    if (req.agent._id.toString() !== agentId && req.agent.role !== 'manager') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const options = {
      status,
      limit: parseInt(limit)
    };

    let customers = await AffiliateRegistration.getAffiliateCustomers(agentId, options);

    // Filter out registrations with missing customerId
    customers = customers.filter(reg => reg.customerId && reg.customerId.username && reg.customerId.email);

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(reg => 
        reg.customerId && (
          reg.customerId.username.toLowerCase().includes(searchLower) ||
          reg.customerId.email.toLowerCase().includes(searchLower)
        )
      );
    }

    // Get pagination info
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedCustomers = customers.slice(skip, skip + parseInt(limit));

    // Get recent activities for these customers
    const customerIds = paginatedCustomers.map(reg => reg.customerId?._id).filter(Boolean);
    const recentEarnings = await Earnings.find({
      userId: { $in: customerIds },
      affiliateAgentId: agentId
    })
    .sort({ transactionDate: -1 })
    .limit(50)
    .populate('userId', 'username');

    // Group earnings by customer
    const customerEarnings = {};
    recentEarnings.forEach(earning => {
      const customerId = earning.userId?._id?.toString();
      if (!customerId) return;
      if (!customerEarnings[customerId]) {
        customerEarnings[customerId] = [];
      }
      customerEarnings[customerId].push(earning);
    });

    // Add recent earnings to customer data
    const customersWithEarnings = paginatedCustomers.map(reg => ({
      ...reg.toObject(),
      recentEarnings: customerEarnings[reg.customerId?._id?.toString()] || []
    }));

    res.json({
      customers: customersWithEarnings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: customers.length,
        pages: Math.ceil(customers.length / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching affiliate customers:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate customers' });
  }
});

// Get customer details for affiliate agent
router.get('/customer/:customerId/details', agentAuth, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { agentId } = req.query;

    if (!req.agent) {
      return res.status(403).json({ error: 'Access denied: Agent not authenticated.' });
    }
    // Check if user can access this data
    if (req.agent._id.toString() !== agentId && req.agent.role !== 'manager') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get affiliate registration
    const registration = await AffiliateRegistration.findOne({
      affiliateAgentId: agentId,
      customerId
    }).populate('customerId', 'username email dateOfBirth sex credits status lastActiveDate');

    if (!registration) {
      return res.status(404).json({ error: 'Customer not found in your affiliate network' });
    }

    // Get customer's earnings history
    const earnings = await Earnings.find({
      userId: customerId,
      affiliateAgentId: agentId
    })
    .populate('agentId', 'agentId name')
    .sort({ transactionDate: -1 })
    .limit(50);

    // Calculate customer stats
    const stats = {
      totalSpent: registration.customerActivity.totalSpent,
      totalCommissionEarned: registration.totalCommissionEarned,
      totalTransactions: registration.totalTransactions,
      totalCreditsUsed: registration.totalCreditsGenerated,
      firstPurchaseDate: registration.customerActivity.firstPurchaseDate,
      lastPurchaseDate: registration.customerActivity.lastPurchaseDate,
      isActive: registration.customerActivity.isActive,
      averageOrderValue: registration.totalTransactions > 0 ? 
        registration.customerActivity.totalSpent / registration.totalTransactions : 0,
      conversionRate: registration.metrics.conversionRate,
      retentionRate: registration.metrics.retentionRate
    };

    res.json({
      customer: registration.customerId,
      registration,
      earnings,
      stats
    });

  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// ======================
// ADMIN AFFILIATE MANAGEMENT
// ======================

// Get all affiliate links (admin view)
router.get('/admin/affiliate-links', adminAuth, async (req, res) => {
  try {
    const affiliateLinks = await AffiliateLink.find()
      .populate('agentId', 'agentId name email')
      .sort({ createdAt: -1 });

    const linksWithStats = await Promise.all(
      affiliateLinks.map(async (link) => {
        // Get referral count for this link
        const referralCount = await User.countDocuments({
          'referral.affiliateCode': link.affiliateCode
        });

        return {
          _id: link._id,
          affiliateCode: link.affiliateCode,
          agent: link.agentId,
          isActive: link.isActive,
          createdAt: link.createdAt,
          clickCount: link.clickCount || 0,
          registrationCount: referralCount,
          link: `${FRONTEND_URL}/register?ref=${link.affiliateCode}`
        };
      })
    );

    res.json({
      success: true,
      links: linksWithStats,
      totalLinks: linksWithStats.length,
      activeLinks: linksWithStats.filter(link => link.isActive).length,
      totalClicks: linksWithStats.reduce((sum, link) => sum + link.clickCount, 0),
      totalRegistrations: linksWithStats.reduce((sum, link) => sum + link.registrationCount, 0)
    });

  } catch (error) {
    console.error('Error fetching affiliate links:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate links' });
  }
});

// Get all affiliate referrals (admin view)
router.get('/admin/affiliate-referrals', adminAuth, async (req, res) => {
  try {
    const referrals = await User.find({
      'referral.affiliateCode': { $exists: true, $ne: null }
    })
    .select('username email createdAt totalCoinsUsed lastActive referral')
    .populate({
      path: 'referral.affiliateCode',
      select: 'agentId',
      populate: {
        path: 'agentId',
        select: 'agentId name',
        model: 'Agent'
      }
    })
    .sort({ createdAt: -1 });

    // Get affiliate link for each referral to find the agent
    const referralsWithAgent = await Promise.all(
      referrals.map(async (user) => {
        const affiliateLink = await AffiliateLink.findOne({
          affiliateCode: user.referral?.affiliateCode
        }).populate('agentId', 'agentId name');

        return {
          _id: user._id,
          username: user.username,
          email: user.email,
          joinedDate: user.createdAt,
          totalCoinsUsed: user.totalCoinsUsed || 0,
          lastActive: user.lastActive,
          isActive: user.lastActive && new Date() - new Date(user.lastActive) < 30 * 24 * 60 * 60 * 1000,
          affiliateCode: user.referral?.affiliateCode,
          referredBy: affiliateLink?.agentId || null
        };
      })
    );

    res.json({
      success: true,
      referrals: referralsWithAgent.filter(ref => ref.referredBy), // Only include referrals with valid agents
      totalReferrals: referralsWithAgent.filter(ref => ref.referredBy).length,
      activeReferrals: referralsWithAgent.filter(ref => ref.referredBy && ref.isActive).length,
      totalCoinsUsed: referralsWithAgent.reduce((sum, ref) => sum + (ref.totalCoinsUsed || 0), 0)
    });

  } catch (error) {
    console.error('Error fetching affiliate referrals:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate referrals' });
  }
});

// Enable/disable affiliate status for agent
router.put('/agent/:agentId/affiliate-status', adminAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { isAffiliate, affiliateCommissionPercentage } = req.body;

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    agent.affiliateData.isAffiliate = isAffiliate;
    
    if (affiliateCommissionPercentage !== undefined) {
      agent.commissionSettings.affiliateCommissionPercentage = affiliateCommissionPercentage;
    }

    // Update agent type based on capabilities
    if (isAffiliate && agent.permissions.canMessage) {
      agent.agentType = 'both';
    } else if (isAffiliate) {
      agent.agentType = 'affiliate';
    } else {
      agent.agentType = 'chat';
    }

    await agent.save();

    res.json({
      success: true,
      agent: {
        agentId: agent.agentId,
        name: agent.name,
        agentType: agent.agentType,
        affiliateData: agent.affiliateData,
        commissionSettings: agent.commissionSettings
      },
      message: `Affiliate status ${isAffiliate ? 'enabled' : 'disabled'} for agent`
    });

  } catch (error) {
    console.error('Error updating affiliate status:', error);
    res.status(500).json({ error: 'Failed to update affiliate status' });
  }
});

// Get all affiliate agents (admin view)
router.get('/agents', adminAuth, async (req, res) => {
  try {
    const { status = 'active', sortBy = 'earnings' } = req.query;

    const match = { 'affiliateData.isAffiliate': true };
    if (status) match.status = status;

    let sortField = { 'affiliateData.referralEarnings': -1 };
    switch (sortBy) {
      case 'referrals':
        sortField = { 'affiliateData.totalReferrals': -1 };
        break;
      case 'active_referrals':
        sortField = { 'affiliateData.activeReferrals': -1 };
        break;
      case 'conversion_rate':
        sortField = { 'affiliateData.conversionRate': -1 };
        break;
      case 'name':
        sortField = { 'name': 1 };
        break;
    }

    const agents = await Agent.find(match)
      .select('agentId name agentType affiliateData earnings status createdAt')
      .sort(sortField);

    // Get additional stats for each agent
    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const stats = await AffiliateRegistration.getAffiliateStats(agent._id);
        return {
          ...agent.toObject(),
          additionalStats: stats[0] || {
            totalCustomers: 0,
            activeCustomers: 0,
            totalCommission: 0,
            totalTransactions: 0,
            totalCredits: 0,
            averageCommissionPerCustomer: 0,
            averageTransactionsPerCustomer: 0
          }
        };
      })
    );

    res.json({
      agents: agentsWithStats
    });

  } catch (error) {
    console.error('Error fetching affiliate agents:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate agents' });
  }
});

// Get affiliate performance report
router.get('/performance-report', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, agentId } = req.query;

    const match = {};
    if (startDate || endDate) {
      match.transactionDate = {};
      if (startDate) match.transactionDate.$gte = new Date(startDate);
      if (endDate) match.transactionDate.$lte = new Date(endDate);
    }
    if (agentId) match.affiliateAgentId = agentId;

    // Get earnings breakdown by affiliate agent
    const performanceData = await Earnings.aggregate([
      { $match: { ...match, affiliateAgentId: { $exists: true } } },
      {
        $group: {
          _id: '$affiliateAgentId',
          totalEarnings: { $sum: '$affiliateCommission.amount' },
          totalTransactions: { $sum: 1 },
          totalCredits: { $sum: '$creditsUsed' },
          uniqueCustomers: { $addToSet: '$userId' },
          averagePerTransaction: { $avg: '$affiliateCommission.amount' }
        }
      },
      {
        $lookup: {
          from: 'agents',
          localField: '_id',
          foreignField: '_id',
          as: 'agent'
        }
      },
      {
        $unwind: '$agent'
      },
      {
        $project: {
          agentId: '$agent.agentId',
          agentName: '$agent.name',
          totalEarnings: 1,
          totalTransactions: 1,
          totalCredits: 1,
          uniqueCustomers: { $size: '$uniqueCustomers' },
          averagePerTransaction: 1,
          conversionRate: {
            $cond: [
              { $gt: ['$uniqueCustomers', 0] },
              { $multiply: [{ $divide: ['$totalTransactions', { $size: '$uniqueCustomers' }] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { totalEarnings: -1 } }
    ]);

    // Get overall affiliate stats
    const overallStats = await Earnings.aggregate([
      { $match: { ...match, affiliateAgentId: { $exists: true } } },
      {
        $group: {
          _id: null,
          totalAffiliateEarnings: { $sum: '$affiliateCommission.amount' },
          totalAffiliateTransactions: { $sum: 1 },
          totalAffiliateCredits: { $sum: '$creditsUsed' },
          averageAffiliateEarning: { $avg: '$affiliateCommission.amount' }
        }
      }
    ]);

    res.json({
      performanceData,
      overallStats: overallStats[0] || {
        totalAffiliateEarnings: 0,
        totalAffiliateTransactions: 0,
        totalAffiliateCredits: 0,
        averageAffiliateEarning: 0
      },
      period: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('Error generating performance report:', error);
    res.status(500).json({ error: 'Failed to generate performance report' });
  }
});

// ======================
// ADMIN AFFILIATE ROUTES
// ======================

// Get affiliate statistics for admin dashboard
router.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const affiliateStats = await AffiliateRegistration.aggregate([
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
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $unwind: '$customer'
      },
      {
        $group: {
          _id: '$affiliateAgentId',
          affiliateAgent: { $first: '$affiliateAgent' },
          assignedCustomers: { $sum: 1 },
          totalCoinsGenerated: { $sum: '$totalCreditsGenerated' },
          totalCommissionEarned: { $sum: '$totalCommissionEarned' },
          activeCustomers: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          affiliateAgentId: '$_id',
          affiliateAgentName: '$affiliateAgent.name',
          affiliateAgentId: '$affiliateAgent.agentId',
          assignedCustomers: 1,
          activeCustomers: 1,
          totalCoinsGenerated: 1,
          totalCommissionEarned: 1,
          conversionRate: {
            $multiply: [
              { $divide: ['$activeCustomers', '$assignedCustomers'] },
              100
            ]
          }
        }
      },
      {
        $sort: { totalCommissionEarned: -1 }
      }
    ]);

    res.json({
      success: true,
      affiliates: affiliateStats
    });

  } catch (error) {
    console.error('Error fetching affiliate stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch affiliate statistics',
      details: error.message 
    });
  }
});

// Get affiliate stats for specific agent (for earnings dashboard)
router.get('/stats/agent/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;

    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get affiliate customers for this agent
    const affiliateCustomers = await AffiliateRegistration.find({
      affiliateAgentId: agentId,
      status: 'active'
    }).populate('customerId', 'username email');

    // Get earnings data for these customers
    const affiliateStats = [];
    
    for (const customer of affiliateCustomers) {
      const earnings = await Earnings.find({
        userId: customer.customerId._id,
        affiliateAgentId: agentId
      });

      const totalEarnings = earnings.reduce((sum, earning) => 
        sum + (earning.affiliateCommission || 0), 0
      );

      const totalCreditsUsed = earnings.reduce((sum, earning) => 
        sum + (earning.coinsUsed || 0), 0
      );

      affiliateStats.push({
        customerName: customer.customerId.username,
        customerId: customer.customerId._id,
        creditsUsed: totalCreditsUsed,
        commissionEarned: totalEarnings,
        isActive: customer.status === 'active',
        joinedDate: customer.registrationDate,
        assignedByAdmin: customer.assignedByAdmin || false
      });
    }

    res.json({ affiliates: affiliateStats });

  } catch (error) {
    console.error('Error fetching affiliate stats for agent:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate stats' });
  }
});

// ======================
// NEW AFFILIATE LINK SYSTEM
// ======================

// Track affiliate link click (public endpoint)
router.post('/track-click/:affiliateCode', async (req, res) => {
  try {
    const { affiliateCode } = req.params;
    
    const affiliateLink = await AffiliateLink.findByCode(affiliateCode);
    
    if (affiliateLink) {
      await affiliateLink.incrementClick();
      res.json({ success: true, tracked: true });
    } else {
      res.json({ success: true, tracked: false, message: 'Invalid affiliate code' });
    }

  } catch (error) {
    console.error('Error tracking affiliate click:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// Create or get agent's affiliate link
router.post('/create-link', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    
    // Check if agent already has a link
    let affiliateLink = await AffiliateLink.findOne({ agentId });
    
    if (!affiliateLink) {
      // Generate random affiliate code (8 characters, alphanumeric)
      const generateRandomCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };
      
      let affiliateCode;
      let isUnique = false;
      
      // Keep generating until we get a unique code
      while (!isUnique) {
        affiliateCode = generateRandomCode();
        const existingLink = await AffiliateLink.findOne({ affiliateCode });
        if (!existingLink) {
          isUnique = true;
        }
      }
      
      affiliateLink = new AffiliateLink({
        agentId,
        affiliateCode,
        isActive: true,
        createdAt: new Date()
      });
      
      await affiliateLink.save();
    }

    res.json({
      success: true,
      link: `${FRONTEND_URL}/register?ref=${affiliateLink.affiliateCode}`,
      affiliateCode: affiliateLink.affiliateCode,
      isActive: affiliateLink.isActive,
      createdAt: affiliateLink.createdAt
    });

  } catch (error) {
    console.error('Error creating affiliate link:', error);
    res.status(500).json({ error: 'Failed to create affiliate link' });
  }
});

// Get agent's affiliate link
router.get('/my-link', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    
    const affiliateLink = await AffiliateLink.findOne({ agentId });
    
    if (!affiliateLink) {
      return res.json({ 
        hasLink: false,
        message: 'No affiliate link created yet'
      });
    }

    res.json({
      hasLink: true,
      link: `${FRONTEND_URL}/register?ref=${affiliateLink.affiliateCode}`,
      affiliateCode: affiliateLink.affiliateCode,
      isActive: affiliateLink.isActive,
      createdAt: affiliateLink.createdAt,
      clickCount: affiliateLink.clickCount || 0,
      registrationCount: affiliateLink.registrationCount || 0
    });

  } catch (error) {
    console.error('Error getting affiliate link:', error);
    res.status(500).json({ error: 'Failed to get affiliate link' });
  }
});

// Get agent's referrals (all historical referrals)
router.get('/referrals', agentAuth, async (req, res) => {
  try {
    console.log('Referrals endpoint called');
    console.log('req.agent:', req.agent ? `ID: ${req.agent._id}` : 'null');
    console.log('Authorization header:', req.headers.authorization ? 'present' : 'missing');
    
    if (!req.agent) {
      console.log('No agent authenticated - returning 401');
      return res.status(401).json({ error: 'Agent authentication required' });
    }
    
    const agentId = req.agent._id;
    console.log('Processing referrals for agent ID:', agentId);
    
    // Get all affiliate links ever created by this agent (active and inactive)
    const affiliateLinks = await AffiliateLink.find({ agentId });
    console.log('Found affiliate links:', affiliateLinks.length);
    
    if (affiliateLinks.length === 0) {
      console.log('No affiliate links found for agent');
      return res.json({ 
        referrals: [],
        totalAffiliateLinks: 0,
        activeLinks: 0,
        revokedLinks: 0
      });
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

    res.json({ 
      referrals: referralsWithLinkInfo,
      totalAffiliateLinks: affiliateLinks.length,
      activeLinks: affiliateLinks.filter(link => link.isActive).length,
      revokedLinks: affiliateLinks.filter(link => !link.isActive).length
    });

  } catch (error) {
    console.error('Error getting referrals:', error);
    res.status(500).json({ error: 'Failed to get referrals' });
  }
});

// Get affiliate stats for agent
router.get('/stats', agentAuth, async (req, res) => {
  try {
    // Check if agent is authenticated
    if (!req.agent || !req.agent._id) {
      return res.status(401).json({ 
        error: 'Agent authentication required',
        message: 'Please log in as an agent to access affiliate stats'
      });
    }

    const agentId = req.agent._id;
    
    const affiliateLink = await AffiliateLink.findOne({ agentId });
    
    if (!affiliateLink) {
      return res.json({
        totalClicks: 0,
        totalReferrals: 0,
        activeReferrals: 0,
        totalEarnings: 0,
        conversionRate: 0
      });
    }

    // Get referral count
    const totalReferrals = await User.countDocuments({ 
      'referral.affiliateCode': affiliateLink.affiliateCode 
    });

    // Get active referrals (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeReferrals = await User.countDocuments({ 
      'referral.affiliateCode': affiliateLink.affiliateCode,
      lastActive: { $gte: thirtyDaysAgo }
    });

    // Get total earnings from referrals
    const referralUserIds = await User.find({ 
      'referral.affiliateCode': affiliateLink.affiliateCode 
    }).select('_id');
    
    const userIds = referralUserIds.map(user => user._id);
    
    const earnings = await Earnings.aggregate([
      { $match: { userId: { $in: userIds }, affiliateAgentId: agentId } },
      { $group: { _id: null, totalEarnings: { $sum: '$amount' } } }
    ]);

    const totalEarnings = earnings.length > 0 ? earnings[0].totalEarnings : 0;
    const conversionRate = affiliateLink.clickCount > 0 ? (totalReferrals / affiliateLink.clickCount * 100) : 0;

    res.json({
      totalClicks: affiliateLink.clickCount || 0,
      totalReferrals,
      activeReferrals,
      totalEarnings,
      conversionRate: Math.round(conversionRate * 100) / 100
    });

  } catch (error) {
    console.error('Error getting affiliate stats:', error);
    res.status(500).json({ error: 'Failed to get affiliate stats' });
  }
});

// Track affiliate link clicks (public endpoint - no auth required)
router.post('/track-click', async (req, res) => {
  try {
    const { affiliateCode } = req.body;
    
    if (!affiliateCode) {
      return res.status(400).json({ error: 'Affiliate code is required' });
    }

    const affiliateLink = await AffiliateLink.findOne({ 
      affiliateCode, 
      isActive: true 
    });
    
    if (!affiliateLink) {
      return res.status(404).json({ error: 'Invalid affiliate code' });
    }

    // Increment click count
    await affiliateLink.incrementClick();

    res.json({
      success: true,
      message: 'Click tracked successfully'
    });

  } catch (error) {
    console.error('Error tracking affiliate click:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// Revoke (deactivate) affiliate link
router.post('/revoke', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    
    const affiliateLink = await AffiliateLink.findOne({ agentId });
    
    if (!affiliateLink) {
      return res.status(404).json({ error: 'No affiliate link found' });
    }

    // Deactivate the link
    affiliateLink.isActive = false;
    await affiliateLink.save();

    res.json({
      success: true,
      message: 'Affiliate link has been revoked successfully'
    });

  } catch (error) {
    console.error('Error revoking affiliate link:', error);
    res.status(500).json({ error: 'Failed to revoke affiliate link' });
  }
});

// Regenerate (create new) affiliate link
router.post('/regenerate', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    
    // Remove existing link completely to avoid unique constraint issues
    await AffiliateLink.findOneAndDelete({ agentId });

    // Generate a new random affiliate code (8 characters, alphanumeric)
    const generateRandomCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    
    let affiliateCode;
    let isUnique = false;
    
    // Keep generating until we get a unique code
    while (!isUnique) {
      affiliateCode = generateRandomCode();
      const existingLink = await AffiliateLink.findOne({ affiliateCode });
      if (!existingLink) {
        isUnique = true;
      }
    }
    
    const newAffiliateLink = new AffiliateLink({
      agentId,
      affiliateCode,
      isActive: true,
      createdAt: new Date(),
      clickCount: 0,
      registrationCount: 0
    });
    
    await newAffiliateLink.save();

    res.json({
      success: true,
      hasLink: true,
      link: `${FRONTEND_URL}/register?ref=${affiliateCode}`,
      affiliateCode: affiliateCode,
      isActive: true,
      createdAt: newAffiliateLink.createdAt,
      clickCount: 0,
      registrationCount: 0,
      message: 'New affiliate link generated successfully'
    });

  } catch (error) {
    console.error('Error regenerating affiliate link:', error);
    res.status(500).json({ error: 'Failed to regenerate affiliate link' });
  }
});

module.exports = router;
