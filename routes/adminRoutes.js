const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Agent = require('../models/Agent');
const Chat = require('../models/Chat');  // Add this import
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan'); // Add this import
const { isValidSwedishRegion, getSwedishRegions } = require('../constants/swedishRegions');
const { isValidRelationshipStatus, getRelationshipStatuses } = require('../constants/relationshipStatuses');
const EscortProfile = require('../models/EscortProfile');
const AffiliateLink = require('../models/AffiliateLink');
const { adminAuth } = require('../auth');
const CommissionSettings = require('../models/CommissionSettings');
const { resolveFrontendUrl } = require('../utils/frontendUrl');
const router = express.Router();

// Admin Auth (no auth middleware needed for login)
router.post('/login', async (req, res) => {
  try {
    const { adminId, password } = req.body;
    const admin = await Admin.findOne({ adminId });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { adminId: admin._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }  // Increased from 24h to 7 days
    );

    res.json({
      access_token: token,
      admin: {
        id: admin._id,
        adminId: admin.adminId,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});

// Get Dashboard Stats
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const [messageCounts, activeAgents] = await Promise.all([
      Chat.aggregate([
        {
          $group: {
            _id: null,
            totalMessages: { $sum: { $size: "$messages" } },
            liveMessages: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "active"] },
                  { $size: "$messages" },
                  0
                ]
              }
            }
          }
        }
      ]),
      Agent.find({ 'stats.isOnline': true }).count()
    ]);    const agentPerformance = await Agent.find().select('name stats role email agentId');
    
    res.json({
      messageCounts: messageCounts[0] || { totalMessages: 0, liveMessages: 0 },
      activeAgents,
      agentPerformance: agentPerformance.map(agent => ({
        id: agent._id,
        name: agent.name,
        role: agent.role,
        email: agent.email,
        agentId: agent.agentId,
        stats: {
          avgResponseTime: agent.stats?.averageResponseTime || 0,
          totalMessages: agent.stats?.totalMessagesSent || 0,
          activeCustomers: agent.stats?.activeCustomers || 0,
          totalCustomersServed: agent.stats?.totalCustomersServed || 0,
          customerSatisfactionRating: agent.stats?.customerSatisfactionRating || 0,
          totalChatSessions: agent.stats?.totalChatSessions || 0,
          isOnline: false, // TODO: Implement real online status
          liveMessageCount: agent.stats?.liveMessageCount || 0
        }
      }))
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
});

// Agent Management
router.post('/agents', adminAuth, async (req, res) => {
  try {
    // Apply default commission settings for new agents if not provided
    const existingDefaults = await CommissionSettings.findOne().sort({ updatedAt: -1 });
    const defaults = existingDefaults || { defaultAgentPercentage: 30, defaultAffiliatePercentage: 20 };

    const payload = { ...req.body };
    if (!payload.commissionSettings) {
      const agentPerc = defaults.defaultAgentPercentage ?? 30;
      const affiliatePerc = defaults.defaultAffiliatePercentage ?? 20;
      payload.commissionSettings = {
        chatCommissionPercentage: agentPerc,
        affiliateCommissionPercentage: affiliatePerc,
        customRatesEnabled: false,
      };
    }

    const agent = new Agent(payload);
    await agent.save();
    res.status(201).json(agent);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create agent' });
  }
});

