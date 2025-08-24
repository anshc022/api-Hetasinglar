const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const router = express.Router();
const Agent = require('../models/Agent');
const EscortProfile = require('../models/EscortProfile');
const Chat = require('../models/Chat');
const reminderService = require('../services/reminderService');
const { auth, agentAuth } = require('../auth');
const AgentImage = require('../models/AgentImage');

// Agent login - moved before auth middleware
router.post('/login', async (req, res) => {
  try {
    const { agentId, password } = req.body;

    if (!agentId || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const agent = await Agent.findOne({ agentId });

    if (!agent) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, agent.password);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { agentId: agent._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }  // Increased from 24h to 7 days
    );

    res.json({
      access_token: token,
      agent: {
        id: agent._id,
        agentId: agent.agentId,
        name: agent.name,
        stats: agent.stats
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// Get all escort profiles (PUBLIC - no auth required)
router.get('/escorts', async (req, res) => {
  try {
    const profiles = await EscortProfile.find({ status: 'active' })
      .populate('createdBy', 'name')
      .select('-__v')
      .sort({ createdAt: -1 });
    
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching escort profiles:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escort profiles',
      error: error.message 
    });
  }
});

// Create a new agent (PUBLIC - no auth required, but should be restricted in production)
router.post('/', async (req, res) => {
  try {
    const { agentId, name, email, password, role, permissions } = req.body;

    console.log('=== AGENT CREATION DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Extracted fields:', { agentId, name, email, password, role, permissions });

    // Check if agent already exists
    const queryConditions = [{ agentId }];
    
    // Only check email if it's provided
    if (email) {
      queryConditions.push({ email });
    }

    console.log('Query conditions:', JSON.stringify(queryConditions, null, 2));
    
    const existingAgent = await Agent.findOne({ 
      $or: queryConditions
    });

    console.log('Existing agent found:', existingAgent ? 'YES' : 'NO');
    if (existingAgent) {
      console.log('Existing agent details:', {
        agentId: existingAgent.agentId,
        email: existingAgent.email,
        name: existingAgent.name
      });
    }
    
    if (existingAgent) {
      // Check which field caused the conflict
      if (existingAgent.agentId === agentId) {
        console.log('Conflict reason: Agent ID already taken');
        return res.status(400).json({ message: 'Agent ID already taken' });
      } else if (email && existingAgent.email === email) {
        console.log('Conflict reason: Email already in use');
        return res.status(400).json({ message: 'Email already in use' });
      } else {
        console.log('Conflict reason: Unknown conflict');
        return res.status(400).json({ message: 'Agent already exists' });
      }
    }

    // Create the new agent
    const newAgent = new Agent({
      agentId,
      name,
      email,
      password, // will be hashed by pre-save hook
      role: role || 'agent',
      permissions: permissions || {
        canMessage: true,
        canModerate: false,
        canViewStats: true
      },
      stats: {
        liveMessageCount: 0,
        totalMessagesSent: 0,
        activeCustomers: 0
      }
    });

    await newAgent.save();

    // Return the new agent without password
    const agentResponse = {
      id: newAgent._id,
      agentId: newAgent.agentId,
      name: newAgent.name,
      email: newAgent.email,
      role: newAgent.role,
      permissions: newAgent.permissions,
      stats: newAgent.stats
    };

    res.status(201).json(agentResponse);
  } catch (error) {
    console.error('Error creating agent:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error', 
        details: error.message 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists` 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create agent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Protect all routes after this point
router.use(auth);

// Get agent dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    // Handle both auth middleware types
    const agentId = req.agent?._id || req.agent?.id;
    
    if (!agentId) {
      return res.status(401).json({ message: 'Agent ID not found in token' });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Get platform-wide stats
    const [totalLiveMessages, onlineCustomers] = await Promise.all([
      Agent.aggregate([
        { $group: { _id: null, total: { $sum: '$stats.liveMessageCount' } } }
      ]),
      // Mock online customers count - replace with actual logic
      Promise.resolve(25)
    ]);

    const platformStats = {
      totalLiveMessages: totalLiveMessages[0]?.total || 0,
      onlineCustomers,
      agentStats: {
        liveMessageCount: agent.stats.liveMessageCount || 0,
        totalMessagesSent: agent.stats.totalMessagesSent || 0,
        activeCustomers: agent.stats.activeCustomers || 0
      },
      reminders: agent.reminders || []
    };
    
    res.json(platformStats);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch dashboard data',
      error: error.message 
    });
  }
});

// Get agent profile
router.get('/profile', agentAuth, async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id).select('-password');
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    console.error('Error fetching agent profile:', error);
    res.status(500).json({ message: 'Failed to fetch agent profile' });
  }
});

// Get all agents
router.get('/', async (req, res) => {
  try {
    const agents = await Agent.find().select('-password');
    
    const formattedAgents = agents.map(agent => ({
      id: agent._id,
      agentId: agent.agentId,
      name: agent.name || '',
      email: agent.email || '',
      role: agent.role || 'agent',
      permissions: agent.permissions || {},
      stats: agent.stats || {
        avgResponseTime: 'N/A',
        totalMessages: 0,
        rating: 'N/A',
        activeChats: 0
      }
    }));
    
    res.json(formattedAgents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

// Create escort profile
router.post('/escorts', async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id);
    
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (!agent.permissions?.canCreateEscorts) {
      return res.status(403).json({ 
        message: 'Not authorized to create escort profiles. Please contact admin for permission.',
        code: 'PERMISSION_DENIED'
      });
    }

    // Generate unique serial number with timestamp and random string
    const serialNumber = `ESC${Date.now()}${Math.random().toString(36).substr(2, 5)}`;    const escortData = {
      ...req.body,
      createdBy: {
        id: req.agent._id,
        type: 'Agent'
      },
      serialNumber,
      status: 'active'
    };

    const escort = await EscortProfile.create(escortData);
    res.status(201).json(escort);
  } catch (error) {
    console.error('Error creating escort profile:', error);
    res.status(500).json({ 
      message: 'Failed to create escort profile',
      error: error.message 
    });
  }
});

// Get escorts created by the agent
router.get('/my-escorts', async (req, res) => {
  try {
    // Query for escorts with both old and new createdBy formats
    const escorts = await EscortProfile.find({ 
      $or: [
        { 'createdBy.id': req.agent._id },  // New format: { id, type }
        { 'createdBy': req.agent._id }      // Old format: just ObjectId
      ],
      status: 'active'
    }).sort({ createdAt: -1 });
    
    res.json(escorts);
  } catch (error) {
    console.error('Error fetching agent escorts:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escorts',
      error: error.message 
    });
  }
});

// Mark reminder as complete
router.post('/reminders/:id/complete', async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const reminder = agent.reminders.id(req.params.id);
    if (!reminder) {
      return res.status(404).json({ message: 'Reminder not found' });
    }

    reminder.completed = true;
    await agent.save();

    res.json(reminder);
  } catch (error) {
    console.error('Error marking reminder as complete:', error);
    res.status(500).json({ message: 'Failed to mark reminder as complete' });
  }
});

// Update an agent
router.put('/:id', async (req, res) => {
  try {
    const { name, email, role, permissions } = req.body;
    const agentIdFromBody = req.body.agentId;
    const agentIdFromParams = req.params.id;

    // Check for duplicate email/agentId if they're being changed
    const agent = await Agent.findById(agentIdFromParams);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (email !== agent.email || agentIdFromBody !== agent.agentId) {
      const duplicate = await Agent.findOne({
        $or: [
          { email, _id: { $ne: agentIdFromParams } },
          { agentId: agentIdFromBody, _id: { $ne: agentIdFromParams } }
        ]
      });

      if (duplicate) {
        return res.status(400).json({ 
          message: duplicate.email === email ? 
            'Email already in use' : 'Agent ID already taken' 
        });
      }
    }

    // Update the agent
    const updateData = {
      agentId: agentIdFromBody,
      name,
      email,
      role,
      permissions
    };

    const updatedAgent = await Agent.findByIdAndUpdate(
      agentIdFromParams, 
      updateData, 
      { new: true }
    ).select('-password');

    if (!updatedAgent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Format the response
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
    console.error('Error updating agent:', error);
    res.status(500).json({ message: 'Failed to update agent' });
  }
});

// Delete an agent
router.delete('/:id', async (req, res) => {
  try {
    const agentIdFromParams = req.params.id;
    const result = await Agent.findByIdAndDelete(agentIdFromParams);
    
    if (!result) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Failed to delete agent' });
  }
});

// Agent Chat Statistics Endpoints
router.get('/chats/detailed-stats', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { dateRange, startDate, endDate } = req.query;

    // Build date filter for earnings
    let earningsDateFilter = {};
    const now = new Date();
    
    if (startDate && endDate) {
      earningsDateFilter = {
        transactionDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z')
        }
      };
    } else if (dateRange) {
      switch (dateRange) {
        case 'today':
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          earningsDateFilter = { transactionDate: { $gte: startOfDay } };
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          const endOfYesterday = new Date(yesterday);
          endOfYesterday.setHours(23, 59, 59, 999);
          earningsDateFilter = { 
            transactionDate: { 
              $gte: yesterday, 
              $lte: endOfYesterday 
            } 
          };
          break;
        case 'last7days':
          const last7Days = new Date(now);
          last7Days.setDate(last7Days.getDate() - 7);
          earningsDateFilter = { transactionDate: { $gte: last7Days } };
          break;
        case 'last30days':
          const last30Days = new Date(now);
          last30Days.setDate(last30Days.getDate() - 30);
          earningsDateFilter = { transactionDate: { $gte: last30Days } };
          break;
        case 'thisMonth':
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          earningsDateFilter = { transactionDate: { $gte: startOfMonth } };
          break;
        case 'lastMonth':
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          earningsDateFilter = { 
            transactionDate: { 
              $gte: startOfLastMonth, 
              $lte: endOfLastMonth 
            } 
          };
          break;
      }
    }

    // Build chat date filter (for chats)
    let chatDateFilter = {};
    if (startDate && endDate) {
      chatDateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z')
        }
      };
    } else if (dateRange) {
      switch (dateRange) {
        case 'today':
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          chatDateFilter = { createdAt: { $gte: startOfDay } };
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          const endOfYesterday = new Date(yesterday);
          endOfYesterday.setHours(23, 59, 59, 999);
          chatDateFilter = { 
            createdAt: { 
              $gte: yesterday, 
              $lte: endOfYesterday 
            } 
          };
          break;
        case 'last7days':
          const last7Days = new Date(now);
          last7Days.setDate(last7Days.getDate() - 7);
          chatDateFilter = { createdAt: { $gte: last7Days } };
          break;
        case 'last30days':
          const last30Days = new Date(now);
          last30Days.setDate(last30Days.getDate() - 30);
          chatDateFilter = { createdAt: { $gte: last30Days } };
          break;
        case 'thisMonth':
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          chatDateFilter = { createdAt: { $gte: startOfMonth } };
          break;
        case 'lastMonth':
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          chatDateFilter = { 
            createdAt: { 
              $gte: startOfLastMonth, 
              $lte: endOfLastMonth 
            } 
          };
          break;
      }
    }

    // Fetch earnings for this agent
    const Earnings = require('../models/Earnings');
    const earnings = await Earnings.find({
      agentId,
      ...earningsDateFilter
    }).populate('userId', 'username')
      .populate('chatId', 'customerName')
      .sort({ transactionDate: -1 });

    // Find chats handled by this agent
    const chats = await Chat.find({
      assignedAgent: agentId,
      ...chatDateFilter
    }).populate('customer', 'username')
      .populate('escort', 'name')
      .sort({ createdAt: -1 });

    // Transform earnings data for frontend
    const earningsWithCoins = earnings.map(earning => ({
      _id: earning._id,
      customer: earning.userId?.username || 'Unknown',
      customerName: earning.userId?.username || 'Unknown',
      escortName: earning.chatId?.customerName || 'Unknown',
      coinsUsed: earning.coinsUsed || 0,
      totalAmount: earning.totalAmount || 0,
      commission: earning.agentCommission || 0,
      commissionPercentage: earning.agentCommissionPercentage || 30,
      transactionDate: earning.transactionDate,
      paymentStatus: earning.paymentStatus
    }));

    // Calculate chat statistics
    const summary = {
      totalChats: chats.length,
      totalMessages: 0,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      totalChatTime: 0,
      averageChatTime: 0,
      totalEarnings: earningsWithCoins.reduce((sum, e) => sum + e.commission, 0),
      totalCoinsUsed: earningsWithCoins.reduce((sum, e) => sum + e.coinsUsed, 0),
      totalTransactions: earningsWithCoins.length,
      averageEarningsPerChat: earningsWithCoins.length > 0 ? earningsWithCoins.reduce((sum, e) => sum + e.commission, 0) / earningsWithCoins.length : 0,
      activeChats: 0,
      completedChats: 0
    };

    const chatDetails = [];

    for (const chat of chats) {
      const messagesSent = chat.messages ? chat.messages.filter(m => m.senderType === 'agent').length : 0;
      const messagesReceived = chat.messages ? chat.messages.filter(m => m.senderType === 'user').length : 0;
      const totalMessages = messagesSent + messagesReceived;
      
      // Calculate chat duration in minutes
      let duration = 0;
      if (chat.endTime && chat.startTime) {
        duration = Math.round((new Date(chat.endTime) - new Date(chat.startTime)) / (1000 * 60));
      } else if (chat.startTime) {
        duration = Math.round((new Date() - new Date(chat.startTime)) / (1000 * 60));
      }

      // Find earnings for this chat
      const chatEarnings = earnings.filter(e => e.chatId && e.chatId._id.toString() === chat._id.toString());
      const totalCoinsUsed = chatEarnings.reduce((sum, e) => sum + (e.coinsUsed || 0), 0);
      const chatEarningsAmount = chatEarnings.reduce((sum, e) => sum + (e.agentCommission || 0), 0);

      summary.totalMessages += totalMessages;
      summary.totalMessagesSent += messagesSent;
      summary.totalMessagesReceived += messagesReceived;
      summary.totalChatTime += duration;

      if (chat.status === 'assigned') {
        summary.activeChats++;
      } else if (chat.status === 'closed') {
        summary.completedChats++;
      }

      chatDetails.push({
        _id: chat._id,
        customer: chat.customer?.username || 'Unknown',
        customerName: chat.customer?.username || 'Unknown',
        escort: chat.escort?.name || 'Unknown',
        escortName: chat.escort?.name || 'Unknown',
        status: chat.status,
        messagesSent,
        messagesReceived,
        duration,
        coinsUsed: totalCoinsUsed,
        earnings: chatEarningsAmount,
        createdAt: chat.createdAt
      });
    }

    // Calculate averages
    if (summary.totalChats > 0) {
      summary.averageChatTime = Math.round(summary.totalChatTime / summary.totalChats);
    }

    res.json({
      summary,
      chatDetails,
      earnings: earningsWithCoins,
      period: { dateRange, startDate, endDate }
    });

  } catch (error) {
    console.error('Error fetching agent chat statistics:', error);
    res.status(500).json({ 
      message: 'Failed to fetch chat statistics',
      error: error.message 
    });
  }
});

// Export agent chat statistics as CSV
router.get('/chats/export-stats', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { dateRange, startDate, endDate } = req.query;

    // Use same date filtering logic as above
    let dateFilter = {};
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z')
        }
      };
    } else if (dateRange) {
      switch (dateRange) {
        case 'today':
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          dateFilter = { createdAt: { $gte: startOfDay } };
          break;
        case 'last7days':
          const last7Days = new Date(now);
          last7Days.setDate(last7Days.getDate() - 7);
          dateFilter = { createdAt: { $gte: last7Days } };
          break;
        case 'last30days':
          const last30Days = new Date(now);
          last30Days.setDate(last30Days.getDate() - 30);
          dateFilter = { createdAt: { $gte: last30Days } };
          break;
      }
    }

    const chats = await Chat.find({
      assignedAgent: agentId,
      ...dateFilter
    }).populate('customer', 'username')
      .populate('escort', 'name')
      .sort({ createdAt: -1 });

    // Generate CSV content
    const csvHeaders = [
      'Chat ID',
      'Customer',
      'Escort', 
      'Status',
      'Messages Sent',
      'Messages Received',
      'Duration (minutes)',
      'Earnings ($)',
      'Created Date',
      'Start Time',
      'End Time'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    for (const chat of chats) {
      const messagesSent = chat.messages ? chat.messages.filter(m => m.senderType === 'agent').length : 0;
      const messagesReceived = chat.messages ? chat.messages.filter(m => m.senderType === 'user').length : 0;
      
      let duration = 0;
      if (chat.endTime && chat.startTime) {
        duration = Math.round((new Date(chat.endTime) - new Date(chat.startTime)) / (1000 * 60));
      } else if (chat.startTime) {
        duration = Math.round((new Date() - new Date(chat.startTime)) / (1000 * 60));
      }

      const earnings = messagesSent * 0.5;

      const row = [
        chat._id,
        `"${chat.customer?.username || 'Unknown'}"`,
        `"${chat.escort?.name || 'Unknown'}"`,
        chat.status,
        messagesSent,
        messagesReceived,
        duration,
        earnings.toFixed(2),
        chat.createdAt.toISOString().split('T')[0],
        chat.startTime ? chat.startTime.toISOString() : '',
        chat.endTime ? chat.endTime.toISOString() : ''
      ];

      csvContent += row.join(',') + '\n';
    }

    // Set headers for file download
    const filename = `agent-chat-stats-${dateRange || 'custom'}-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting agent chat statistics:', error);
    res.status(500).json({ 
      message: 'Failed to export chat statistics',
      error: error.message 
    });
  }
});

// Update chat info (for reminder system)
router.patch('/chats/:chatId/info', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const updates = req.body;
    
    // Validate chatId
    if (!chatId) {
      return res.status(400).json({ message: 'Chat ID is required' });
    }

    // Find and update the chat
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      success: true,
      message: 'Chat info updated successfully',
      chat: {
        _id: chat._id,
        reminderHandled: chat.reminderHandled,
        reminderHandledAt: chat.reminderHandledAt,
        reminderSnoozedUntil: chat.reminderSnoozedUntil,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating chat info:', error);
    res.status(500).json({ 
      message: 'Failed to update chat info',
      error: error.message 
    });
  }
});

// Get chats for live queue (used by reminder system)
router.get('/chats/live-queue', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    
    // Get chats assigned to this agent or available chats
    const chats = await Chat.find({
      $or: [
        { agentId: agentId },
        { status: 'new' }
      ]
    })
    .populate('customerId', 'username email')
    .populate('escortId', 'firstName lastName')
    .populate('agentId', 'name')
    .sort({ updatedAt: -1 })
    .limit(100); // Limit to recent chats

    // Add active user status and format for frontend
    const formattedChats = chats.map(chat => ({
      _id: chat._id,
      customerId: chat.customerId,
      escortId: chat.escortId,
      agentId: chat.agentId,
      status: chat.status,
      messages: chat.messages,
      customerName: chat.customerName,
      lastCustomerResponse: chat.lastCustomerResponse,
      lastAgentResponse: chat.lastAgentResponse,
      requiresFollowUp: chat.requiresFollowUp,
      followUpDue: chat.followUpDue,
      reminderHandled: chat.reminderHandled,
      reminderHandledAt: chat.reminderHandledAt,
      reminderSnoozedUntil: chat.reminderSnoozedUntil,
      isInPanicRoom: chat.isInPanicRoom,
      panicRoomEnteredAt: chat.panicRoomEnteredAt,
      panicRoomMovedAt: chat.panicRoomEnteredAt, // Add alias for frontend consistency
      panicRoomReason: chat.panicRoomReason,
      panicRoomNotes: chat.panicRoomNotes,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      isUserActive: false // This would be set by checking active users service
    }));

    res.json(formattedChats);
  } catch (error) {
    console.error('Error fetching live queue chats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch live queue chats',
      error: error.message 
    });
  }
});

