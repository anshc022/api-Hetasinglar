const express = require('express');
const router = express.Router();
const AgentCustomer = require('../models/AgentCustomer');
const AffiliateRegistration = require('../models/AffiliateRegistration');
const User = require('../models/User');
const Agent = require('../models/Agent');
const { adminAuth, agentAuth } = require('../auth');

// ======================
// USER ASSIGNMENT MANAGEMENT
// ======================

// Assign user to agent
router.post('/assign-user', adminAuth, async (req, res) => {
  try {
    const {
      customerId,
      agentId,
      assignmentType = 'manual',
      priority = 'medium',
      customCommissionRates,
      notes,
      restrictions
    } = req.body;

    // Validate required fields
    if (!customerId || !agentId) {
      return res.status(400).json({ error: 'Customer ID and Agent ID are required' });
    }

    // Check if user and agent exist
    const user = await User.findById(customerId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if assignment already exists
    const existingAssignment = await AgentCustomer.findOne({ customerId, agentId });
    if (existingAssignment) {
      return res.status(400).json({ error: 'User is already assigned to this agent' });
    }

    // Create assignment
    const assignment = await AgentCustomer.assignCustomerToAgent(
      customerId,
      agentId,
      req.user.id,
      {
        assignmentType,
        priority,
        customCommissionRates,
        notes,
        restrictions
      }
    );

    // Update all existing chats for this customer to have the new agentId
    const Chat = require('../models/Chat');
    const chatUpdateResult = await Chat.updateMany(
      { customerId: customerId },
      { $set: { agentId: agentId } }
    );
    
    console.log(`Updated ${chatUpdateResult.modifiedCount} chat(s) with new agent assignment for customer ${customerId}`);

    // Update agent's active customers count
    await Agent.findByIdAndUpdate(agentId, {
      $inc: { 'stats.activeCustomers': 1 }
    });

    res.status(201).json({
      success: true,
      assignment,
      message: 'User assigned to agent successfully'
    });

  } catch (error) {
    console.error('Error assigning user to agent:', error);
    res.status(500).json({ error: 'Failed to assign user to agent' });
  }
});

// Bulk assign users to agent
router.post('/bulk-assign', adminAuth, async (req, res) => {
  try {
    const { customerIds, agentId, assignmentType = 'manual', priority = 'medium' } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: 'Customer IDs array is required' });
    }

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Check if agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const assignments = [];
    const errors = [];

    for (const customerId of customerIds) {
      try {
        // Check if user exists
        const user = await User.findById(customerId);
        if (!user) {
          errors.push({ customerId, error: 'User not found' });
          continue;
        }

        // Check if assignment already exists
        const existingAssignment = await AgentCustomer.findOne({ customerId, agentId });
        if (existingAssignment) {
          errors.push({ customerId, error: 'User already assigned to this agent' });
          continue;
        }

        // Create assignment
        const assignment = await AgentCustomer.assignCustomerToAgent(
          customerId,
          agentId,
          req.user.id,
          { assignmentType, priority }
        );

        // Update all existing chats for this customer to have the new agentId
        const Chat = require('../models/Chat');
        const chatUpdateResult = await Chat.updateMany(
          { customerId: customerId },
          { $set: { agentId: agentId } }
        );
        
        console.log(`Updated ${chatUpdateResult.modifiedCount} chat(s) with new agent assignment for customer ${customerId}`);

        assignments.push(assignment);

      } catch (error) {
        errors.push({ customerId, error: error.message });
      }
    }

    // Update agent's active customers count
    if (assignments.length > 0) {
      await Agent.findByIdAndUpdate(agentId, {
        $inc: { 'stats.activeCustomers': assignments.length }
      });
    }

    res.json({
      success: true,
      assignmentsCreated: assignments.length,
      assignments,
      errors,
      message: `${assignments.length} users assigned successfully`
    });

  } catch (error) {
    console.error('Error bulk assigning users:', error);
    res.status(500).json({ error: 'Failed to bulk assign users' });
  }
});