router.get('/agents', adminAuth, async (req, res) => {
  try {
    const agents = await Agent.find();
    
    // Enhanced agent stats with earnings aggregation
    const agentsWithStats = await Promise.all(agents.map(async (agent) => {
      // Get earnings statistics for this agent
      const Earnings = require('../models/Earnings');
      const Chat = require('../models/Chat');
      
      const earningsStats = await Earnings.aggregate([
        { $match: { agentId: agent._id } },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$agentCommission' },
            totalCoinsUsed: { $sum: '$coinsUsed' },
            totalTransactions: { $sum: 1 }
          }
        }
      ]);
      
      // Get chat statistics
      const chatStats = await Chat.aggregate([
        { $match: { agentId: agent._id } },
        {
          $group: {
            _id: null,
            totalChats: { $sum: 1 },
            totalMessages: { $sum: '$messageCount' }
          }
        }
      ]);
      
      const earnings = earningsStats[0] || { totalEarnings: 0, totalCoinsUsed: 0, totalTransactions: 0 };
      const chats = chatStats[0] || { totalChats: 0, totalMessages: 0 };
      
      return {
        ...agent.toObject(),
        // Enhanced statistics
        totalChats: chats.totalChats,
        totalCoinsUsed: earnings.totalCoinsUsed,
        totalEarnings: earnings.totalEarnings,
        totalTransactions: earnings.totalTransactions,
        totalMessages: chats.totalMessages,
        
        // Ensure earnings object exists with updated values
        earnings: {
          ...agent.earnings,
          totalEarnings: earnings.totalEarnings,
          calculatedFromTransactions: true
        },
        
        // Last payment date from earnings
        lastPayment: agent.earnings?.lastPayoutDate || null,
        payoutStatus: agent.earnings?.pendingEarnings > 0 ? 'pending' : 'paid'
      };
    }));
    
    res.json({ agents: agentsWithStats });
  } catch (error) {
    console.error('Error fetching agents with stats:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

router.put('/agents/:id', adminAuth, async (req, res) => {
  try {
    const { name, email, role, permissions, agentId } = req.body;
    const targetAgentId = req.params.id;

    console.log('Admin updating agent:', { targetAgentId, body: req.body }); // Debug log

    // Check if agent exists
    const existingAgent = await Agent.findById(targetAgentId);
    if (!existingAgent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Check for duplicate email/agentId if they're being changed
    if (email !== existingAgent.email || agentId !== existingAgent.agentId) {
      const queryConditions = [];
      
      if (email && email !== existingAgent.email) {
        queryConditions.push({ email });
      }
      
      if (agentId && agentId !== existingAgent.agentId) {
        queryConditions.push({ agentId });
      }

      if (queryConditions.length > 0) {
        const duplicate = await Agent.findOne({
          $or: queryConditions,
          _id: { $ne: targetAgentId }
        });

        if (duplicate) {
          const conflictField = duplicate.email === email ? 'email' : 'agentId';
          return res.status(400).json({ 
            message: `${conflictField === 'email' ? 'Email' : 'Agent ID'} already in use` 
          });
        }
      }
    }

    // Update the agent
    const updateData = {
      name,
      email,
      role,
      permissions
    };

    // Only include agentId if it's provided and different
    if (agentId && agentId !== existingAgent.agentId) {
      updateData.agentId = agentId;
    }

    const updatedAgent = await Agent.findByIdAndUpdate(
      targetAgentId, 
      updateData, 
      { new: true }
    ).select('-password');

    if (!updatedAgent) {
      return res.status(404).json({ message: 'Agent not found after update' });
    }

    // Format the response to match what the frontend expects
    const agentResponse = {
      id: updatedAgent._id,
      agentId: updatedAgent.agentId,
      name: updatedAgent.name,
      email: updatedAgent.email,
      role: updatedAgent.role,
      permissions: updatedAgent.permissions,
      stats: updatedAgent.stats
    };

    res.json(agentResponse);
  } catch (error) {
    console.error('Error updating agent via admin:', error);
    res.status(500).json({ message: 'Failed to update agent' });
  }
});

router.delete('/agents/:id', adminAuth, async (req, res) => {
  try {
    await Agent.findByIdAndDelete(req.params.id);
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete agent' });
  }
});

// Update agent permissions
router.patch('/agents/:id/permissions', adminAuth, async (req, res) => {
  try {
    const permissions = req.body;
    const agentId = req.params.id;

    const agent = await Agent.findByIdAndUpdate(
      agentId,
      { $set: { permissions } },
      { new: true }
    ).select('-password');

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.json(agent);
  } catch (error) {
    console.error('Error updating agent permissions:', error);
    res.status(500).json({ message: 'Failed to update permissions' });
  }
});

// Update agent commission settings
router.put('/agents/:id/commission', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      chatCommissionPercentage, 
      affiliateCommissionPercentage, 
      customRatesEnabled,
      bonusThresholds 
    } = req.body;

    // Validate percentages
    if (chatCommissionPercentage < 0 || chatCommissionPercentage > 100) {
      return res.status(400).json({ error: 'Chat commission percentage must be between 0 and 100' });
    }
    if (affiliateCommissionPercentage < 0 || affiliateCommissionPercentage > 100) {
      return res.status(400).json({ error: 'Affiliate commission percentage must be between 0 and 100' });
    }

    // Ensure total percentages don't exceed 100%
    const totalPercentage = chatCommissionPercentage + affiliateCommissionPercentage;
    if (totalPercentage > 100) {
      return res.status(400).json({ 
        error: `Total commission percentages (${totalPercentage}%) cannot exceed 100%` 
      });
    }

    const agent = await Agent.findByIdAndUpdate(
      id,
      {
        'commissionSettings.chatCommissionPercentage': chatCommissionPercentage,
        'commissionSettings.affiliateCommissionPercentage': affiliateCommissionPercentage,
        'commissionSettings.customRatesEnabled': customRatesEnabled,
        'commissionSettings.bonusThresholds': bonusThresholds || []
      },
      { new: true }
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({
      message: 'Commission settings updated successfully',
      agent: {
        id: agent._id,
        name: agent.name,
        agentId: agent.agentId,
        commissionSettings: agent.commissionSettings
      }
    });
  } catch (error) {
    console.error('Error updating commission settings:', error);
    res.status(500).json({ error: 'Failed to update commission settings' });
  }
});

// Get agent commission settings
router.get('/agents/:id/commission', adminAuth, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({
      agentId: agent.agentId,
      name: agent.name,
      commissionSettings: agent.commissionSettings
    });
  } catch (error) {
    console.error('Error fetching commission settings:', error);
    res.status(500).json({ error: 'Failed to fetch commission settings' });
  }
});

// Get and update default commission settings
router.get('/commission-settings', adminAuth, async (req, res) => {
  try {
    const existing = await CommissionSettings.findOne().sort({ updatedAt: -1 });
    const settings = existing
      ? {
          defaultAdminPercentage: existing.defaultAdminPercentage,
          defaultAgentPercentage: existing.defaultAgentPercentage,
          defaultAffiliatePercentage: existing.defaultAffiliatePercentage,
        }
      : {
          defaultAdminPercentage: 50,
          defaultAgentPercentage: 30,
          defaultAffiliatePercentage: 20,
        };

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching commission settings:', error);
    res.status(500).json({ error: 'Failed to fetch commission settings' });
  }
});