// Get chats for a specific escort profile
router.get('/chats/live-queue/:escortId', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { escortId } = req.params;
    
    // Validate escortId
    if (!escortId || !mongoose.Types.ObjectId.isValid(escortId)) {
      return res.status(400).json({ message: 'Invalid escort ID' });
    }
    
    // First verify that the escort belongs to this agent
    const escort = await EscortProfile.findOne({
      _id: escortId,
      'createdBy.id': agentId
    });
    
    if (!escort) {
      return res.status(404).json({ message: 'Escort profile not found or not authorized' });
    }
    
    // Get chats for this specific escort
    const chats = await Chat.find({
      escortId: escortId,
      $or: [
        { agentId: agentId },
        { status: 'new' }
      ]
    })
    .populate('customerId', 'username email')
    .populate('escortId', 'firstName lastName')
    .populate('agentId', 'name')
    .sort({ updatedAt: -1 })
    .limit(100);

    // Format for frontend
    const formattedChats = chats.map(chat => ({
      _id: chat._id,
      customerId: chat.customerId,
      escortId: chat.escortId,
      agentId: chat.agentId,
      status: chat.status,
      messages: chat.messages,
      customerName: chat.customerName,
      lastCustomerResponse: chat.lastCustomerResponse,
      lastAgentResponse: chat.lastAgentResponse,
      requiresFollowUp: chat.requiresFollowUp,
      followUpDue: chat.followUpDue,
      reminderHandled: chat.reminderHandled,
      reminderHandledAt: chat.reminderHandledAt,
      reminderSnoozedUntil: chat.reminderSnoozedUntil,
      isInPanicRoom: chat.isInPanicRoom,
      panicRoomEnteredAt: chat.panicRoomEnteredAt,
      panicRoomMovedAt: chat.panicRoomEnteredAt,
      panicRoomReason: chat.panicRoomReason,
      panicRoomNotes: chat.panicRoomNotes,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      isUserActive: false
    }));

    res.json({
      success: true,
      data: formattedChats,
      escortProfile: {
        _id: escort._id,
        firstName: escort.firstName,
        lastName: escort.lastName,
        profileImage: escort.profileImage
      }
    });
  } catch (error) {
    console.error('Error fetching escort chats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escort chats',
      error: error.message 
    });
  }
});

