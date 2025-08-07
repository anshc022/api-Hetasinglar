const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Earnings = require('../models/Earnings');
const Agent = require('../models/Agent');
const User = require('../models/User');
const AgentCustomer = require('../models/AgentCustomer');
const AffiliateRegistration = require('../models/AffiliateRegistration');
const { adminAuth, agentAuth } = require('../auth');
const { v4: uuidv4 } = require('uuid');

// ======================
// EARNINGS MANAGEMENT
// ======================

// Record a new earning transaction
router.post('/earnings', agentAuth, async (req, res) => {
  try {
    const {
      userId,
      chatId,
      agentId,
      creditsUsed,
      costPerCredit,
      messageType,
      description,
      customPercentages
    } = req.body;

    // Validate required fields
    if (!userId || !chatId || !agentId || !creditsUsed || !costPerCredit) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user and their affiliate agent
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate total amount
    const totalAmount = creditsUsed * costPerCredit;

    // Find affiliate agent if exists
    const affiliateAgentId = user.affiliateAgent;

    // Get agent's custom commission settings if any
    const agent = await Agent.findById(agentId);
    let commissionSettings = {};

    if (customPercentages) {
      commissionSettings = customPercentages;
    } else if (agent?.commissionSettings?.customRatesEnabled) {
      commissionSettings = {
        chatAgentPercentage: agent.commissionSettings.chatCommissionPercentage,
        adminPercentage: 100 - agent.commissionSettings.chatCommissionPercentage - agent.commissionSettings.affiliateCommissionPercentage
      };
    }

    // Create earning record
    const earning = new Earnings({
      transactionId: uuidv4(),
      userId,
      chatId,
      agentId,
      affiliateAgentId,
      totalAmount,
      creditsUsed,
      costPerCredit,
      customPercentages: Object.keys(commissionSettings).length > 0 ? commissionSettings : undefined,
      description,
      messageType: messageType || 'text'
    });

    await earning.save();

    // Update user credits
    await user.useCredits(creditsUsed);

    // Update agent earnings
    await agent.updateEarnings(earning.chatAgentCommission.amount, 'chat');

    // Update affiliate earnings if applicable
    if (affiliateAgentId) {
      const affiliateAgent = await Agent.findById(affiliateAgentId);
      if (affiliateAgent) {
        await affiliateAgent.updateEarnings(earning.affiliateCommission.amount, 'affiliate');
        
        // Update affiliate registration stats
        const affiliateReg = await AffiliateRegistration.findOne({
          affiliateAgentId,
          customerId: userId
        });
        if (affiliateReg) {
          await affiliateReg.updateCommission(earning.affiliateCommission.amount, creditsUsed);
        }
      }
    }

    // Update agent-customer relationship stats
    const agentCustomer = await AgentCustomer.findOne({ agentId, customerId: userId });
    if (agentCustomer) {
      await agentCustomer.updateStats({
        earnings: earning.chatAgentCommission.amount,
        creditsUsed
      });
    }

    res.status(201).json({
      success: true,
      earning,
      message: 'Earning recorded successfully'
    });

  } catch (error) {
    console.error('Error recording earning:', error);
    res.status(500).json({ error: 'Failed to record earning' });
  }
});