router.put('/commission-settings', adminAuth, async (req, res) => {
  try {
    const { 
      defaultAdminPercentage, 
      defaultAgentPercentage, 
      defaultAffiliatePercentage 
    } = req.body;

    // Validate percentages
    if (defaultAdminPercentage < 0 || defaultAdminPercentage > 100) {
      return res.status(400).json({ error: 'Admin percentage must be between 0 and 100' });
    }
    if (defaultAgentPercentage < 0 || defaultAgentPercentage > 100) {
      return res.status(400).json({ error: 'Agent percentage must be between 0 and 100' });
    }
    if (defaultAffiliatePercentage < 0 || defaultAffiliatePercentage > 100) {
      return res.status(400).json({ error: 'Affiliate percentage must be between 0 and 100' });
    }

    // Validate that percentages total 100%
    const total = defaultAdminPercentage + defaultAgentPercentage + defaultAffiliatePercentage;
    if (total !== 100) {
      return res.status(400).json({ 
        error: `Commission percentages must total 100%. Current total: ${total}%` 
      });
    }

    // Persist to database (upsert single settings document)
    const saved = await CommissionSettings.findOneAndUpdate(
      {},
      {
        defaultAdminPercentage,
        defaultAgentPercentage,
        defaultAffiliatePercentage,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: 'Commission settings updated successfully',
      settings: {
        defaultAdminPercentage: saved.defaultAdminPercentage,
        defaultAgentPercentage: saved.defaultAgentPercentage,
        defaultAffiliatePercentage: saved.defaultAffiliatePercentage,
      },
    });
  } catch (error) {
    console.error('Error updating commission settings:', error);
    res.status(500).json({ error: 'Failed to update commission settings' });
  }
});

// Get subscription statistics
router.get('/subscription-stats', adminAuth, async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate('userId', 'username email')
      .sort({ createdAt: -1 });

    // Get active subscriptions count
    const activeSubscriptions = subscriptions.filter(sub => 
      sub.status === 'active' && new Date(sub.endDate) > new Date()
    ).length;

    // Calculate total revenue (sum of all active subscription prices)
    const totalRevenue = subscriptions.reduce((sum, sub) => {
      if (sub.status === 'active' && new Date(sub.endDate) > new Date()) {
        return sum + (sub.price || 0);
      }
      return sum;
    }, 0);

    // Get subscription distribution by plan
    const subscriptionsByPlan = subscriptions.reduce((acc, sub) => {
      if (sub.status === 'active' && new Date(sub.endDate) > new Date()) {
        acc[sub.type] = (acc[sub.type] || 0) + 1;
      }
      return acc;
    }, {});

    // Get recent purchases with null checks for user data
    const recentPurchases = subscriptions
      .filter(sub => sub.status === 'active' && sub.userId) // Only include subs with valid user references
      .slice(0, 10)
      .map(sub => ({
        id: sub._id,
        username: sub.userId?.username || 'Deleted User',
        email: sub.userId?.email || 'N/A',
        plan: sub.type,
        amount: sub.price,
        date: sub.createdAt,
        status: sub.status
      }));

    res.json({
      activeSubscriptions,
      totalRevenue,
      subscriptionsByPlan,
      recentPurchases
    });
  } catch (error) {
    console.error('Error fetching subscription stats:', error);
    res.status(500).json({ message: 'Failed to fetch subscription statistics' });
  }
});

// Subscription Plan Management Routes
router.get('/subscription-plans', adminAuth, async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ price: 1 });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ message: 'Failed to fetch subscription plans' });
  }
});

router.post('/subscription-plans', adminAuth, async (req, res) => {
  try {
    // Normalize and validate inputs
    const {
      name,
      type = 'coin_package',
      price,
      coins,
      bonusCoins = 0,
      features = {},
      description,
      isActive
    } = req.body || {};

    // Basic checks to avoid generic 500s
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (type !== 'coin_package' && type !== 'subscription') {
      return res.status(400).json({ message: 'Invalid type. Must be coin_package or subscription' });
    }
    if (price == null || Number(price) <= 0) {
      return res.status(400).json({ message: 'Price must be greater than 0' });
    }
    if (type === 'coin_package' && (coins == null || Number(coins) <= 0)) {
      return res.status(400).json({ message: 'Coins must be greater than 0 for coin packages' });
    }
    if (type === 'subscription' && !description) {
      return res.status(400).json({ message: 'Description is required for subscriptions' });
    }

    const planData = {
      name,
      type,
      price: Number(price),
      coins: Number(coins) || 0,
      bonusCoins: Number(bonusCoins) || 0,
      features: features || {}
    };

    // Only include description if it's provided
    if (description) {
      planData.description = description;
    }

    if (typeof isActive === 'boolean') {
      planData.isActive = isActive;
    }

    const plan = new SubscriptionPlan(planData);

    await plan.save();
    res.status(201).json(plan);
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    if (error?.name === 'ValidationError') {
      const details = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: 'Validation failed', details });
    }
    if (error?.code === 11000) {
      return res.status(400).json({ message: 'A plan with this name already exists' });
    }
    res.status(500).json({ message: 'Failed to create subscription plan' });
  }
});

router.put('/subscription-plans/:id', adminAuth, async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }
    res.json(plan);
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ message: 'Failed to update subscription plan' });
  }
});