// Get reminder statistics
router.get('/reminders/stats', agentAuth, async (req, res) => {
  try {
    const stats = await reminderService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching reminder stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch reminder statistics',
      error: error.message 
    });
  }
});

// Move chat to panic room
router.post('/chats/:chatId/panic-room', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { reason, notes } = req.body;
    const agentId = req.agent._id;
    
    // First check if chat exists and get current state
    const existingChat = await Chat.findById(chatId);
    
    if (!existingChat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // Check if chat is already in panic room
    if (existingChat.isInPanicRoom) {
      return res.status(400).json({ 
        message: 'Chat is already in panic room',
        isAlreadyInPanicRoom: true 
      });
    }
    
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        isInPanicRoom: true,
        panicRoomEnteredAt: new Date(),
        panicRoomReason: reason || 'Manual isolation',
        panicRoomEnteredBy: agentId,
        $push: {
          panicRoomNotes: {
            text: notes || 'Customer moved to panic room',
            agentId: agentId,
            agentName: req.agent.name
          }
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      success: true,
      message: 'Chat moved to panic room successfully',
      chat: {
        _id: chat._id,
        isInPanicRoom: chat.isInPanicRoom,
        panicRoomEnteredAt: chat.panicRoomEnteredAt,
        panicRoomReason: chat.panicRoomReason
      }
    });
  } catch (error) {
    console.error('Error moving chat to panic room:', error);
    res.status(500).json({ 
      message: 'Failed to move chat to panic room',
      error: error.message 
    });
  }
});

