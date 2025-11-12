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
  const { domain } = req.query;
  const hours = Math.min(parseInt(req.query.hours || 48), 72); // cap to protect performance
    
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
    let userQuery = User.find(query)
      .select('_id username email createdAt registrationDomain lastActiveDate')
      .sort({ createdAt: -1 })
      .lean();
    // Try to use an index hint if available; fall back gracefully if not
    let newCustomers;
    try {
      newCustomers = await userQuery.hint({ status: 1, createdAt: -1 }).exec();
    } catch (e) {
      if (e?.codeName === 'BadValue' || e?.code === 2) {
        console.warn('Index hint not available for users(status, createdAt) - retrying without hint');
        newCustomers = await userQuery.exec();
      } else {
        throw e;
      }
    }
    
    // Check which customers already have active chats
    const customerIds = newCustomers.map(customer => customer._id);
    let chatsBaseQuery = Chat.find({
      customerId: { $in: customerIds },
      status: { $in: ['assigned', 'active'] }
    }).select('customerId').lean();
    let existingChats;
    try {
      existingChats = await chatsBaseQuery.hint({ customerId: 1, status: 1 }).exec();
    } catch (e) {
      if (e?.codeName === 'BadValue' || e?.code === 2) {
        console.warn('Index hint not available for chats(customerId, status) - retrying without hint');
        existingChats = await chatsBaseQuery.exec();
      } else {
        throw e;
      }
    }
    
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

// Get all customers with search and pagination
router.get('/all-customers', agentAuth, async (req, res) => {
  try {
    const { search, limit = 50, page = 1 } = req.query;
    
    let query = {
      status: 'active'
    };
    
    // Add search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { username: searchRegex },
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    // Get all customers
    const customers = await User.find(query)
      .select('_id username email firstName lastName createdAt registrationDomain lastActiveDate')
      .sort({ createdAt: -1, lastActiveDate: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    // Get total count for pagination
    const totalCount = await User.countDocuments(query);
    
    res.json({
      customers,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      hasMore: (page * limit) < totalCount
    });
    
  } catch (error) {
    console.error('Error fetching all customers:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
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

// Check if a customer already has an existing chat with an escort
router.get('/check-existing', agentAuth, async (req, res) => {
  try {
    const { customerId, escortId } = req.query;

    if (!customerId || !escortId) {
      return res.status(400).json({ message: 'Customer ID and Escort ID are required' });
    }

    const escort = await EscortProfile.findOne({
      _id: escortId,
      agentId: req.agent._id,
      isActive: true
    }).select('_id agentId');

    if (!escort) {
      return res.status(404).json({ message: 'Escort not found or not accessible' });
    }

    const existingChat = await Chat.findOne({ customerId, escortId })
      .sort({ updatedAt: -1 })
      .populate('customerId', 'username email createdAt')
      .populate('escortId', 'firstName lastName stageName profileImage')
      .populate('agentId', 'name agentId');

    if (!existingChat) {
      return res.status(404).json({ exists: false });
    }

    res.json({
      exists: true,
      chat: existingChat,
      status: existingChat.status,
      isClosed: existingChat.status === 'closed',
      lastInteractionAt: existingChat.messages?.length
        ? existingChat.messages[existingChat.messages.length - 1].timestamp
        : existingChat.updatedAt
    });
  } catch (error) {
    console.error('Error checking existing contact:', error);
    res.status(500).json({ message: 'Failed to check existing contact' });
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
    
    // Check if customer already has a chat with this escort
    const existingChat = await Chat.findOne({ customerId, escortId }).sort({ updatedAt: -1 });

    if (existingChat) {
      const now = new Date();
      const previousStatus = existingChat.status || 'unknown';
      const shouldReopen = ['closed', 'pushed', 'new'].includes(existingChat.status);
      const hadMessages = Array.isArray(existingChat.messages) && existingChat.messages.length > 0;

      existingChat.agentId = req.agent._id;
      existingChat.status = 'assigned';
      existingChat.domain = domain || existingChat.domain || escort.domain;
      existingChat.updatedAt = now;

      if (shouldReopen) {
        const reopenMessage = {
          _id: new mongoose.Types.ObjectId(),
          senderId: 'system',
          senderType: 'system',
          type: 'system',
          content: `Conversation reopened by agent. Status changed from ${previousStatus} to assigned.`,
          timestamp: now,
          isRead: false
        };
        existingChat.messages = existingChat.messages || [];
        existingChat.messages.push(reopenMessage);
      }

      if (initialMessage) {
        const escortMessage = {
          _id: new mongoose.Types.ObjectId(),
          senderId: escortId,
          senderType: 'escort',
          type: 'text',
          content: initialMessage,
          timestamp: now,
          isRead: false,
          sender: 'agent',
          isFirstMessage: !hadMessages
        };
        existingChat.messages = existingChat.messages || [];
        existingChat.messages.push(escortMessage);
        existingChat.lastMessageTime = now;
      }

      await existingChat.save();

      await User.findByIdAndUpdate(customerId, { lastActiveDate: now });

      const populatedExistingChat = await Chat.findById(existingChat._id)
        .populate('customerId', 'username email createdAt')
        .populate('escortId', 'firstName lastName stageName profileImage')
        .populate('agentId', 'name agentId');

      if (req.app.locals.wss && shouldReopen) {
        const notification = {
          type: 'chat_reopened',
          chatId: populatedExistingChat._id,
          customerId: populatedExistingChat.customerId?._id,
          escortId: populatedExistingChat.escortId?._id,
          timestamp: now.toISOString(),
          message: 'Existing contact reopened',
          chat: populatedExistingChat
        };

        req.app.locals.wss.clients.forEach(client => {
          if (client.readyState === 1 && client.clientInfo?.role === 'agent') {
            try {
              client.send(JSON.stringify(notification));
            } catch (wsError) {
              console.error('Error sending chat reopen notification:', wsError);
            }
          }
        });
      }

      return res.status(200).json({
        success: true,
        reused: true,
        message: shouldReopen
          ? 'Existing contact reopened successfully'
          : 'Existing chat already active',
        chat: populatedExistingChat
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

    // Send WebSocket notification to all agents for real-time dashboard updates
    if (req.app.locals.wss) {
      const notification = {
        type: 'new_chat_created',
        chatId: populatedChat._id,
        customerId: populatedChat.customerId._id,
        escortId: populatedChat.escortId._id,
        timestamp: new Date().toISOString(),
        message: 'New first contact created',
        chat: populatedChat
      };

      req.app.locals.wss.clients.forEach(client => {
        if (client.readyState === 1 && client.clientInfo?.role === 'agent') {
          try {
            client.send(JSON.stringify(notification));
          } catch (error) {
            console.error('Error sending WebSocket notification:', error);
          }
        }
      });
      
      console.log('WebSocket notification sent for new chat:', populatedChat._id);
    }

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