router.delete('/subscription-plans/:id', adminAuth, async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    // Check if there are any active subscriptions using this plan
    const activeSubscriptions = await Subscription.find({
      type: plan.name,
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (activeSubscriptions.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete plan with active subscriptions'
      });
    }

    await plan.remove();
    res.json({ message: 'Subscription plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({ message: 'Failed to delete subscription plan' });
  }
});

// Add coins to user (admin only)
router.post('/users/:userId/add-coins', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason = 'Admin coin addition' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add coins to user
    await user.addCoins(amount, { reason, addedBy: req.admin.adminId });

    res.json({
      success: true,
      message: `${amount} coins added to ${user.username}`,
      user: {
        username: user.username,
        coins: user.coins
      }
    });

  } catch (error) {
    console.error('Error adding coins:', error);
    res.status(500).json({ error: 'Failed to add coins' });
  }
});

// Get user details with coins
router.get('/users/:userId', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .populate('subscription')
      .populate('affiliateAgent', 'agentId name');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        status: user.status,
        coins: user.coins,
        credits: user.credits, // Keep for backward compatibility if needed
        subscription: user.subscription,
        affiliateAgent: user.affiliateAgent,
        registrationSource: user.registrationSource,
        createdAt: user.createdAt,
        lastActiveDate: user.lastActiveDate
      }
    });

  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Global commission settings
router.put('/settings/global-commission', adminAuth, async (req, res) => {
  try {
    const { adminPercentage, agentPercentage, affiliatePercentage } = req.body;

    // Validate percentages
    if (adminPercentage < 0 || adminPercentage > 100 ||
        agentPercentage < 0 || agentPercentage > 100 ||
        affiliatePercentage < 0 || affiliatePercentage > 100) {
      return res.status(400).json({ error: 'All percentages must be between 0 and 100' });
    }

    // Ensure total percentages equal 100%
    const totalPercentage = adminPercentage + agentPercentage + affiliatePercentage;
    if (Math.abs(totalPercentage - 100) > 0.1) { // Allow small floating point differences
      return res.status(400).json({ 
        error: `Total commission percentages (${totalPercentage.toFixed(1)}%) must equal 100%` 
      });
    }

    // For now, we'll store this in memory or you could create a GlobalSettings model
    // TODO: Save to GlobalSettings collection
    global.commissionSettings = {
      adminPercentage,
      agentPercentage,
      affiliatePercentage,
      coinValue: global.commissionSettings?.coinValue || 1.0, // Preserve existing coin value
      updatedAt: new Date()
    };

    res.json({
      message: 'Global commission settings updated successfully',
      settings: {
        adminPercentage,
        agentPercentage,
        affiliatePercentage,
        coinValue: global.commissionSettings.coinValue
      }
    });
  } catch (error) {
    console.error('Error updating global commission settings:', error);
    res.status(500).json({ error: 'Failed to update global commission settings' });
  }
});

router.get('/settings/global-commission', adminAuth, async (req, res) => {
  try {
    // Return stored settings or default values
    const settings = global.commissionSettings || {
      adminPercentage: 50,
      agentPercentage: 30,
      affiliatePercentage: 20,
      coinValue: 1.0
    };

    res.json(settings);
  } catch (error) {
    console.error('Error fetching global commission settings:', error);
    res.status(500).json({ error: 'Failed to fetch global commission settings' });  }
});