// Remove chat from panic room
router.post('/chats/:chatId/remove-panic-room', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { notes } = req.body;
    const agentId = req.agent._id;
    
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        isInPanicRoom: false,
        $push: {
          panicRoomNotes: {
            text: notes || 'Customer removed from panic room',
            agentId: agentId,
            agentName: req.agent.name
          }
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      success: true,
      message: 'Chat removed from panic room successfully',
      chat: {
        _id: chat._id,
        isInPanicRoom: chat.isInPanicRoom
      }
    });
  } catch (error) {
    console.error('Error removing chat from panic room:', error);
    res.status(500).json({ 
      message: 'Failed to remove chat from panic room',
      error: error.message 
    });
  }
});

// Add panic room note
router.post('/chats/:chatId/panic-room/notes', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;
    const agentId = req.agent._id;
    
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $push: {
          panicRoomNotes: {
            text: text,
            agentId: agentId,
            agentName: req.agent.name
          }
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      success: true,
      message: 'Panic room note added successfully',
      note: chat.panicRoomNotes[chat.panicRoomNotes.length - 1]
    });
  } catch (error) {
    console.error('Error adding panic room note:', error);
    res.status(500).json({ 
      message: 'Failed to add panic room note',
      error: error.message 
    });
  }
});

// Get panic room chats
router.get('/chats/panic-room', agentAuth, async (req, res) => {
  try {
    const chats = await Chat.find({
      isInPanicRoom: true
    })
    .populate('customerId', 'username email')
    .populate('escortId', 'firstName lastName')
    .populate('agentId', 'name')
    .sort({ panicRoomEnteredAt: -1 });

    // Format chats for frontend
    const formattedChats = chats.map(chat => ({
      _id: chat._id,
      customerId: chat.customerId,
      escortId: chat.escortId,
      agentId: chat.agentId,
      status: chat.status,
      messages: chat.messages,
      customerName: chat.customerName,
      isInPanicRoom: chat.isInPanicRoom,
      panicRoomEnteredAt: chat.panicRoomEnteredAt,
      panicRoomMovedAt: chat.panicRoomEnteredAt, // Add alias for frontend consistency
      panicRoomEnteredBy: chat.panicRoomEnteredBy,
      panicRoomReason: chat.panicRoomReason,
      panicRoomNotes: chat.panicRoomNotes,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    }));

    res.json({
      success: true,
      chats: formattedChats,
      count: formattedChats.length
    });
  } catch (error) {
    console.error('Error fetching panic room chats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch panic room chats',
      error: error.message 
    });
  }
});

