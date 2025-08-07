const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const User = require('../models/User');
const EscortProfile = require('../models/EscortProfile');
const Agent = require('../models/Agent');
const { agentAuth } = require('../auth');
const mongoose = require('mongoose');

// Get newly registered customers (last 24-48 hours)
router.get('/new-customers', agentAuth, async (req, res) => {
  try {
    const { domain, hours = 48 } = req.query;
    
    // Calculate time threshold for "new" customers
    const timeThreshold = new Date();
    timeThreshold.setHours(timeThreshold.getHours() - parseInt(hours));
    
    let query = {
      createdAt: { $gte: timeThreshold },
      status: 'active'
    };
    
    // Filter by domain if specified
    if (domain) {
      query.registrationDomain = domain;
    }
    
    // Get new customers who haven't been assigned yet
    const newCustomers = await User.find(query)
      .select('_id username email createdAt registrationDomain lastActiveDate')
      .sort({ createdAt: -1 });
    
    // Check which customers already have active chats
    const customerIds = newCustomers.map(customer => customer._id);
    const existingChats = await Chat.find({
      customerId: { $in: customerIds },
      status: { $in: ['assigned', 'active'] }
    }).select('customerId');
    
    const assignedCustomerIds = new Set(existingChats.map(chat => chat.customerId.toString()));
    
    // Filter out customers who already have active chats
    const unassignedCustomers = newCustomers.filter(customer => 
      !assignedCustomerIds.has(customer._id.toString())
    );
    
    res.json({
      newCustomers: unassignedCustomers,
      totalNew: newCustomers.length,
      totalUnassigned: unassignedCustomers.length
    });
    
  } catch (error) {
    console.error('Error fetching new customers:', error);
    res.status(500).json({ message: 'Failed to fetch new customers' });
  }
});

// Get available escort profiles for assignment
router.get('/available-escorts', agentAuth, async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = {
      status: 'active'
    };
    
    // Add search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      if (query.$or) {
        // If $or already exists, we need to wrap it in an $and
        query = {
          ...query,
          $and: [
            { $or: query.$or },
            {
              $or: [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { stageName: searchRegex },
                { profession: searchRegex }
              ]
            }
          ]
        };
        delete query.$or;
      } else {
        query.$or = [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { stageName: searchRegex },
          { profession: searchRegex }
        ];
      }
    }
    
    const escorts = await EscortProfile.find(query)
      .select('_id firstName lastName stageName profileImage profession serialNumber status createdBy')
      .sort({ firstName: 1 });
    
    // Manually populate the createdBy field for both formats
    const populatedEscorts = await Promise.all(
      escorts.map(async (escort) => {
        const escortObj = escort.toObject();
        
        // Handle new format where createdBy is an object with id
        if (escortObj.createdBy && escortObj.createdBy.id) {
          try {
            const agent = await Agent.findById(escortObj.createdBy.id).select('name agentId email');
            escortObj.createdByAgent = agent;
          } catch (error) {
            console.error('Error populating agent:', error);
          }
        }
        // Handle old format where createdBy is directly the agent ID
        else if (escortObj.createdBy && typeof escortObj.createdBy === 'string') {
          try {
            const agent = await Agent.findById(escortObj.createdBy).select('name agentId email');
            escortObj.createdByAgent = agent;
          } catch (error) {
            console.error('Error populating agent:', error);
          }
        }
        
        return escortObj;
      })
    );
    
    res.json({ escorts: populatedEscorts });
    
  } catch (error) {
    console.error('Error fetching available escorts:', error);
    res.status(500).json({ message: 'Failed to fetch available escorts' });
  }
});