// Coin value management
router.put('/settings/coin-value', adminAuth, async (req, res) => {
  try {
    const { coinValue } = req.body;

    // Validate coin value
    if (!coinValue || coinValue <= 0 || coinValue > 100) {
      return res.status(400).json({ error: 'Coin value must be between $0.01 and $100.00' });
    }

    // Initialize commission settings if they don't exist
    if (!global.commissionSettings) {
      global.commissionSettings = {
        adminPercentage: 50,
        agentPercentage: 30,
        affiliatePercentage: 20,
        coinValue: 1.0
      };
    }

    // Update coin value
    global.commissionSettings.coinValue = parseFloat(coinValue);
    global.commissionSettings.updatedAt = new Date();

    // Log the change for audit purposes
    console.log(`Admin updated coin value to $${coinValue} at ${new Date().toISOString()}`);

    res.json({
      message: 'Coin value updated successfully',
      coinValue: global.commissionSettings.coinValue,
      impact: {
        agentEarningsPerCoin: (global.commissionSettings.coinValue * global.commissionSettings.agentPercentage / 100).toFixed(2),
        affiliateEarningsPerCoin: (global.commissionSettings.coinValue * global.commissionSettings.affiliatePercentage / 100).toFixed(2),
        adminEarningsPerCoin: (global.commissionSettings.coinValue * global.commissionSettings.adminPercentage / 100).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error updating coin value:', error);
    res.status(500).json({ error: 'Failed to update coin value' });
  }
});

router.get('/settings/coin-value', adminAuth, async (req, res) => {
  try {
    const coinValue = global.commissionSettings?.coinValue || 1.0;
    
    res.json({
      coinValue,
      impact: {
        agentEarningsPerCoin: (coinValue * (global.commissionSettings?.agentPercentage || 30) / 100).toFixed(2),
        affiliateEarningsPerCoin: (coinValue * (global.commissionSettings?.affiliatePercentage || 20) / 100).toFixed(2),
        adminEarningsPerCoin: (coinValue * (global.commissionSettings?.adminPercentage || 50) / 100).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error fetching coin value:', error);
    res.status(500).json({ error: 'Failed to fetch coin value' });
  }
});

// Get all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const User = require('../models/User');
    const users = await User.find({}, {
      password: 0, // Exclude password field
      __v: 0
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all user assignments
router.get('/assignments', adminAuth, async (req, res) => {
  try {
    const AgentCustomer = require('../models/AgentCustomer');
    const assignments = await AgentCustomer.find({})
      .populate('customerId', 'username email')
      .populate('agentId', 'name agentId')
      .sort({ createdAt: -1 });

    console.log('Raw assignments from DB:', assignments.length);
    assignments.forEach((assignment, index) => {
      console.log(`Assignment ${index + 1}:`, {
        _id: assignment._id,
        customerId: assignment.customerId,
        agentId: assignment.agentId,
        createdAt: assignment.createdAt
      });
    });

    // Transform the response to match frontend expectations
    const transformedAssignments = assignments.map(assignment => ({
      _id: assignment._id,
      customerId: assignment.customerId?._id || assignment.customerId,
      agentId: assignment.agentId?._id || assignment.agentId,
      user: assignment.customerId,
      agent: assignment.agentId,
      createdAt: assignment.createdAt,
      status: assignment.status
    }));

    console.log('Transformed assignments:', transformedAssignments);

    res.json({
      success: true,
      assignments: transformedAssignments
    });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// Create new user assignment
router.post('/assignments', adminAuth, async (req, res) => {
  try {
    const { userId, agentId } = req.body;
    
    if (!userId || !agentId) {
      return res.status(400).json({ error: 'User ID and Agent ID are required' });
    }

    console.log('Creating assignment:', { userId, agentId, adminId: req.admin._id });

    const AgentCustomer = require('../models/AgentCustomer');
    const User = require('../models/User');
    const Agent = require('../models/Agent');
    
    // Verify user and agent exist
    const [user, agent] = await Promise.all([
      User.findById(userId),
      Agent.findById(agentId)
    ]);

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (!agent) {
      return res.status(400).json({ error: 'Agent not found' });
    }
    
    // Check if assignment already exists
    const existingAssignment = await AgentCustomer.findOne({
      customerId: userId,
      agentId: agentId
    });

    if (existingAssignment) {
      return res.status(400).json({ error: 'User is already assigned to this agent' });
    }

    const assignment = new AgentCustomer({
      customerId: userId,
      agentId: agentId,
      assignedBy: req.admin._id, // Get from authenticated admin
      assignmentType: 'manual',
      status: 'active'
    });

    console.log('Assignment object before save:', assignment.toObject());

    await assignment.save();

    console.log('Assignment saved successfully:', assignment._id);

    // Populate the response
    await assignment.populate('customerId', 'username email');
    await assignment.populate('agentId', 'name agentId');

    // Transform response to match frontend expectations
    const transformedAssignment = {
      _id: assignment._id,
      customerId: assignment.customerId._id,
      agentId: assignment.agentId._id,
      user: assignment.customerId,
      agent: assignment.agentId,
      createdAt: assignment.createdAt,
      status: assignment.status
    };

    res.status(201).json({
      success: true,
      assignment: transformedAssignment
    });
  } catch (error) {
    console.error('Error creating assignment:', error);
    
    if (error.code === 11000) {
      // Handle duplicate key error
      return res.status(400).json({ 
        error: 'Assignment already exists or there is a duplicate key conflict. Please try again or contact support.' 
      });
    }
    
    res.status(500).json({ error: 'Failed to create assignment: ' + error.message });
  }
});

// Delete user assignment
router.delete('/assignments/:id', adminAuth, async (req, res) => {
  try {
    const AgentCustomer = require('../models/AgentCustomer');
    const assignment = await AgentCustomer.findByIdAndDelete(req.params.id);

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });  }
});

// ============== ESCORT MANAGEMENT ROUTES ==============

// Get Swedish regions for dropdown
router.get('/swedish-regions', adminAuth, (req, res) => {
  try {
    res.json({
      success: true,
      regions: getSwedishRegions()
    });
  } catch (error) {
    console.error('Error fetching Swedish regions:', error);
    res.status(500).json({ error: 'Failed to fetch regions' });
  }
});

// Get relationship statuses for dropdown
router.get('/relationship-statuses', adminAuth, (req, res) => {
  try {
    res.json({
      success: true,
      statuses: getRelationshipStatuses()
    });
  } catch (error) {
    console.error('Error fetching relationship statuses:', error);
    res.status(500).json({ error: 'Failed to fetch relationship statuses' });
  }
});

// Get all escorts
router.get('/escorts', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', featured = '' } = req.query;
    
    const query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
        { region: { $regex: search, $options: 'i' } },
        { profession: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status !== '') {
      query.status = status;
    }
    
    // Featured filter
    if (featured !== '') {
      query.featured = featured === 'true';
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [escorts, totalCount] = await Promise.all([
      Escort.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Escort.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      escorts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + escorts.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching escorts:', error);
    res.status(500).json({ error: 'Failed to fetch escorts' });
  }
});

// Get escort by ID
router.get('/escorts/:id', adminAuth, async (req, res) => {
  try {
    const escort = await Escort.findById(req.params.id);
    
    if (!escort) {
      return res.status(404).json({ error: 'Escort not found' });
    }
    
    res.json({
      success: true,
      escort
    });
  } catch (error) {
    console.error('Error fetching escort:', error);
    res.status(500).json({ error: 'Failed to fetch escort' });
  }
});

// Create new escort
router.post('/escorts', adminAuth, async (req, res) => {
  try {
    const {
      username,
      firstName,
      gender,
      profileImage,
      country,
      region,
      relationshipStatus,
      interests,
      profession,
      height,
      dateOfBirth
    } = req.body;
    
    // Validation
    if (!username || !gender || !region) {
      return res.status(400).json({ 
        error: 'Username, gender, and region are required' 
      });
    }
    
    // Normalize and validate Swedish region
    let normalizedRegion = region;
    if (typeof region === 'string') {
      try {
        const { normalizeSwedishRegion } = require('../constants/swedishRegions');
        normalizedRegion = normalizeSwedishRegion(region) || region;
      } catch {}
    }
    if (!isValidSwedishRegion(normalizedRegion)) {
      return res.status(400).json({ 
        error: 'Invalid region. Please select a valid Swedish region (län)',
        validRegions: getSwedishRegions()
      });
    }
    
    // Validate relationship status if provided
    if (relationshipStatus && !isValidRelationshipStatus(relationshipStatus)) {
      return res.status(400).json({
        error: 'Invalid relationship status. Please select a valid relationship status',
        validStatuses: getRelationshipStatuses(),
        providedStatus: relationshipStatus
      });
    }
    
    // Check if username already exists
    const existingEscort = await Escort.findOne({ username });
    if (existingEscort) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const escort = new Escort({
      username: username.trim(),
      firstName: firstName?.trim() || '',
      gender,
      profileImage: profileImage || '',
      country: country?.trim() || 'Sweden',
      region: normalizedRegion,
      relationshipStatus: relationshipStatus?.trim() || '',
      interests: interests || [],
      profession: profession?.trim() || '',
      height: height ? parseInt(height) : null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      createdBy: {
        id: req.admin._id,
        type: 'Admin'
      }
    });
    
    await escort.save();
    
    res.status(201).json({
      success: true,
      escort,
      message: 'Escort profile created successfully'
    });
  } catch (error) {
    console.error('Error creating escort:', error);
    if (error.code === 11000 && error.keyPattern?.username) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create escort profile' });
  }
});

// Update escort
router.put('/escorts/:id', adminAuth, async (req, res) => {
  try {
    const {
      username,
      firstName,
      gender,
      profileImage,
      country,
      region,
      relationshipStatus,
      interests,
      profession,
      height,
      dateOfBirth
    } = req.body;
    
    const updateData = {};
    if (username !== undefined) updateData.username = username?.trim();
    if (firstName !== undefined) updateData.firstName = firstName?.trim();
    if (gender !== undefined) updateData.gender = gender;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (country !== undefined) updateData.country = country?.trim();
    if (region !== undefined) {
      let normalizedRegionUpdate = region?.trim();
      try {
        const { normalizeSwedishRegion } = require('../constants/swedishRegions');
        const norm = normalizeSwedishRegion(region);
        if (norm) normalizedRegionUpdate = norm;
      } catch {}
      updateData.region = normalizedRegionUpdate;
    }
    if (relationshipStatus !== undefined) updateData.relationshipStatus = relationshipStatus?.trim();
    if (interests !== undefined) updateData.interests = interests;
    if (profession !== undefined) updateData.profession = profession?.trim();
    if (height !== undefined) updateData.height = height ? parseInt(height) : null;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    
    const escort = await Escort.findByIdAndUpdate(
      req.params.id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!escort) {
      return res.status(404).json({ error: 'Escort not found' });
    }
    
    res.json({
      success: true,
      escort,
      message: 'Escort profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating escort:', error);
    if (error.code === 11000 && error.keyPattern?.username) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to update escort profile' });
  }
});

// Delete escort
router.delete('/escorts/:id', adminAuth, async (req, res) => {
  try {
    const escort = await Escort.findByIdAndDelete(req.params.id);
    
    if (!escort) {
      return res.status(404).json({ error: 'Escort not found' });
    }
    
    res.json({
      success: true,
      message: 'Escort profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting escort:', error);
    res.status(500).json({ error: 'Failed to delete escort profile' });
  }
});

// Get escort profiles (different from escorts - these are agent-created profiles)
router.get('/escort-profiles', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    
    const query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
      const [profiles, totalCount] = await Promise.all([
      EscortProfile.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      EscortProfile.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      profiles,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + profiles.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching escort profiles:', error);
    res.status(500).json({ error: 'Failed to fetch escort profiles' });
  }
});

// Update escort profile status
router.patch('/escort-profiles/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active or inactive' });
    }
      const profile = await EscortProfile.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!profile) {
      return res.status(404).json({ error: 'Escort profile not found' });
    }
    
    res.json({
      success: true,
      profile,
      message: `Profile status updated to ${status}`
    });
  } catch (error) {
    console.error('Error updating escort profile status:', error);
    res.status(500).json({ error: 'Failed to update profile status' });
  }
});

// Delete escort profile
router.delete('/escort-profiles/:id', adminAuth, async (req, res) => {
  try {
    const profile = await EscortProfile.findByIdAndDelete(req.params.id);
    
    if (!profile) {
      return res.status(404).json({ error: 'Escort profile not found' });
    }
    
    res.json({
      success: true,
      message: 'Escort profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting escort profile:', error);
    res.status(500).json({ error: 'Failed to delete escort profile' });
  }
});

// Get all escort profiles (unified view of both admin-created and agent-created)
router.get('/all-escort-profiles', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', type = '' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let results = [];
    
    // Fetch admin-created escorts
    const escortQuery = {};
    if (status) {
      escortQuery.status = status;
    }
    if (search) {
      escortQuery.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } },
        { region: { $regex: search, $options: 'i' } },
        { profession: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Fetch agent-created escort profiles
    const profileQuery = {};
    if (status) {
      profileQuery.status = status;
    }
    if (search) {
      profileQuery.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } }
      ];
    }
      const [escorts, escortProfiles] = await Promise.all([
      type === 'agent' ? [] : Escort.find(escortQuery),
      type === 'admin' ? [] : EscortProfile.find(profileQuery)
    ]);
      // Combine and normalize the data
    const escortData = escorts.map(escort => ({
      id: escort._id,
      name: escort.firstName || escort.username,
      age: escort.dateOfBirth ? Math.floor((Date.now() - escort.dateOfBirth) / (365.25 * 24 * 60 * 60 * 1000)) : null,
      location: `${escort.region || ''}, ${escort.country || ''}`.replace(/^,\s*|,\s*$/g, ''),
      description: `${escort.gender || ''} | ${escort.profession || ''}`.replace(/^\s*\|\s*|\s*\|\s*$/g, ''),
      images: escort.profileImage ? [escort.profileImage] : [],
      status: escort.status || 'active',
      featured: false,
      createdBy: escort.createdBy ? {
        id: escort.createdBy.id ? escort.createdBy.id.toString() : null,
        type: escort.createdBy.type || 'Admin'
      } : null,
      type: 'admin-created',
      createdAt: escort.createdAt,
      // Preserve all original Escort fields for modal display
      username: escort.username,
      firstName: escort.firstName,
      gender: escort.gender,
      profileImage: escort.profileImage,
      country: escort.country,
      region: escort.region,
      relationshipStatus: escort.relationshipStatus,
      interests: escort.interests,
      profession: escort.profession,
      height: escort.height,
      dateOfBirth: escort.dateOfBirth
    }));
    
    const profileData = escortProfiles.map(profile => ({
      id: profile._id,
      name: profile.firstName || profile.username,
      age: profile.dateOfBirth ? Math.floor((Date.now() - profile.dateOfBirth) / (365.25 * 24 * 60 * 60 * 1000)) : null,
      location: `${profile.region || ''}, ${profile.country || ''}`.replace(/^,\s*|,\s*$/g, ''),
      description: `${profile.gender || ''} | ${profile.profession || ''}`.replace(/^\s*\|\s*|\s*\|\s*$/g, ''),
      images: profile.profileImage ? [profile.profileImage] : [],
      status: profile.status,
      featured: false,
      createdBy: profile.createdBy ? {
        id: profile.createdBy.id ? profile.createdBy.id.toString() : null,
        type: profile.createdBy.type || 'Agent'
      } : null,
      type: 'agent-created',
      createdAt: profile.createdAt,
      // Preserve all original EscortProfile fields for modal display
      username: profile.username,
      firstName: profile.firstName,
      gender: profile.gender,
      profileImage: profile.profileImage,
      country: profile.country,
      region: profile.region,
      relationshipStatus: profile.relationshipStatus,
      interests: profile.interests,
      profession: profile.profession,
      height: profile.height,
      dateOfBirth: profile.dateOfBirth,
      serialNumber: profile.serialNumber,
      massMailActive: profile.massMailActive
    }));
    
    // Combine and sort by creation date
    results = [...escortData, ...profileData].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Apply pagination
    const totalCount = results.length;
    const paginatedResults = results.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      profiles: paginatedResults,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + paginatedResults.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching all escort profiles:', error);
    res.status(500).json({ error: 'Failed to fetch escort profiles' });
  }
});

// Get coin purchases for admin dashboard
router.get('/coin-purchases', adminAuth, async (req, res) => {
  try {
    // Get all users with coin purchase history
    const usersWithPurchases = await User.find({
      'coins.purchaseHistory.0': { $exists: true }
    }).select('username email coins.purchaseHistory coins.totalPurchased createdAt');

    // Flatten purchase history and add user info
    const allPurchases = [];
    
    usersWithPurchases.forEach(user => {
      user.coins.purchaseHistory.forEach(purchase => {
        allPurchases.push({
          _id: purchase._id,
          userId: user._id,
          username: user.username,
          email: user.email,
          amount: purchase.amount,
          price: purchase.price,
          bonusAmount: purchase.bonusAmount || 0,
          packageId: purchase.packageId,
          date: purchase.date,
          userRegistrationDate: user.createdAt
        });
      });
    });

    // Sort by purchase date (newest first)
    allPurchases.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate statistics
    const stats = {
      totalPurchases: allPurchases.length,
      totalRevenue: allPurchases.reduce((sum, purchase) => sum + purchase.price, 0),
      totalCoinsDistributed: allPurchases.reduce((sum, purchase) => sum + purchase.amount, 0),
      totalBonusCoins: allPurchases.reduce((sum, purchase) => sum + purchase.bonusAmount, 0),
      uniqueBuyers: usersWithPurchases.length,
      averageSpendPerUser: usersWithPurchases.length > 0 
        ? allPurchases.reduce((sum, purchase) => sum + purchase.price, 0) / usersWithPurchases.length 
        : 0
    };

    // Get recent purchases (last 50)
    const recentPurchases = allPurchases.slice(0, 50);

    res.json({
      success: true,
      stats,
      purchases: recentPurchases,
      totalCount: allPurchases.length
    });

  } catch (error) {
    console.error('Error fetching coin purchases:', error);
    res.status(500).json({ error: 'Failed to fetch coin purchases' });
  }
});

// ======================
// ADMIN AFFILIATE ROUTES
// ======================

// Get all affiliate links and stats
router.get('/admin/affiliate-links', adminAuth, async (req, res) => {
  try {
    const AffiliateLink = require('../models/AffiliateLink');
    
    const affiliateLinks = await AffiliateLink.find({})
      .populate('agentId', 'agentId name email')
      .sort({ createdAt: -1 });

    const stats = await AffiliateLink.aggregate([
      {
        $group: {
          _id: null,
          totalLinks: { $sum: 1 },
          activeLinks: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalClicks: { $sum: '$clickCount' },
          totalRegistrations: { $sum: '$registrationCount' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        totalLinks: 0,
        activeLinks: 0,
        totalClicks: 0,
        totalRegistrations: 0
      },
      links: affiliateLinks.map(link => ({
        id: link._id,
        agentId: link.agentId?.agentId || 'Unknown',
        agentName: link.agentId?.name || 'Unknown',
        affiliateCode: link.affiliateCode,
        isActive: link.isActive,
        clickCount: link.clickCount || 0,
        registrationCount: link.registrationCount || 0,
        createdAt: link.createdAt,
        lastUsed: link.lastUsed,
        conversionRate: link.clickCount > 0 ? ((link.registrationCount || 0) / link.clickCount * 100).toFixed(2) : 0
      }))
    });

  } catch (error) {
    console.error('Error fetching affiliate links:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate links' });
  }
});

// Get affiliate referrals overview
router.get('/admin/affiliate-referrals', adminAuth, async (req, res) => {
  try {
    const referrals = await User.find({ 
      'referral.affiliateCode': { $exists: true, $ne: null } 
    })
    .populate('referral.referredBy', 'agentId name')
    .select('username email createdAt totalCoinsUsed lastActive referral')
    .sort({ createdAt: -1 });

    const stats = await User.aggregate([
      { $match: { 'referral.affiliateCode': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          totalCoinsUsed: { $sum: '$totalCoinsUsed' },
          activeReferrals: {
            $sum: {
              $cond: [
                { $gte: ['$lastActive', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        totalReferrals: 0,
        totalCoinsUsed: 0,
        activeReferrals: 0
      },
      referrals: referrals.map(user => ({
        id: user._id,
        username: user.username,
        email: user.email,
        joinedDate: user.createdAt,
        totalCoinsUsed: user.totalCoinsUsed || 0,
        lastActive: user.lastActive,
        affiliateCode: user.referral.affiliateCode,
        referredByAgent: user.referral.referredBy?.name || 'Unknown',
        referredByAgentId: user.referral.referredBy?.agentId || 'Unknown',
        isActive: user.lastActive && new Date() - new Date(user.lastActive) < 30 * 24 * 60 * 60 * 1000
      }))
    });

  } catch (error) {
    console.error('Error fetching affiliate referrals:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate referrals' });
  }
});

// Get affiliate statistics overview
router.get('/admin/affiliate-stats', adminAuth, async (req, res) => {
  try {
    const AffiliateLink = require('../models/AffiliateLink');
    
    // Get overall affiliate link stats
    const linkStats = await AffiliateLink.aggregate([
      {
        $group: {
          _id: null,
          totalLinks: { $sum: 1 },
          activeLinks: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalClicks: { $sum: '$clickCount' },
          totalRegistrations: { $sum: '$registrationCount' }
        }
      }
    ]);

    // Get referral stats
    const referralStats = await User.aggregate([
      { $match: { 'referral.affiliateCode': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          totalCoinsUsed: { $sum: '$totalCoinsUsed' },
          activeReferrals: {
            $sum: {
              $cond: [
                { $gte: ['$lastActive', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        links: linkStats[0] || {
          totalLinks: 0,
          activeLinks: 0,
          totalClicks: 0,
          totalRegistrations: 0
        },
        referrals: referralStats[0] || {
          totalReferrals: 0,
          totalCoinsUsed: 0,
          activeReferrals: 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching affiliate stats:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate stats' });
  }
});

// ======================
// AFFILIATE MANAGEMENT ROUTES
// ======================

// Get all affiliate links (admin view)
router.get('/affiliate-links', adminAuth, async (req, res) => {
  try {
    const affiliateLinks = await AffiliateLink.find()
      .populate('agentId', 'agentId name email')
      .sort({ createdAt: -1 });

    const frontendUrl = resolveFrontendUrl(req);

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
          link: `${frontendUrl}/register?ref=${link.affiliateCode}`
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
router.get('/affiliate-referrals', adminAuth, async (req, res) => {
  try {
    const referrals = await User.find({
      'referral.affiliateCode': { $exists: true, $ne: null }
    })
    .select('username email createdAt totalCoinsUsed lastActive referral')
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

module.exports = router;