// Image management endpoints

// Upload bulk images for agent's escort profile
router.post('/images/upload', agentAuth, async (req, res) => {
  try {
    const { images } = req.body; // Array of {filename, imageData, mimeType, size, description, tags, escortProfileId}
    const agentId = req.agent._id;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }
    
    // Validate and process images
    const savedImages = [];
    for (const imageData of images) {
      // Validate image size (max 5MB)
      if (imageData.size > 5 * 1024 * 1024) {
        return res.status(400).json({ message: `Image ${imageData.filename} is too large (max 5MB)` });
      }
      
      // Validate mime type
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(imageData.mimeType)) {
        return res.status(400).json({ message: `Invalid image type for ${imageData.filename}` });
      }
      
      // Use provided escortProfileId or find the first escort profile for the agent
      let escortProfileId = imageData.escortProfileId;
      if (!escortProfileId) {
        const escortProfile = await EscortProfile.findOne({ 
          $or: [
            { 'createdBy.id': agentId },  // New format: { id, type }
            { 'createdBy': agentId }      // Old format: just ObjectId
          ]
        });
        if (!escortProfile) {
          return res.status(404).json({ message: 'Escort profile not found. Please create an escort profile first.' });
        }
        escortProfileId = escortProfile._id;
      } else {
        // Verify the escort profile belongs to this agent
        const escortProfile = await EscortProfile.findOne({ 
          _id: escortProfileId,
          $or: [
            { 'createdBy.id': agentId },  // New format: { id, type }
            { 'createdBy': agentId }      // Old format: just ObjectId
          ]
        });
        if (!escortProfile) {
          return res.status(403).json({ message: 'Access denied to this escort profile' });
        }
      }
      
      const newImage = new AgentImage({
        agentId,
        escortProfileId: escortProfileId,
        filename: imageData.filename,
        imageData: imageData.imageData,
        mimeType: imageData.mimeType,
        size: imageData.size,
        description: imageData.description || '',
        tags: imageData.tags || []
      });
      
      await newImage.save();
      savedImages.push(newImage);
    }
    
    res.json({
      success: true,
      message: `Successfully uploaded ${savedImages.length} images`,
      images: savedImages.map(img => ({
        _id: img._id,
        filename: img.filename,
        size: img.size,
        description: img.description,
        tags: img.tags,
        uploadedAt: img.uploadedAt
      }))
    });
  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({ 
      message: 'Failed to upload images',
      error: error.message 
    });
  }
});