// Get earnings for admin dashboard
router.get('/earnings/admin', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, agentId, status, page = 1, limit = 50 } = req.query;
    
    const match = {};
    if (startDate) match.transactionDate = { $gte: new Date(startDate) };
    if (endDate) match.transactionDate = { ...match.transactionDate, $lte: new Date(endDate) };
    if (agentId) match.agentId = agentId;
    if (status) match.paymentStatus = status;

    const earnings = await Earnings.find(match)
      .populate('userId', 'username email')
      .populate('agentId', 'agentId name')
      .populate('affiliateAgentId', 'agentId name')
      .sort({ transactionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalEarnings = await Earnings.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          adminEarnings: { $sum: '$adminCommission' },
          agentEarnings: { $sum: '$agentCommission' },
          affiliateEarnings: { $sum: '$affiliateCommission' },
          totalTransactions: { $sum: 1 },
          totalCoins: { $sum: '$coinsUsed' }
        }
      }
    ]);

    res.json({
      earnings,
      summary: totalEarnings[0] || {
        totalAmount: 0,
        adminEarnings: 0,
        agentEarnings: 0,
        affiliateEarnings: 0,
        totalTransactions: 0,
        totalCoins: 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: await Earnings.countDocuments(match)
      }
    });

  } catch (error) {
    console.error('Error fetching admin earnings:', error);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

// Get earnings for specific agent
router.get('/earnings/agent/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;

    // An agent can view their own earnings. An admin can view any agent's earnings.
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const match = { agentId };
    if (startDate) match.transactionDate = { $gte: new Date(startDate) };
    if (endDate) match.transactionDate = { ...match.transactionDate, $lte: new Date(endDate) };

    const earnings = await Earnings.find(match)
      .populate('userId', 'username email')
      .populate('chatId', 'customerName')
      .sort({ transactionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const stats = await Earnings.getAgentEarnings(agentId, startDate, endDate);

    res.json({
      earnings,
      stats: stats[0] || {
        totalEarnings: 0,
        totalTransactions: 0,
        totalCoinsUsed: 0,
        averagePerTransaction: 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: await Earnings.countDocuments(match)
      }
    });

  } catch (error) {
    console.error('Error fetching agent earnings:', error);
    res.status(500).json({ error: 'Failed to fetch agent earnings' });
  }
});

// Get affiliate earnings for specific agent
router.get('/earnings/affiliate/:affiliateAgentId', agentAuth, async (req, res) => {
  try {
    const { affiliateAgentId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;    // Check if user can access this affiliate agent's data
    if (req.agent.id !== affiliateAgentId && !req.admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const match = { affiliateAgentId };
    if (startDate) match.transactionDate = { $gte: new Date(startDate) };
    if (endDate) match.transactionDate = { ...match.transactionDate, $lte: new Date(endDate) };

    const earnings = await Earnings.find(match)
      .populate('userId', 'username email')
      .populate('agentId', 'agentId name')
      .sort({ transactionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const stats = await Earnings.getAffiliateEarnings(affiliateAgentId, startDate, endDate);

    res.json({
      earnings,
      stats: stats[0] || {
        totalEarnings: 0,
        totalTransactions: 0,
        totalCoinsUsed: 0,
        averagePerTransaction: 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: await Earnings.countDocuments(match)
      }
    });

  } catch (error) {
    console.error('Error fetching affiliate earnings:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate earnings' });
  }
});

// ======================
// COMMISSION MANAGEMENT
// ======================

// Update commission percentages for specific agent
router.put('/commission/agent/:agentId', adminAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { chatCommissionPercentage, affiliateCommissionPercentage, customRatesEnabled } = req.body;

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Validate percentages
    const totalPercentage = (chatCommissionPercentage || 0) + (affiliateCommissionPercentage || 0);
    if (totalPercentage > 100) {
      return res.status(400).json({ error: 'Total commission percentages cannot exceed 100%' });
    }

    // Update commission settings
    if (chatCommissionPercentage !== undefined) {
      agent.commissionSettings.chatCommissionPercentage = chatCommissionPercentage;
    }
    if (affiliateCommissionPercentage !== undefined) {
      agent.commissionSettings.affiliateCommissionPercentage = affiliateCommissionPercentage;
    }
    if (customRatesEnabled !== undefined) {
      agent.commissionSettings.customRatesEnabled = customRatesEnabled;
    }

    await agent.save();

    res.json({
      success: true,
      agent: {
        agentId: agent.agentId,
        name: agent.name,
        commissionSettings: agent.commissionSettings
      },
      message: 'Commission settings updated successfully'
    });

  } catch (error) {
    console.error('Error updating commission settings:', error);
    res.status(500).json({ error: 'Failed to update commission settings' });
  }
});

// Get commission overview for admin
router.get('/overview', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const adminStats = await Earnings.getAdminEarnings(startDate, endDate);
    
    const topAgents = await Agent.aggregate([
      { $match: { status: 'active' } },
      { $sort: { 'earnings.thisMonthEarnings': -1 } },
      { $limit: 10 },
      {
        $project: {
          agentId: 1,
          name: 1,
          earnings: 1,
          commissionSettings: 1,
          agentType: 1
        }
      }
    ]);

    const commissionBreakdown = await Earnings.aggregate([
      {
        $match: startDate || endDate ? {
          transactionDate: {
            ...(startDate && { $gte: new Date(startDate) }),
            ...(endDate && { $lte: new Date(endDate) })
          }
        } : {}
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          adminRevenue: { $sum: '$adminCommission' },
          agentRevenue: { $sum: '$agentCommission' },
          affiliateRevenue: { $sum: '$affiliateCommission' },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    res.json({
      adminStats: adminStats[0] || {
        totalEarnings: 0,
        totalTransactions: 0,
        totalCoinsUsed: 0,
        averagePerTransaction: 0
      },
      topAgents,
      commissionBreakdown: commissionBreakdown[0] || {
        totalRevenue: 0,
        adminRevenue: 0,
        agentRevenue: 0,
        affiliateRevenue: 0,
        totalTransactions: 0
      }
    });

  } catch (error) {
    console.error('Error fetching commission overview:', error);
    res.status(500).json({ error: 'Failed to fetch commission overview' });
  }
});

// ======================
// PAYMENT MANAGEMENT
// ======================

// Update payment status
router.put('/earnings/:earningId/payment-status', adminAuth, async (req, res) => {
  try {
    const { earningId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'processed', 'paid', 'disputed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }

    const earning = await Earnings.findById(earningId);
    if (!earning) {
      return res.status(404).json({ error: 'Earning record not found' });
    }

    earning.paymentStatus = status;
    if (notes) earning.notes = notes;

    if (status === 'processed') {
      earning.processedDate = new Date();
    } else if (status === 'paid') {
      earning.paidDate = new Date();
      
      // Update agent's paid earnings
      const agent = await Agent.findById(earning.agentId);
      if (agent) {
        await agent.processPayment(earning.chatAgentCommission.amount);
      }

      // Update affiliate agent's paid earnings if applicable
      if (earning.affiliateAgentId) {
        const affiliateAgent = await Agent.findById(earning.affiliateAgentId);
        if (affiliateAgent) {
          await affiliateAgent.processPayment(earning.affiliateCommission.amount);
        }
      }
    }

    await earning.save();

    res.json({
      success: true,
      earning,
      message: 'Payment status updated successfully'
    });

  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// Bulk payment processing
router.post('/payments/bulk-process', adminAuth, async (req, res) => {
  try {
    const { earningIds, status, notes } = req.body;

    if (!Array.isArray(earningIds) || earningIds.length === 0) {
      return res.status(400).json({ error: 'No earning IDs provided' });
    }

    const validStatuses = ['processed', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid payment status for bulk processing' });
    }

    const updateData = { paymentStatus: status };
    if (notes) updateData.notes = notes;
    if (status === 'processed') updateData.processedDate = new Date();
    if (status === 'paid') updateData.paidDate = new Date();

    const result = await Earnings.updateMany(
      { _id: { $in: earningIds }, paymentStatus: 'pending' },
      updateData
    );

    // If marking as paid, update agent earnings
    if (status === 'paid') {
      const earnings = await Earnings.find({ _id: { $in: earningIds } });
      
      for (const earning of earnings) {
        // Update chat agent
        const agent = await Agent.findById(earning.agentId);
        if (agent) {
          await agent.processPayment(earning.chatAgentCommission.amount);
        }

        // Update affiliate agent if applicable
        if (earning.affiliateAgentId) {
          const affiliateAgent = await Agent.findById(earning.affiliateAgentId);
          if (affiliateAgent) {
            await affiliateAgent.processPayment(earning.affiliateCommission.amount);
          }
        }
      }
    }

    res.json({
      success: true,
      processed: result.modifiedCount,
      message: `${result.modifiedCount} payments processed successfully`
    });

  } catch (error) {
    console.error('Error processing bulk payments:', error);
    res.status(500).json({ error: 'Failed to process bulk payments' });
  }
});

// NEW AGENT EARNINGS ENDPOINTS FOR COMPREHENSIVE DASHBOARD

// Get agent earnings summary (current month stats)
router.get('/earnings/agent/:agentId/summary', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { startDate } = req.query;
    
    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const currentMonth = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

    // Convert agentId to ObjectId for aggregation
    const mongoose = require('mongoose');
    const agentObjectId = new mongoose.Types.ObjectId(agentId);

    const summary = await Earnings.aggregate([
      {
        $match: {
          agentId: agentObjectId,
          transactionDate: {
            $gte: currentMonth,
            $lt: nextMonth
          }
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$agentCommission' },
          affiliateCommission: { $sum: '$affiliateCommission' },
          totalTransactions: { $sum: 1 },
          totalCoinsUsed: { $sum: '$coinsUsed' }
        }
      }
    ]);

    // Get pending payments from actual payout system
    const pendingPayments = await Earnings.aggregate([
      {
        $match: {
          agentId: agentObjectId,
          'payoutStatus': 'pending'
        }
      },
      {
        $group: {
          _id: null,
          pendingAmount: { $sum: { $add: ['$agentCommission', '$affiliateCommission'] } }
        }
      }
    ]);
    
    const pendingPayment = pendingPayments[0]?.pendingAmount || 0;
    
    // Get withdrawable balance (total earnings - pending - already withdrawn)
    const balanceAggregation = await Earnings.aggregate([
      { $match: { agentId: agentObjectId } },
      {
        $group: {
          _id: null,
          totalEarnings: {
            $sum: {
              $cond: [
                { $in: ["$type", ['earning', 'chat_commission', 'affiliate_commission']] },
                '$agentCommission',
                0
              ]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [{ $eq: ["$type", 'withdrawal'] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    const totalEarned = balanceAggregation[0]?.totalEarnings || 0;
    const totalWithdrawn = balanceAggregation[0]?.totalWithdrawals || 0;
    const withdrawableBalance = totalEarned - totalWithdrawn;

    res.json({
      summary: {
        totalEarnings: summary[0]?.totalEarnings || 0,
        affiliateCommission: summary[0]?.affiliateCommission || 0,
        pendingPayment: pendingPayment,
        withdrawableBalance: Math.max(0, withdrawableBalance)
      }
    });

  } catch (error) {
    console.error('Error fetching agent earnings summary:', error);
    res.status(500).json({ error: 'Failed to fetch earnings summary' });
  }
});

// Get agent earnings trends for charts
router.get('/earnings/agent/:agentId/trends', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    let { startDate, endDate, granularity = 'day' } = req.query;
    
    // Default to last 30 days if no dates provided
    if (!startDate || !endDate) {
      endDate = new Date().toISOString();
      startDate = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString();
    }
    
    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Convert agentId to ObjectId for aggregation
    const mongoose = require('mongoose');
    const agentObjectId = new mongoose.Types.ObjectId(agentId);
    
    let groupFormat;
    if (granularity === 'day') {
      groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } };
    } else {
      groupFormat = { $dateToString: { format: "%Y-W%U", date: "$transactionDate" } };
    }

    const trends = await Earnings.aggregate([
      {
        $match: {
          agentId: agentObjectId,
          transactionDate: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: groupFormat,
          chatEarnings: { $sum: '$agentCommission' },
          affiliateEarnings: { $sum: '$affiliateCommission' },
          date: { $first: '$transactionDate' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Fill in missing dates with zero values
    const labels = [];
    const chatEarnings = [];
    const affiliateEarnings = [];
    
    trends.forEach(trend => {
      labels.push(trend._id);
      chatEarnings.push(trend.chatEarnings || 0);
      affiliateEarnings.push(trend.affiliateEarnings || 0);
    });

    res.json({
      trends: {
        labels,
        chatEarnings,
        affiliateEarnings
      }
    });

  } catch (error) {
    console.error('Error fetching agent earnings trends:', error);
    res.status(500).json({ error: 'Failed to fetch earnings trends' });
  }
});

// Get agent chat earnings with detailed breakdown
router.get('/earnings/agent/:agentId/chats', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 50 } = req.query;
    
    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Convert agentId to ObjectId for query
    const mongoose = require('mongoose');
    const agentObjectId = new mongoose.Types.ObjectId(agentId);

    const earnings = await Earnings.find({ agentId: agentObjectId })
      .populate('userId', 'username')
      .populate('chatId', 'customerName duration')
      .sort({ transactionDate: -1 })
      .limit(parseInt(limit))
      .select('transactionDate coinsUsed agentCommission affiliateCommission userId chatId affiliateAgentId');

    const formattedEarnings = earnings.map(earning => ({
      date: earning.transactionDate,
      customerName: earning.chatId?.customerName || earning.userId?.username || 'Unknown',
      duration: earning.chatId?.duration || 'N/A',
      creditsUsed: earning.coinsUsed || 0,
      amount: earning.agentCommission || 0,
      isAffiliate: !!earning.affiliateAgentId
    }));

    res.json({ earnings: formattedEarnings });

  } catch (error) {
    console.error('Error fetching agent chat earnings:', error);
    res.status(500).json({ error: 'Failed to fetch chat earnings' });
  }
});

// Get agent withdrawal settings
router.get('/withdrawal-settings/agent/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get real withdrawal settings from agent data
    const agent = await Agent.findById(agentId);
    const lastPayout = await Earnings.findOne({ 
      agentId, 
      'payoutStatus': 'completed' 
    }).sort({ payoutDate: -1 });

    const settings = {
      minimumAmount: agent?.withdrawalSettings?.minimumAmount || 50,
      nextEligibleDate: agent?.withdrawalSettings?.nextEligibleDate || null,
      lastPaymentDate: lastPayout?.payoutDate || null
    };

    res.json({ settings });

  } catch (error) {
    console.error('Error fetching withdrawal settings:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal settings' });
  }
});

// Submit withdrawal request
router.post('/withdraw/agent/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { amount, paymentMethod } = req.body;
    
    // Validate agentId
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ 
        error: 'Invalid agent ID format',
        details: 'The provided agent ID is not in a valid format'
      });
    }

    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ 
        error: 'Access denied',
        details: 'You are not authorized to perform this action'
      });
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount < 50) {
      return res.status(400).json({ 
        error: 'Invalid withdrawal amount',
        details: 'Amount must be a valid number and at least $50'
      });
    }

    // Validate payment method
    if (!paymentMethod || !['bank_transfer', 'paypal', 'crypto'].includes(paymentMethod)) {
      return res.status(400).json({ 
        error: 'Invalid payment method',
        details: 'Please specify a valid payment method: bank_transfer, paypal, or crypto'
      });
    }

    // Check agent's available balance
    const earningsData = await Earnings.aggregate([
      {
        $match: { 
          agentId: new mongoose.Types.ObjectId(agentId)
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: {
            $sum: {
              $cond: [
                { $in: ["$type", ['earning', 'chat_commission', 'affiliate_commission']] },
                { $ifNull: ['$agentCommission', 0] },
                0
              ]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [
                { $eq: ["$type", 'withdrawal'] },
                { $ifNull: ['$amount', 0] },
                0
              ]
            }
          }
        }
      }
    ]);

    const totalEarned = earningsData[0]?.totalEarnings || 0;
    const totalWithdrawn = earningsData[0]?.totalWithdrawals || 0;
    const availableBalance = totalEarned - totalWithdrawn;
    
    console.log('Withdrawal request:', {
      requestedAmount: parsedAmount,
      availableBalance,
      totalEarned,
      totalWithdrawn
    });
    
    if (parsedAmount > availableBalance) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        details: `Available balance is $${availableBalance.toFixed(2)}`,
        available: availableBalance
      });
    }

    // Verify agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ 
        error: 'Agent not found',
        details: 'Could not find an agent with the provided ID'
      });
    }

    // Create withdrawal record with proper data validation
    const withdrawalData = {
      agentId: new mongoose.Types.ObjectId(agentId),
      type: 'withdrawal',
      amount: parsedAmount,
      totalAmount: parsedAmount, // Required by schema
      paymentMethod,
      status: 'pending',
      transactionDate: new Date(),
      description: `Withdrawal request via ${paymentMethod}`,
      transactionId: `WD${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      coinsUsed: 0, // Required by schema
      coinValue: 1, // Required by schema
      agentCommission: parsedAmount,
      agentCommissionPercentage: 100,
      adminCommission: 0,
      adminCommissionPercentage: 0,
      metadata: {
        requestIp: req.ip,
        userAgent: req.get('user-agent'),
        requestDate: new Date(),
        agentName: agent.name || agent.agentId,
        availableBalanceAtRequest: availableBalance
      }
    };

    const withdrawal = new Earnings(withdrawalData);

    // Validate withdrawal document before saving
    const validationError = withdrawal.validateSync();
    if (validationError) {
      console.error('Withdrawal validation error:', validationError);
      return res.status(400).json({
        error: 'Invalid withdrawal data',
        details: Object.values(validationError.errors).map(err => err.message)
      });
    }

    // Save the withdrawal record
    await withdrawal.save();
    
    // Log the successful withdrawal request
    console.log('Withdrawal request created:', {
      agentId: withdrawal.agentId,
      amount: withdrawal.amount,
      transactionId: withdrawal.transactionId
    });
    // 1. Check agent's available balance
    // 2. Create withdrawal record in database
    // 3. Integrate with payment processor
    // 4. Send confirmation email

    res.json({ 
      success: true, 
      message: 'Withdrawal request submitted successfully',
      withdrawal
    });

  } catch (error) {
    console.error('Error submitting withdrawal request:', error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return res.status(500).json({
        error: 'Database error',
        details: 'There was an error processing your request in the database'
      });
    }

    // Generic error response
    res.status(500).json({ 
      error: 'Failed to submit withdrawal request',
      details: error.message || 'An unexpected error occurred while processing your request'
    });
  }
});

// Get agent payout history
router.get('/payouts/agent/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get real payout history from database
    const payouts = await Earnings.find({
      agentId,
      type: 'withdrawal'
    })
    .sort({ requestDate: -1 })
    .limit(50)
    .select('requestDate amount paymentMethod payoutStatus transactionId payoutDate');

    const formattedPayouts = payouts.map(payout => ({
      date: payout.payoutDate || payout.requestDate,
      amount: payout.amount,
      method: payout.paymentMethod,
      status: payout.payoutStatus,
      transactionId: payout.transactionId
    }));

    res.json({ payouts: formattedPayouts });

  } catch (error) {
    console.error('Error fetching payout history:', error);
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});

// Export earnings report
router.get('/earnings/agent/:agentId/export', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { format = 'csv', dateRange = 'month' } = req.query;
    
    // Access control
    if (!req.admin && (!req.agent || req.agent._id.toString() !== agentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate date range
    let startDate;
    const endDate = new Date();
    
    switch(dateRange) {
      case 'week':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 3, 1);
        break;
      default:
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    }

    const earnings = await Earnings.find({
      agentId,
      transactionDate: { $gte: startDate, $lte: endDate }
    })
    .populate('userId', 'username')
    .populate('chatId', 'customerName')
    .sort({ transactionDate: -1 });

    if (format === 'csv') {
      const csvData = earnings.map(earning => ({
        Date: earning.transactionDate.toISOString().split('T')[0],
        Customer: earning.chatId?.customerName || earning.userId?.username || 'Unknown',
        'Credits Used': earning.coinsUsed || 0,
        'Chat Earnings': earning.chatAgentCommission?.amount || 0,
        'Affiliate Commission': earning.affiliateCommission?.amount || 0,
        'Total Earnings': (earning.chatAgentCommission?.amount || 0) + (earning.affiliateCommission?.amount || 0)
      }));

      // Convert to CSV format
      const headers = Object.keys(csvData[0] || {}).join(',');
      const rows = csvData.map(row => Object.values(row).join(','));
      const csv = [headers, ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=earnings_report_${dateRange}.csv`);
      res.send(csv);
    } else {
      res.json({ earnings });
    }

  } catch (error) {
    console.error('Error exporting earnings report:', error);
    res.status(500).json({ error: 'Failed to export earnings report' });
  }
});

module.exports = router;