// Create first contact - assign customer to escort
router.post('/create-contact', agentAuth, async (req, res) => {
  try {
    const { customerId, escortId, domain, initialMessage } = req.body;
    
    // Validation
    if (!customerId || !escortId) {
      return res.status(400).json({ message: 'Customer ID and Escort ID are required' });
    }
    
    // Verify customer exists and is not already assigned
    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    // Verify escort exists and belongs to the agent
    const escort = await EscortProfile.findOne({
      _id: escortId,
      agentId: req.agent._id,
      isActive: true
    });
    
    if (!escort) {
      return res.status(404).json({ message: 'Escort not found or not accessible' });
    }
    
    // Check if customer already has an active chat with this escort
    const existingChat = await Chat.findOne({
      customerId,
      escortId,
      status: { $in: ['assigned', 'active'] }
    });
    
    if (existingChat) {
      return res.status(400).json({ 
        message: 'Customer already has an active chat with this escort',
        chatId: existingChat._id
      });
    }
    
    // Create new chat
    const newChat = new Chat({
      customerId,
      escortId,
      agentId: req.agent._id,
      status: 'assigned',
      isFirstContact: true,
      domain: domain || escort.domain,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // Add initial system message
    const systemMessage = {
      _id: new mongoose.Types.ObjectId(),
      senderId: 'system',
      senderType: 'system',
      type: 'system',
      content: `First contact created by agent. Customer ${customer.username} assigned to ${escort.firstName}.`,
      timestamp: new Date(),
      isRead: false
    };
    
    newChat.messages.push(systemMessage);
    
    // Add initial message from escort if provided
    if (initialMessage) {
      const escortMessage = {
        _id: new mongoose.Types.ObjectId(),
        senderId: escortId,
        senderType: 'escort',
        type: 'text',
        content: initialMessage,
        timestamp: new Date(),
        isRead: false,
        sender: 'agent', // Since agent is sending on behalf of escort
        isFirstMessage: true
      };
      
      newChat.messages.push(escortMessage);
      newChat.lastMessageTime = new Date();
    }
    
    await newChat.save();
    
    // Update customer's last active date
    await User.findByIdAndUpdate(customerId, {
      lastActiveDate: new Date()
    });
    
    // Return the created chat with populated data
    const populatedChat = await Chat.findById(newChat._id)
      .populate('customerId', 'username email createdAt')
      .populate('escortId', 'firstName lastName stageName profileImage')
      .populate('agentId', 'name agentId');
    
    res.status(201).json({
      success: true,
      message: 'First contact created successfully',
      chat: populatedChat
    });
    
  } catch (error) {
    console.error('Error creating first contact:', error);
    res.status(500).json({ message: 'Failed to create first contact' });
  }
});

// Get domains/platforms available
router.get('/domains', agentAuth, async (req, res) => {
  try {
    // Get unique agents who created escort profiles
    const escortAgents = await EscortProfile.find({
      status: 'active'
    }).populate({
      path: 'createdBy.id',
      select: 'name agentId email'
    }).select('createdBy');
    
    // Extract unique agents
    const agents = new Map();
    
    for (const escort of escortAgents) {
      if (escort.createdBy && escort.createdBy.id) {
        const agent = escort.createdBy.id;
        const agentKey = agent._id.toString();
        
        if (!agents.has(agentKey)) {
          agents.set(agentKey, {
            id: agent._id,
            name: agent.name || agent.agentId,
            agentId: agent.agentId,
            email: agent.email,
            displayName: agent.name || agent.agentId || agent.email
          });
        }
      }
    }
    
    // Also handle old format where createdBy is directly the agent ID
    const oldFormatEscorts = await EscortProfile.find({
      status: 'active',
      'createdBy.id': { $exists: false }
    }).populate('createdBy', 'name agentId email').select('createdBy');
    
    for (const escort of oldFormatEscorts) {
      if (escort.createdBy) {
        const agent = escort.createdBy;
        const agentKey = agent._id.toString();
        
        if (!agents.has(agentKey)) {
          agents.set(agentKey, {
            id: agent._id,
            name: agent.name || agent.agentId,
            agentId: agent.agentId,
            email: agent.email,
            displayName: agent.name || agent.agentId || agent.email
          });
        }
      }
    }
    
    const domains = Array.from(agents.values());
    
    res.json({ domains });
    
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({ message: 'Failed to fetch domains' });
  }
});

// Get recent first contacts created by agent
router.get('/recent-contacts', agentAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const recentContacts = await Chat.find({
      agentId: req.agent._id,
      isFirstContact: true
    })
    .populate('customerId', 'username email')
    .populate('escortId', 'firstName lastName stageName')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
    
    res.json({ recentContacts });
    
  } catch (error) {
    console.error('Error fetching recent contacts:', error);
    res.status(500).json({ message: 'Failed to fetch recent contacts' });
  }
});

// Get first contact statistics
router.get('/stats', agentAuth, async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    
    // Calculate date range
    let startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }
    
    const stats = await Chat.aggregate([
      {
        $match: {
          agentId: req.agent._id,
          isFirstContact: true,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalContacts: { $sum: 1 },
          successfulContacts: {
            $sum: {
              $cond: [
                { $gt: [{ $size: "$messages" }, 2] }, // More than system + first message
                1,
                0
              ]
            }
          }
        }
      }
    ]);
    
    const result = stats[0] || { totalContacts: 0, successfulContacts: 0 };
    result.successRate = result.totalContacts > 0 ? 
      (result.successfulContacts / result.totalContacts * 100).toFixed(1) : 0;
    
    res.json({ stats: result, period });
    
  } catch (error) {
    console.error('Error fetching first contact stats:', error);
    res.status(500).json({ message: 'Failed to fetch first contact stats' });
  }
});

module.exports = router;