// Get all images for agent's escort profile
router.get('/images', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { escortProfileId } = req.query;
    
    // Build query filter
    let queryFilter = { agentId, isActive: true };
    if (escortProfileId) {
      queryFilter.escortProfileId = escortProfileId;
    }
    
    const images = await AgentImage.find(queryFilter).sort({ uploadedAt: -1 });
    
    res.json({
      success: true,
      images: images.map(img => ({
        _id: img._id,
        filename: img.filename,
        imageData: img.imageData,
        mimeType: img.mimeType,
        size: img.size,
        description: img.description,
        tags: img.tags,
        escortProfileId: img.escortProfileId,
        uploadedAt: img.uploadedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ 
      message: 'Failed to fetch images',
      error: error.message 
    });
  }
});

// Delete an image
router.delete('/images/:imageId', agentAuth, async (req, res) => {
  try {
    const { imageId } = req.params;
    const agentId = req.agent._id;
    
    const image = await AgentImage.findOne({ _id: imageId, agentId });
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    await AgentImage.findByIdAndUpdate(imageId, { isActive: false });
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ 
      message: 'Failed to delete image',
      error: error.message 
    });
  }
});

// Update image description/tags
router.put('/images/:imageId', agentAuth, async (req, res) => {
  try {
    const { imageId } = req.params;
    const { description, tags } = req.body;
    const agentId = req.agent._id;
    
    const image = await AgentImage.findOne({ _id: imageId, agentId });
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    await AgentImage.findByIdAndUpdate(imageId, {
      description: description || image.description,
      tags: tags || image.tags
    });
    
    res.json({
      success: true,
      message: 'Image updated successfully'
    });
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({ 
      message: 'Failed to update image',
      error: error.message 
    });
  }
});