// Update user assignment
router.put('/assignment/:assignmentId', adminAuth, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const {
      status,
      priority,
      customCommissionRates,
      notes,
      restrictions,
      tags
    } = req.body;

    const assignment = await AgentCustomer.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Update fields
    if (status !== undefined) assignment.status = status;
    if (priority !== undefined) assignment.priority = priority;
    if (customCommissionRates !== undefined) assignment.customCommissionRates = customCommissionRates;
    if (notes !== undefined) assignment.notes = notes;
    if (restrictions !== undefined) assignment.restrictions = restrictions;
    if (tags !== undefined) assignment.tags = tags;

    await assignment.save();

    res.json({
      success: true,
      assignment,
      message: 'Assignment updated successfully'
    });

  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// Remove user assignment
router.delete('/assignment/:assignmentId', adminAuth, async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await AgentCustomer.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Update all existing chats for this customer to remove the agentId
    const Chat = require('../models/Chat');
    const chatUpdateResult = await Chat.updateMany(
      { customerId: assignment.customerId, agentId: assignment.agentId },
      { $unset: { agentId: '' } }
    );
    
    console.log(`Removed agent assignment from ${chatUpdateResult.modifiedCount} chat(s) for customer ${assignment.customerId}`);

    // Update agent's active customers count
    await Agent.findByIdAndUpdate(assignment.agentId, {
      $inc: { 'stats.activeCustomers': -1 }
    });

    await AgentCustomer.findByIdAndDelete(assignmentId);

    res.json({
      success: true,
      message: 'User assignment removed successfully'
    });

  } catch (error) {
    console.error('Error removing assignment:', error);
    res.status(500).json({ error: 'Failed to remove assignment' });
  }
});

// Get agent's assigned customers
router.get('/agent/:agentId/customers', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { status, priority, page = 1, limit = 50 } = req.query;

    // Check if user can access this agent's data
    if (req.user.agentId !== agentId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const options = {
      status,
      priority,
      limit: parseInt(limit)
    };

    const customers = await AgentCustomer.getAgentCustomers(agentId, options);
    const totalCount = await AgentCustomer.countDocuments({
      agentId,
      ...(status && { status }),
      ...(priority && { priority })
    });

    res.json({
      customers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching agent customers:', error);
    res.status(500).json({ error: 'Failed to fetch agent customers' });
  }
});

// Get user's assigned agents
router.get('/user/:userId/agents', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const agents = await AgentCustomer.getCustomerAgents(userId);

    res.json({
      agents
    });

  } catch (error) {
    console.error('Error fetching user agents:', error);
    res.status(500).json({ error: 'Failed to fetch user agents' });
  }
});