// Update escort profile
router.put('/escorts/:id', agentAuth, async (req, res) => {
  try {
    const escortId = req.params.id;
    const agentId = req.agent._id;
    
    // Check if escort profile exists and belongs to the agent
    const existingEscort = await EscortProfile.findOne({
      _id: escortId,
      'createdBy.id': agentId
    });
    
    if (!existingEscort) {
      return res.status(404).json({ 
        message: 'Escort profile not found or not authorized to update' 
      });
    }

    // Update the escort profile
    const updatedEscort = await EscortProfile.findByIdAndUpdate(
      escortId,
      {
        ...req.body,
        updatedAt: new Date()
      },
      { new: true }
    );

    res.json(updatedEscort);
  } catch (error) {
    console.error('Error updating escort profile:', error);
    res.status(500).json({ 
      message: 'Failed to update escort profile',
      error: error.message 
    });
  }
});

// Get customer profile with chat history
router.get('/customers/:customerId', agentAuth, async (req, res) => {
  try {
    const { customerId } = req.params;
    const agentId = req.agent._id;

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }

    // Get the customer profile
    const AgentCustomer = require('../models/AgentCustomer');
    const customerData = await AgentCustomer.findOne({ 
      customerId: mongoose.Types.ObjectId(customerId), 
      agentId 
    }).populate('customerId', 'username email profileImage lastActive isActive registrationDate');

    if (!customerData) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Get chat history for this customer with any of the agent's escorts
    const escortProfiles = await EscortProfile.find({ agentId });
    const escortIds = escortProfiles.map(profile => profile._id);

    const chatHistory = await Chat.find({
      customerId: customerData.customerId._id,
      escortId: { $in: escortIds }
    }).sort({ createdAt: -1 }).lean();

    // Format the chat history
    const formattedHistory = chatHistory.map(chat => ({
      _id: chat._id,
      escortName: escortProfiles.find(e => e._id.toString() === chat.escortId.toString())?.firstName || 'Unknown',
      messageCount: chat.messages?.length || 0,
      duration: chat.endTime && chat.startTime 
        ? Math.round((new Date(chat.endTime) - new Date(chat.startTime)) / (1000 * 60))
        : null,
      status: chat.status,
      createdAt: chat.createdAt
    }));

    // Format the customer data
    const formattedCustomer = {
      _id: customerData.customerId._id,
      username: customerData.customerId.username,
      email: customerData.customerId.email,
      profileImage: customerData.customerId.profileImage,
      registrationDate: customerData.customerId.registrationDate,
      lastActivity: customerData.customerId.lastActive,
      isActive: customerData.customerId.isActive,
      assignedAgent: agentId,
      totalSpent: customerData.totalEarnings || 0,
      totalChats: customerData.totalChats || 0
    };

    res.json({
      success: true,
      customer: formattedCustomer,
      chatHistory: formattedHistory
    });
  } catch (error) {
    console.error('Error fetching customer profile:', error);
    res.status(500).json({ 
      message: 'Failed to fetch customer profile', 
      error: error.message 
    });
  }
});

// Get assigned customers for an agent
router.get('/agent-customers/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Access control - agents can only see their own assigned customers
    if (!req.admin && req.agent._id.toString() !== agentId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const AgentCustomer = require('../models/AgentCustomer');
    
    // Find all customers assigned to this agent
    const agentCustomers = await AgentCustomer.find({ agentId })
      .populate('customerId', 'username email profileImage lastActive isActive')
      .sort({ lastActive: -1 })
      .lean();
      
    // Format the response
    const customers = agentCustomers.map(customer => {
      return {
        _id: customer._id,
        customerId: customer.customerId,
        registrationDate: customer.registrationDate,
        lastActivity: customer.customerId?.lastActive || customer.lastActivity,
        isActive: customer.customerId?.isActive || false,
        totalEarnings: customer.totalEarnings || 0,
        totalChats: customer.totalChats || 0
      };
    });
    
    res.json({ 
      success: true,
      customers
    });
  } catch (error) {
    console.error('Error fetching assigned customers:', error);
    res.status(500).json({ message: 'Failed to fetch assigned customers', error: error.message });
  }
});

// Get any existing chats for a specific customer
router.get('/customer-chats/:customerId/:agentId', agentAuth, async (req, res) => {
  try {
    const { customerId, agentId } = req.params;
    console.log(`Looking for existing chats for customer ${customerId} and agent ${agentId}`);

    // Get all escort profiles owned by the agent
    const escortProfiles = await EscortProfile.find({ agentId });
    const escortIds = escortProfiles.map(profile => profile._id);
    
    if (!escortIds.length) {
      return res.status(404).json({ message: 'No escort profiles found for this agent' });
    }

    // Find any active chats between this customer and any of the agent's escorts
    const existingChat = await Chat.findOne({
      customerId,
      escortId: { $in: escortIds },
      status: { $ne: 'closed' }
    }).populate('escortId', 'firstName name profileImage');

    if (existingChat) {
      console.log('Existing chat found:', existingChat._id);
      return res.json({
        chat: existingChat,
        escortId: existingChat.escortId._id,
        message: 'Existing chat found'
      });
    }

    // No chat exists yet
    return res.json({
      message: 'No existing chat found',
      exists: false
    });
  } catch (error) {
    console.error('Error finding customer chat:', error);
    res.status(500).json({ message: 'Failed to find customer chat', error: error.message });
  }
});

// Create a new chat between a customer and one of the agent's escorts
router.post('/create-chat', agentAuth, async (req, res) => {
  try {
    const { customerId, agentId } = req.body;
    
    if (!customerId || !agentId) {
      return res.status(400).json({ message: 'Customer ID and Agent ID are required' });
    }

    console.log(`Creating chat for customer ${customerId} with agent ${agentId}`);

    // Get the agent's escort profiles
    const escortProfiles = await EscortProfile.find({ agentId });
    
    if (!escortProfiles.length) {
      return res.status(404).json({ message: 'No escort profiles found for this agent' });
    }

    // Use the first available escort profile (in a real system, you might want to use
    // a more sophisticated selection algorithm)
    const escortProfile = escortProfiles[0];

    // Create a new chat
    const newChat = await Chat.create({
      escortId: escortProfile._id,
      customerId: customerId,
      status: 'new',
      messages: [],
      createdAt: new Date()
    });

    // Populate escort details
    const chat = await Chat.findById(newChat._id)
      .populate('escortId', 'firstName name profileImage')
      .lean();

    console.log('New chat created:', chat._id);

    res.status(201).json({
      chat,
      escortId: escortProfile._id,
      message: 'Chat created successfully'
    });
  } catch (error) {
    console.error('Chat creation error:', error);
    res.status(500).json({ message: 'Failed to create chat', error: error.message });
  }
});

module.exports = router;