// Get all assignments (admin view)
router.get('/assignments', adminAuth, async (req, res) => {
  try {
    const { agentId, status, priority, page = 1, limit = 50 } = req.query;

    const match = {};
    if (agentId) match.agentId = agentId;
    if (status) match.status = status;
    if (priority) match.priority = priority;

    const assignments = await AgentCustomer.find(match)
      .populate('customerId', 'username email dateOfBirth sex status')
      .populate('agentId', 'agentId name status')
      .populate('assignedBy', 'username email')
      .sort({ assignedDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalCount = await AgentCustomer.countDocuments(match);

    res.json({
      assignments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// ======================
// AFFILIATE MANAGEMENT
// ======================

// Create affiliate registration
router.post('/affiliate/register', adminAuth, async (req, res) => {
  try {
    const {
      affiliateAgentId,
      customerId,
      registrationSource = 'manual_assignment',
      referralCode,
      notes
    } = req.body;

    // Validate required fields
    if (!affiliateAgentId || !customerId) {
      return res.status(400).json({ error: 'Affiliate Agent ID and Customer ID are required' });
    }

    // Check if agent and customer exist
    const agent = await Agent.findById(affiliateAgentId);
    if (!agent) {
      return res.status(404).json({ error: 'Affiliate agent not found' });
    }

    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if registration already exists
    const existingReg = await AffiliateRegistration.findOne({ affiliateAgentId, customerId });
    if (existingReg) {
      return res.status(400).json({ error: 'Customer is already registered under this affiliate agent' });
    }

    // Create affiliate registration
    const registration = await AffiliateRegistration.registerCustomer(
      affiliateAgentId,
      customerId,
      {
        registrationSource,
        referralCode,
        notes
      }
    );

    // Update user's affiliate agent
    await User.findByIdAndUpdate(customerId, {
      affiliateAgent: affiliateAgentId,
      registrationSource: 'affiliate'
    });

    // Update agent's affiliate stats
    await Agent.findByIdAndUpdate(affiliateAgentId, {
      $inc: {
        'affiliateData.totalReferrals': 1,
        'affiliateData.activeReferrals': 1
      }
    });

    res.status(201).json({
      success: true,
      registration,
      message: 'Customer registered under affiliate agent successfully'
    });

  } catch (error) {
    console.error('Error registering affiliate customer:', error);
    res.status(500).json({ error: 'Failed to register affiliate customer' });
  }
});

// Get affiliate customers
router.get('/affiliate/:affiliateAgentId/customers', agentAuth, async (req, res) => {
  try {
    const { affiliateAgentId } = req.params;
    const { status, startDate, endDate, page = 1, limit = 50 } = req.query;

    // Check if user can access this affiliate agent's data
    if (req.user.agentId !== affiliateAgentId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const options = {
      status,
      startDate,
      endDate,
      limit: parseInt(limit)
    };

    const customers = await AffiliateRegistration.getAffiliateCustomers(affiliateAgentId, options);
    const stats = await AffiliateRegistration.getAffiliateStats(affiliateAgentId, startDate, endDate);

    res.json({
      customers,
      stats: stats[0] || {
        totalCustomers: 0,
        activeCustomers: 0,
        totalCommission: 0,
        totalTransactions: 0,
        totalCredits: 0,
        averageCommissionPerCustomer: 0,
        averageTransactionsPerCustomer: 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching affiliate customers:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate customers' });
  }
});

// Update affiliate registration status
router.put('/affiliate/registration/:registrationId', adminAuth, async (req, res) => {
  try {
    const { registrationId } = req.params;
    const { status, notes } = req.body;

    const registration = await AffiliateRegistration.findById(registrationId);
    if (!registration) {
      return res.status(404).json({ error: 'Affiliate registration not found' });
    }

    const oldStatus = registration.status;
    
    if (status !== undefined) registration.status = status;
    if (notes !== undefined) registration.notes = notes;

    await registration.save();

    // Update agent's affiliate stats if status changed
    if (status && status !== oldStatus) {
      const agent = await Agent.findById(registration.affiliateAgentId);
      if (agent) {
        if (status === 'active' && oldStatus !== 'active') {
          agent.affiliateData.activeReferrals += 1;
        } else if (status !== 'active' && oldStatus === 'active') {
          agent.affiliateData.activeReferrals -= 1;
        }
        await agent.save();
      }
    }

    res.json({
      success: true,
      registration,
      message: 'Affiliate registration updated successfully'
    });

  } catch (error) {
    console.error('Error updating affiliate registration:', error);
    res.status(500).json({ error: 'Failed to update affiliate registration' });
  }
});

// Get affiliate overview (admin)
router.get('/affiliate/overview', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get top affiliate agents
    const topAffiliates = await Agent.find({
      'affiliateData.isAffiliate': true,
      status: 'active'
    })
    .sort({ 'affiliateData.referralEarnings': -1 })
    .limit(10)
    .select('agentId name affiliateData earnings');

    // Get affiliate stats
    const affiliateStats = await AffiliateRegistration.aggregate([
      {
        $match: startDate || endDate ? {
          registrationDate: {
            ...(startDate && { $gte: new Date(startDate) }),
            ...(endDate && { $lte: new Date(endDate) })
          }
        } : {}
      },
      {
        $group: {
          _id: null,
          totalRegistrations: { $sum: 1 },
          activeRegistrations: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          totalCommission: { $sum: '$totalCommissionEarned' },
          totalTransactions: { $sum: '$totalTransactions' },
          averageCommissionPerRegistration: { $avg: '$totalCommissionEarned' }
        }
      }
    ]);

    res.json({
      topAffiliates,
      stats: affiliateStats[0] || {
        totalRegistrations: 0,
        activeRegistrations: 0,
        totalCommission: 0,
        totalTransactions: 0,
        averageCommissionPerRegistration: 0
      }
    });

  } catch (error) {
    console.error('Error fetching affiliate overview:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate overview' });
  }
});

// ======================
// MIGRATION & FIX ROUTES
// ======================

// Fix existing chat assignments (run once to fix historical data)
router.post('/fix-chat-assignments', agentAuth, async (req, res) => {
  try {
    // Check if agent is authenticated
    if (!req.agent && !req.admin) {
      return res.status(403).json({ error: 'Agent or admin authentication required' });
    }

    console.log('Starting chat assignment fix...');
    
    // Get all active assignments
    const assignments = await AgentCustomer.find({ status: 'active' });
    console.log(`Found ${assignments.length} active assignments to process`);
    
    const Chat = require('../models/Chat');
    let totalUpdated = 0;
    
    for (const assignment of assignments) {
      try {
        // Update all chats for this customer to have the correct agentId
        const updateResult = await Chat.updateMany(
          { 
            customerId: assignment.customerId,
            // Only update chats that don't have an agentId or have a different agentId
            $or: [
              { agentId: { $exists: false } },
              { agentId: null },
              { agentId: { $ne: assignment.agentId } }
            ]
          },
          { $set: { agentId: assignment.agentId } }
        );
        
        if (updateResult.modifiedCount > 0) {
          console.log(`Updated ${updateResult.modifiedCount} chats for customer ${assignment.customerId} -> agent ${assignment.agentId}`);
          totalUpdated += updateResult.modifiedCount;
        }
      } catch (error) {
        console.error(`Error updating chats for assignment ${assignment._id}:`, error);
      }
    }
    
    console.log(`Chat assignment fix completed. Total chats updated: ${totalUpdated}`);
    
    res.json({
      success: true,
      message: `Successfully updated ${totalUpdated} chat assignments`,
      processedAssignments: assignments.length,
      updatedChats: totalUpdated
    });

  } catch (error) {
    console.error('Error fixing chat assignments:', error);
    res.status(500).json({ error: 'Failed to fix chat assignments' });
  }
});

module.exports = router;
