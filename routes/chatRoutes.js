const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const EscortProfile = require('../models/EscortProfile');
const Agent = require('../models/Agent');
const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const Earnings = require('../models/Earnings');
const { auth, agentAuth } = require('../auth');
const ActiveUsersService = require('../services/activeUsers');
const emailService = require('../services/emailService');
const cache = require('../services/cache'); // Global cache service
const reminderService = require('../services/reminderService');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/chat');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow images and common document types
  const allowedMimes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and documents are allowed.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Credit cost per message (you can make this configurable)
const COINS_PER_MESSAGE = 5;
const COST_PER_CREDIT = 0.10; // $0.10 per credit

// Add message limit middleware - OPTIMIZED
const checkMessageLimit = async (req, res, next) => {
  if (req.agent) {
    return next(); // Agents can always send messages
  }

  // Ensure user is authenticated before proceeding
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Authentication required to send messages.' });
  }

  try {
    // Use lean query for performance and only select needed fields
    const user = await User.findById(req.user.id).select('coins').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has enough coins
    const COINS_PER_MESSAGE = 1;
    if (user.coins.balance < COINS_PER_MESSAGE) {
      // Get available coin packages (use lean for performance)
      const coinPackages = await SubscriptionPlan.find({
        type: 'coin_package',
        isActive: true
      }).select('name price coins bonusCoins').sort({ price: 1 }).lean();

      return res.status(403).json({ 
        message: 'Insufficient coins. Please purchase a coin package to continue chatting.',
        type: 'INSUFFICIENT_COINS',
        userCoins: user.coins.balance,
        coinsRequired: COINS_PER_MESSAGE,
        availablePackages: coinPackages.map(pkg => ({
          id: pkg._id,
          name: pkg.name,
          price: pkg.price,
          coins: pkg.coins,
          bonusCoins: pkg.bonusCoins,
          totalCoins: pkg.coins + pkg.bonusCoins
        }))
      });
    }

    // Pass user data to route to avoid duplicate queries
    req.userCoins = user.coins;
    next();
  } catch (error) {
    console.error('Error checking message limit:', error);
    res.status(500).json({ message: 'Error checking message limit' });
  }
};

// Function to record earnings when coins are used
const recordEarnings = async (userId, chatId, agentId, coinsUsed, messageType = 'text') => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const agent = await Agent.findById(agentId);
    if (!agent) return;

    // Calculate total amount based on global coin value setting
    const COIN_VALUE = global.commissionSettings?.coinValue || 1.00; // $1 per coin
    const totalAmount = coinsUsed * COIN_VALUE;
    
    // Commission percentages priority:
    // 1) Agent custom settings
    // 2) Global defaults from CommissionSettings
    // 3) Fallback to hard-coded 30/20 and remainder for admin
    const CommissionSettings = require('../models/CommissionSettings');
    let defaults = await CommissionSettings.findOne().sort({ updatedAt: -1 });
    const baseAgentPerc = agent?.commissionSettings?.chatCommissionPercentage ?? defaults?.defaultAgentPercentage ?? 30;
    const baseAffiliatePerc = user.affiliateAgent
      ? (agent?.commissionSettings?.affiliateCommissionPercentage ?? defaults?.defaultAffiliatePercentage ?? 20)
      : 0;
    const remainder = 100 - (baseAgentPerc + baseAffiliatePerc);
    const agentPerc = Math.max(0, Math.min(100, baseAgentPerc));
    const affiliatePerc = Math.max(0, Math.min(100 - agentPerc, baseAffiliatePerc));
    const adminPerc = Math.max(0, remainder);

    // Create earning record
    const earning = new Earnings({
      transactionId: uuidv4(),
      userId,
      chatId,
      agentId,
      affiliateAgentId: user.affiliateAgent,
      totalAmount,
      coinsUsed,
      coinValue: COIN_VALUE,
      agentCommission: (totalAmount * agentPerc) / 100,
      agentCommissionPercentage: agentPerc,
      affiliateCommission: (totalAmount * affiliatePerc) / 100,
      affiliateCommissionPercentage: affiliatePerc,
      adminCommission: (totalAmount * adminPerc) / 100,
      adminCommissionPercentage: adminPerc,
      messageType,
      description: `Message sent in chat (${coinsUsed} coins used)`
    });

    await earning.save();

    // Update agent earnings
    await agent.updateEarnings(earning.agentCommission, 'chat');

    // Update affiliate earnings if applicable
    if (user.affiliateAgent) {
      const affiliateAgent = await Agent.findById(user.affiliateAgent);
      if (affiliateAgent) {
        await affiliateAgent.updateEarnings(earning.affiliateCommission, 'affiliate');
        
        // Update affiliate registration stats
        const AffiliateRegistration = require('../models/AffiliateRegistration');
        const affiliateReg = await AffiliateRegistration.findOne({
          affiliateAgentId: user.affiliateAgent,
          customerId: userId
        });
        if (affiliateReg) {
          await affiliateReg.updateCommission(earning.affiliateCommission, coinsUsed);
        }
      }
    }

    // Update agent-customer relationship stats
    const AgentCustomer = require('../models/AgentCustomer');
    const agentCustomer = await AgentCustomer.findOne({ agentId, customerId: userId });
    if (agentCustomer) {
      await agentCustomer.updateStats(earning.agentCommission, coinsUsed);
    }

    return earning;
  } catch (error) {
    console.error('Error recording earnings:', error);
    throw error;
  }
};

router.use(auth);

// Chat notes (agent-only)
router.get('/:chatId/notes', async (req, res) => {
  try {
    const { chatId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    const chat = await Chat.findById(chatId).select('comments');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    const notes = (chat.comments || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    // Explicit no-cache so browser doesn't reuse empty 304 response
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    // Unified shape expected by frontend
    res.json({ comments: notes, count: notes.length, ts: Date.now() });
  } catch (error) {
    console.error('Get chat notes error:', error);
    res.status(500).json({ message: 'Failed to fetch chat notes' });
  }
});

router.post('/:chatId/notes', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body || {};
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent authentication required' });
    }
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ message: 'Note text is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    // Check if this is a general note based on text prefix or explicit flag
    const isGeneral = text.startsWith('[General]') || req.body.isGeneral === true;

    const note = {
      text,
      timestamp: new Date(),
      agentId: req.agent._id,
      agentName: req.agent.name || 'Agent',
      isGeneral: isGeneral
    };

    // Atomic push without triggering full document validation
    const updated = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { comments: note } },
      { new: true, runValidators: false }
    ).select('comments');

    if (!updated) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const created = updated.comments[updated.comments.length - 1];
    const allNotes = (updated.comments || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return res.status(201).json({ created, allNotes });
  } catch (error) {
    console.error('Add chat note error:', error);
    return res.status(500).json({ message: 'Failed to add chat note' });
  }
});

router.delete('/:chatId/notes/:noteId', async (req, res) => {
  try {
    const { chatId, noteId } = req.params;
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent authentication required' });
    }
    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await Chat.updateOne(
      { _id: chatId },
      { $pull: { comments: { _id: new mongoose.Types.ObjectId(noteId) } } },
      { runValidators: false }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete chat note error:', error);
    return res.status(500).json({ message: 'Failed to delete chat note' });
  }
});

// Message-level note (single note per message)
router.post('/:chatId/messages/:messageIndex/note', async (req, res) => {
  try {
    const { chatId, messageIndex } = req.params;
    const { text } = req.body || {};
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent authentication required' });
    }
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    const idx = parseInt(messageIndex, 10);
    if (Number.isNaN(idx) || idx < 0) {
      return res.status(400).json({ message: 'Invalid message index' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.messages || idx >= chat.messages.length) {
      return res.status(404).json({ message: 'Message not found' });
    }
    chat.messages[idx].note = {
      text,
      timestamp: new Date(),
      agentId: req.agent._id,
      agentName: req.agent.name || 'Agent'
    };
    chat.markModified('messages');
    await chat.save();
    res.status(201).json(chat.messages[idx].note);
  } catch (error) {
    console.error('Add message note error:', error);
    res.status(500).json({ message: 'Failed to add message note' });
  }
});

router.delete('/:chatId/messages/:messageIndex/note', async (req, res) => {
  try {
    const { chatId, messageIndex } = req.params;
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent authentication required' });
    }
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    const idx = parseInt(messageIndex, 10);
    if (Number.isNaN(idx) || idx < 0) {
      return res.status(400).json({ message: 'Invalid message index' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.messages || idx >= chat.messages.length) {
      return res.status(404).json({ message: 'Message not found' });
    }
    chat.messages[idx].note = undefined;
    chat.markModified('messages');
    await chat.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete message note error:', error);
    res.status(500).json({ message: 'Failed to delete message note' });
  }
});

// Watch live queue - DEPRECATED AND DISABLED
router.get('/live-queue/:escortId?/:chatId?', async (req, res) => {
  // This route is deprecated and disabled for performance. Use /api/agents/chats/live-queue instead.
  console.warn('🚨 DEPRECATED ENDPOINT CALLED: /api/chats/live-queue is disabled for performance');
  console.warn('   Frontend should use /api/agents/chats/live-queue instead');
  console.warn(`   Request from: ${req.get('User-Agent') || 'Unknown'}`);
  
  // Return immediate redirect response instead of running slow query
  return res.status(410).json({ 
    message: 'This endpoint is deprecated and disabled for performance reasons',
    redirectTo: '/api/agents/chats/live-queue',
    error: 'ENDPOINT_DEPRECATED',
    documentation: 'Use /api/agents/chats/live-queue for optimized performance'
  });
});

// Make first contact - update this route
router.post('/:chatId/first-contact', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
  const { message, clientId } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Update chat status and add message
    chat.status = 'assigned';
    chat.agentId = req.agent.id;
    chat.messages.push({
      sender: 'agent',
      message: message,
      timestamp: new Date()
    });

    await chat.save();

    // Broadcast WS chat_message so frontends can reconcile optimistic message
    try {
      if (req.app.locals?.wss) {
        // record clientId for idempotency
        if (clientId) {
          const key = `${chat._id}:${clientId}`;
          req.app.locals.sentMessageIds = req.app.locals.sentMessageIds || new Map();
          req.app.locals.sentMessageIds.set(key, Date.now());
        }
        const wsPayload = {
          type: 'chat_message',
          chatId: chat._id,
          sender: 'agent',
          message: message,
          messageType: 'text',
          timestamp: new Date().toISOString(),
          readByAgent: true,
          readByCustomer: false,
          clientId: clientId
        };
        req.app.locals.wss.clients.forEach(client => {
          if (client.readyState === 1) {
            try { client.send(JSON.stringify(wsPayload)); } catch {}
          }
        });
      }
    } catch (e) {
      console.warn('first-contact broadcast failed:', e?.message || e);
    }

    // Update agent stats
    await Agent.findByIdAndUpdate(req.agent.id, {
      $inc: {
        'stats.totalMessagesSent': 1,
        'stats.liveMessageCount': 1,
        'stats.activeCustomers': 1
      }
    });

    // Return formatted response
    res.json({
      id: chat._id,
      message: message,
      sender: 'agent',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('First contact error:', error);
    res.status(500).json({ message: 'Failed to make first contact' });
  }
});

// Push back chat
router.post('/push-back/:chatId', auth, async (req, res) => {
  try {
    const { hours } = req.body;
    
    // Validate input
    if (!hours || isNaN(hours) || hours <= 0) {
      return res.status(400).json({ message: 'Invalid hours value' });
    }
    
    const pushBackUntil = new Date();
    pushBackUntil.setHours(pushBackUntil.getHours() + parseFloat(hours));
    
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
      // Verify that the current user is the agent assigned to this chat
    const agentId = req.agent?.id || req.user?.id;
    if (chat.agentId && chat.agentId.toString() !== agentId) {
      return res.status(403).json({ message: 'Unauthorized: You are not assigned to this chat' });
    }

    // Update chat status
    chat.status = 'pushed';
    chat.pushBackUntil = pushBackUntil;
    await chat.save();

    // Decrement live message count since chat is no longer active
    if (chat.agentId) {
      await Agent.findByIdAndUpdate(chat.agentId, {
        $inc: {
          'stats.liveMessageCount': -chat.messages.filter(m => m.sender === 'agent').length,
          'stats.activeCustomers': -1
        }
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Chat pushed back successfully', 
      chat: {
        _id: chat._id,
        status: chat.status,
        pushBackUntil: chat.pushBackUntil
      }
    });
  } catch (error) {
    console.error('Push back error:', error);
    res.status(500).json({ message: 'Failed to push back chat', error: error.message });
  }
});

// Start new chat
router.post('/start', async (req, res) => {
  try {
    if (!req.body.escortId) {
      return res.status(400).json({ message: 'escortId is required' });
    }

    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if chat already exists with this escort
    const existingChat = await Chat.findOne({
      escortId: req.body.escortId,
      customerId: req.user.id,
      status: { $ne: 'closed' }
    }).populate('escortId', 'firstName profileImage');

    if (existingChat) {
      // Return existing chat
      return res.json({
        id: existingChat._id,
        sender: existingChat.escortId?.firstName || 'Escort',
        profileImage: existingChat.escortId?.profileImage,
        messages: existingChat.messages.map(msg => ({
          text: msg.message,
          time: new Date(msg.timestamp).toLocaleString(),
          isSent: msg.sender === 'customer',
          status: msg.readByAgent ? 'read' : 'sent'
        })),
        isOnline: true,
        lastMessage: existingChat.messages[existingChat.messages.length - 1]?.message || '',
        time: existingChat.updatedAt.toLocaleString()
      });
    }

    // Create new chat if none exists
    const newChat = await Chat.create({
      escortId: req.body.escortId,
      customerId: req.user.id,
      status: 'new',
      messages: [],
      createdAt: new Date()
    });

    // Populate escort details
    const chat = await Chat.findById(newChat._id)
      .populate('escortId', 'firstName profileImage')
      .lean();

    const formattedResponse = {
      id: chat._id,
      sender: chat.escortId?.firstName || 'Escort',
      profileImage: chat.escortId?.profileImage,
      messages: [],
      isOnline: true,
      lastMessage: '',
      time: chat.createdAt.toLocaleString()
    };

    res.status(201).json(formattedResponse);
  } catch (error) {
    console.error('Chat creation error:', error);
    res.status(500).json({ message: 'Failed to create chat', error: error.message });
  }
});

// Get user's chats
router.get('/user', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Check cache first
    const cacheKey = `user:chats:${req.user.id}`;
    let formattedResponse = await cache.get(cacheKey);
    
    if (!formattedResponse) {
      console.log('Cache miss - fetching user chats from database');
      
      // Use lean query with populate for better performance
      const chats = await Chat.find({
        customerId: req.user.id,
        status: { $ne: 'closed' }
      })
      .populate('escortId', 'firstName profileImage')
      .sort({ updatedAt: -1 })
      .lean(); // Convert to plain JavaScript objects
      
      // Group chats by escort (optimized processing)
      const chatsByEscort = chats.reduce((acc, chat) => {
        const escortId = chat.escortId?._id || chat.escortId;
        const escortIdStr = escortId.toString();
        
        if (!acc[escortIdStr]) {
          acc[escortIdStr] = {
            escortId: escortId,
            escortName: chat.escortId?.firstName || 'Escort',
            profileImage: chat.escortId?.profileImage,
            chats: []
          };
        }
        
        // Optimized message processing
        const processedMessages = chat.messages.map(msg => ({
          text: msg.message,
          time: new Date(msg.timestamp).toLocaleString(),
          isSent: msg.sender === 'customer',
          status: msg.readByAgent ? 'read' : 'sent',
          sender: msg.sender,
          messageType: msg.messageType || 'text',
          imageData: msg.imageData,
          mimeType: msg.mimeType,
          filename: msg.filename,
          readByAgent: msg.readByAgent,
          readByCustomer: msg.readByCustomer
        }));
        
        acc[escortIdStr].chats.push({
          id: chat._id,
          messages: processedMessages,
          isOnline: true,
          lastMessage: chat.messages[chat.messages.length - 1]?.message || '',
          time: new Date(chat.updatedAt).toLocaleString()
        });

        return acc;
      }, {});

      formattedResponse = Object.values(chatsByEscort);
      
  // Cache for 30 seconds (shorter for user-specific data)
  await cache.set(cacheKey, formattedResponse, 30 * 1000);
      console.log(`Cached chats for user ${req.user.id}: ${formattedResponse.length} escorts`);
    } else {
      console.log(`Cache hit - returning chats for user ${req.user.id}`);
    }

    res.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching user chats:', error);
    res.status(500).json({ message: 'Failed to fetch chats' });
  }
});

// Get user's chats for a specific escort
router.get('/user/escort/:escortId', async (req, res) => {
  try {
    const { escortId } = req.params;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const chat = await Chat.findOne({
      customerId: req.user.id,
      escortId: escortId,
      status: { $ne: 'closed' }
    })
    .populate('escortId', 'firstName profileImage')
    .sort({ updatedAt: -1 });

    if (!chat) {
      return res.status(404).json({ message: 'No chat found with this escort' });
    }

    const formattedChat = {
      id: chat._id,
      sender: chat.escortId?.firstName || 'Escort',
      profileImage: chat.escortId?.profileImage,
      messages: chat.messages.map(msg => ({
        text: msg.message,
        time: new Date(msg.timestamp).toLocaleString(),
        isSent: msg.sender === 'customer',
        status: msg.readByAgent ? 'read' : 'sent',
        sender: msg.sender,
        messageType: msg.messageType || 'text',
        imageData: msg.imageData,
        mimeType: msg.mimeType,
        filename: msg.filename,
        readByAgent: msg.readByAgent,
        readByCustomer: msg.readByCustomer
      })),
      isOnline: true,
      lastMessage: chat.messages[chat.messages.length - 1]?.message || '',
      time: new Date(chat.updatedAt).toLocaleString()
    };

    res.json(formattedChat);
  } catch (error) {
    console.error('Error fetching escort chat:', error);
    res.status(500).json({ message: 'Failed to fetch chat' });
  }
});

// Send a message in chat - SUPER FAST OPTIMIZED
router.post('/:chatId/message', [auth, checkMessageLimit], async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { chatId } = req.params;
    let { message, messageType = 'text', imageData, mimeType, filename } = req.body;

    // Enforce allowed message types only
  const allowedTypes = new Set(['text', 'image']);
    if (!allowedTypes.has(messageType)) {
      return res.status(400).json({ message: 'Invalid message type' });
    }
    
    // Validate message content - allow empty message for image types
    if (messageType === 'image') {
      // For image messages, message can be empty (we have image data instead)
      if (typeof message !== 'string') {
        message = ''; // Set to empty string if not provided
      }
      // Validate image data is present
      if (!imageData || !mimeType || !filename) {
        return res.status(400).json({ message: 'Image data, mimeType, and filename are required for image messages' });
      }
    } else {
      // For text messages, message content is required
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: 'Message content is required and must be a non-empty string' });
      }
    }
    
    // Find chat and validate with lean query for performance
    const chat = await Chat.findById(chatId).lean();
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    let coinDeduction = false;

    // If user is customer, prepare for coin deduction (already validated in middleware)
    if (!req.agent) {
      const COINS_PER_MESSAGE = 1;
      
      // Double check coin balance (should already be validated by middleware)
      if (req.userCoins.balance < COINS_PER_MESSAGE) {
        return res.status(403).json({ 
          message: 'Insufficient coins. Please purchase a coin package to continue chatting.',
          type: 'INSUFFICIENT_COINS',
          userCoins: req.userCoins.balance,
          coinsRequired: COINS_PER_MESSAGE
        });
      }

      coinDeduction = true;
    }

    // Add message to chat - Use atomic operation
    const newMessage = {
      sender: req.agent ? 'agent' : 'customer',
      message,
      messageType,
      timestamp: new Date(),
      readByAgent: req.agent ? true : false,
      readByCustomer: req.agent ? false : true
    };

    // Add image-specific fields if it's an image message
    if (messageType === 'image') {
      newMessage.imageData = imageData;
      newMessage.mimeType = mimeType;
      newMessage.filename = filename;
    }

    // Prepare update operations
    const chatUpdate = {
      $push: { messages: newMessage },
      $set: {
        updatedAt: new Date()
      }
    };

    // Update chat activity timestamps
    if (req.agent) {
      chatUpdate.$set.lastAgentResponse = new Date();
      // Agent replied: mark any active reminder as handled immediately
      chatUpdate.$set.reminderHandled = true;
      chatUpdate.$set.reminderHandledAt = new Date();
      // Also reset reminderActive and related fields to clean up the reminder state
      chatUpdate.$set.reminderActive = false;
      chatUpdate.$unset = { 
        ...(chatUpdate.$unset || {}),
        reminderSnoozedUntil: 1,
        reminderPriority: 1
      };
    } else {
      chatUpdate.$set.lastCustomerResponse = new Date();
  // Customer replied: resolve any active reminder cycle instantly
  chatUpdate.$set.reminderActive = false;
  chatUpdate.$set.reminderResolvedAt = new Date();
  chatUpdate.$set.reminderCount = 0; // reset cycle count
  // Also reset reminderHandled flag when customer replies - conversation is active again
  chatUpdate.$set.reminderHandled = false;
    }

    // Update chat status if needed
    if (chat.status === 'new') {
      chatUpdate.$set.status = 'assigned';
      // If agent is sending the message, assign them to the chat
      if (req.agent) {
        chatUpdate.$set.agentId = req.agent._id;
      }
    }

    // ⚡ INSTANT RESPONSE: Only save message and respond immediately
    await Chat.findByIdAndUpdate(chatId, chatUpdate, { new: false });

    // ⚡ INSTANT CACHE INVALIDATION - Clear live queue cache immediately
    try {
      const cacheKeys = [
        // live queue update snapshots (scoped + global)
        `live_queue_updates:${req.user?.id || 'all'}`,
        'live_queue_updates:all',
        // live queue listings (scoped and global)
        `live_queue:${chat.escortId || 'all'}`,
        `live_queue:${chat.escortId}:${chat.agentId}`,
        'live_queue:global',
        // other related keys
        `my_escorts:${chat.agentId}`,
        `chat_${chatId}`,
        `user:chats:${chat.customerId}`
      ];
      for (const key of cacheKeys) {
        try {
          cache.delete(key);
        } catch (delErr) {
          console.warn(`Cache delete failed for key ${key}:`, delErr?.message || delErr);
        }
      }
    } catch (e) {
      console.error('Cache invalidation error:', e?.message || e);
    }
    // Also clear the fallback live-queue cache immediately if available
    try {
      const clearFallback = req.app?.locals?.clearLiveQueueFallbackCache;
      if (typeof clearFallback === 'function') {
        clearFallback();
      }
    } catch (e) {
      console.warn('Fallback live-queue cache clear failed:', e?.message || e);
    }

    // 🚀 IMMEDIATE WebSocket notification for instant messaging
    if (req.app.locals.wss) {
      // Record clientId for idempotency map so WS handler can dedupe echoes
      try {
        const cid = req.body?.clientId;
        if (cid) {
          const key = `${chat._id}:${cid}`;
          req.app.locals.sentMessageIds = req.app.locals.sentMessageIds || new Map();
          req.app.locals.sentMessageIds.set(key, Date.now());
        }
      } catch {}
      const chatMessageNotification = {
        type: 'chat_message',
        chatId: chat._id,
        sender: newMessage.sender,
        message: newMessage.message,
        messageType: newMessage.messageType,
        timestamp: newMessage.timestamp,
        readByAgent: newMessage.readByAgent,
        readByCustomer: newMessage.readByCustomer,
        clientId: req.body?.clientId,
        imageData: messageType === 'image' ? imageData : undefined,
        mimeType: messageType === 'image' ? mimeType : undefined,
        filename: messageType === 'image' ? filename : undefined
      };

      // Instant broadcast to all connected clients
      req.app.locals.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify(chatMessageNotification));
          } catch (error) {
            console.error('Error sending instant message notification:', error);
          }
        }
      });
    }

    // ⚡ RESPOND IMMEDIATELY - Don't wait for background operations
    const responseTime = Date.now() - startTime;
    res.json({ 
      success: true, 
      messageId: newMessage._id,
      timestamp: newMessage.timestamp,
      responseTime: `${responseTime}ms`
    });

    // 🔄 ALL HEAVY OPERATIONS MOVED TO BACKGROUND for instant messaging
    setImmediate(async () => {
      try {
        // Handle coin deduction in background
        if (coinDeduction) {
          await User.findByIdAndUpdate(
            req.user.id,
            {
              $inc: { 
                'coins.balance': -1,
                'coins.totalUsed': 1
              },
              $set: {
                'coins.lastUsageDate': new Date()
              },
              $push: {
                'coins.usageHistory': {
                  date: new Date(),
                  amount: 1,
                  chatId: chat._id,
                  messageType
                }
              }
            },
            { new: true, select: 'coins' }
          );
        }

        // Invalidate relevant caches after message is sent (shared cache instance)
        const cacheKeys = [
          // live queue update snapshots (scoped + global)
          `live_queue_updates:${req.user?.id || 'all'}`,
          'live_queue_updates:all',
          // live queue listings (scoped and global)
          `live_queue:${chat.escortId || 'all'}`,
          `live_queue:${chat.escortId}:${chat.agentId}`,
          'live_queue:global',
          // other related
          `my_escorts:${chat.agentId}`,
          `chat_${chatId}`,
          `user:chats:${chat.customerId}`
        ];
        for (const key of cacheKeys) {
          try {
            cache.delete(key);
          } catch (delErr) {
            console.warn(`Background cache delete failed for key ${key}:`, delErr?.message || delErr);
          }
        }

        // Record earnings for agent commission (background operation)
        if (coinDeduction && chat.agentId) {
          await recordEarnings(
            req.user.id,
            chat._id,
            chat.agentId,
            1,
            messageType
          );
        }

        // Handle reminder service updates (background operation) - for logging/cleanup
        try {
          if (req.agent) {
            // Agent sent a message - already handled in main update, just log
            console.log(`Agent responded to chat ${chatId} - reminder marked as handled`);
          } else {
            // Customer sent a message - reset reminder flags (additional cleanup)
            await reminderService.handleCustomerResponse(chatId);
          }
        } catch (reminderError) {
          console.error('Reminder service error:', reminderError);
          // Don't fail the message if reminder service has issues
        }

        // Send live queue update notification (background)
        if (!req.agent && req.app.locals.wss) {
          const unreadCount = (chat.messages || []).filter(msg => 
            msg.sender === 'customer' && !msg.readByAgent
          ).length + 1;

          const liveQueueNotification = {
            type: 'live_queue_update',
            event: 'new_message',
            chatId: chat._id,
            customerId: chat.customerId,
            escortId: chat.escortId,
            customerName: chat.customerName || 'Anonymous',
            message: {
              sender: newMessage.sender,
              message: newMessage.messageType === 'image' ? '📷 Image' : newMessage.message,
              messageType: newMessage.messageType,
              timestamp: newMessage.timestamp
            },
            unreadCount,
            lastActivity: new Date().toISOString(),
            status: chatUpdate.$set.status || chat.status
          };

          // Broadcast live queue updates to agents only
          req.app.locals.wss.clients.forEach(client => {
            if (client.readyState === 1 && client.clientInfo?.role === 'agent') {
              try {
                client.send(JSON.stringify(liveQueueNotification));
              } catch (error) {
                console.error('Error sending live queue notification:', error);
              }
            }
          });
        }

        // Email notification to customer when agent sends a new message
        try {
          if (req.agent) {
            // Throttle notifications per chat to avoid spam (5 minutes lock)
            const lockKey = `email_notify_lock:${chat._id}`;
            const locked = cache.get(lockKey);
            const activeMap = ActiveUsersService.getActiveUsers();
            const uid = chat.customerId?.toString();
            const isUserActive = !!(uid && activeMap && activeMap.has(uid));

            if (!locked) {
              // Fetch user and escort details minimal fields
              const [userDoc, escortDoc] = await Promise.all([
                User.findById(chat.customerId).select('email username preferences lastActiveDate').lean(),
                EscortProfile.findById(chat.escortId).select('firstName').lean()
              ]);

              const emailOk = !!(userDoc?.email);
              const wantsEmails = !!(userDoc?.preferences?.emailUpdates !== false && userDoc?.preferences?.notifications !== false);

              // Granular settings
              const msgSettings = userDoc?.preferences?.notificationSettings?.email?.messages;
              const granularEnabled = (msgSettings?.enabled !== false);
              const offlineMin = Math.max(0, parseInt(msgSettings?.onlyWhenOfflineMinutes ?? 10));
              // If an offline threshold is set, suppress emails while user is considered "online"
              let passesOfflineRule = true;
              if (offlineMin > 0) {
                if (isUserActive) {
                  passesOfflineRule = false;
                } else if (userDoc?.lastActiveDate) {
                  const lastActive = new Date(userDoc.lastActiveDate).getTime();
                  const msSince = Date.now() - lastActive;
                  passesOfflineRule = msSince >= offlineMin * 60 * 1000;
                }
              }

              // Per-escort override: if present for this escort, require enabled=true
              let passesPerEscort = true;
              const overrides = msgSettings?.perEscort || [];
              if (overrides.length) {
                const found = overrides.find(o => o.escortId?.toString() === (chat.escortId?.toString?.() || String(chat.escortId)));
                if (found && found.enabled === false) {
                  passesPerEscort = false;
                }
              }

              if (emailOk && wantsEmails && granularEnabled && passesOfflineRule && passesPerEscort) {
                const fromName = escortDoc?.firstName || 'Escort';
                const snippet = newMessage.messageType === 'image' ? '📷 Image message' : (newMessage.message || '');
                const chatLink = process.env.FRONTEND_URL || 'https://hetasinglar.se';
                try {
                  await emailService.sendMessageNotification(
                    userDoc.email,
                    userDoc.username,
                    fromName,
                    snippet,
                    chatLink
                  );
                  // Set throttle lock for 5 minutes
                  cache.set(lockKey, true, 5 * 60 * 1000);
                } catch (mailErr) {
                  console.warn('Email notification send failed:', mailErr?.message || mailErr);
                }
              }
            }
          }
        } catch (notifyErr) {
          console.warn('Notification block error:', notifyErr?.message || notifyErr);
        }

        console.log(`⚡ Background operations completed for chat ${chat._id}`);
      } catch (bgError) {
        console.error('Background operation error:', bgError);
        // Don't fail the main request if background operations fail
      }
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
});

// Add this new PATCH route before module.exports
router.patch('/:chatId', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const updates = req.body;
    const isAgent = !!req.agent;

    // If not an agent, restrict what fields can be updated
    if (!isAgent) {
      const allowedUpdates = ['customerName', 'isUserActive'];
      Object.keys(updates).forEach(key => {
        if (!allowedUpdates.includes(key)) {
          delete updates[key];
        }
      });
    }

    // Special handling for comments to ensure they are properly added
    let updateOperation = { 
      $set: updates,
      updatedAt: new Date()
    };

    // If adding comments, use $push to add to the array
    if (updates.comments && Array.isArray(updates.comments)) {
      // Extract only the new comment (the last one in the array)
      const newComment = updates.comments[updates.comments.length - 1];
      
      // Make sure timestamp is set if not provided
      if (!newComment.timestamp) {
        newComment.timestamp = new Date();
      }
      
      // Use $push to add the comment to the existing array
      updateOperation = {
        $push: { comments: newComment },
        $set: { updatedAt: new Date() }
      };
      
      // Remove comments from the $set operation
      delete updates.comments;
      if (Object.keys(updates).length > 0) {
        updateOperation.$set = { ...updates };
      }
    }

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      updateOperation,
      { new: true }
    ).populate('customerId', 'username');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      id: chat._id,
      customerName: chat.customerName,
      messages: chat.messages,
      comments: chat.comments,
      updatedAt: chat.updatedAt,
      status: chat.status
    });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({ message: 'Failed to update chat information' });
  }
});

// Get chat history for escort
router.get('/escorts/:escortId/chats', auth, async (req, res) => {
  try {
    const { escortId } = req.params;
    
    const chats = await Chat.find({
      escortId,
      $or: [
        { agentId: req.agent.id },
        { status: 'new' }
      ]
    }).sort({ createdAt: -1 });

    const formattedChats = chats.map(chat => ({
      id: chat._id,
      messages: chat.messages.map(msg => ({
        text: msg.message,
        time: new Date(msg.timestamp).toLocaleString(),
        isAgent: msg.sender === 'agent'
      })),
      createdAt: chat.createdAt
    }));

    res.json(formattedChats);
  } catch (error) {
    console.error('Get escort chats error:', error);
    res.status(500).json({ message: 'Failed to fetch chats' });
  }
});

// Get chat statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const chats = await Chat.find({
      agentId: req.agent.id,
      status: { $ne: 'closed' }
    }).populate('customerId', 'username')
      .populate('escortId', 'firstName');

    // No follow-ups needed with new system
    const followUps = [];

    res.json({
      totalChats: chats.length,
      activeChats: chats.filter(c => c.status === 'assigned').length,
      followUps,
      chatsByDay: {} // Add daily statistics if needed
    });
  } catch (error) {
    console.error('Error getting chat stats:', error);
    res.status(500).json({ message: 'Failed to get chat statistics' });
  }
});

// Get detailed chat statistics with date range filtering
router.get('/detailed-stats', auth, async (req, res) => {
  try {
    const { startDate, endDate, dateRange } = req.query;

    // Get the agent ID - handle both agent and user scenarios
    const agentId = req.agent?._id;
    if (!agentId) {
      console.error('No agent ID found in request');
      return res.status(401).json({ message: 'Authentication required' });
    }

    let dateFilter = {};
    const now = new Date();

    if (dateRange) {
      switch (dateRange) {
        case 'today':
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              $lte: now
            }
          };
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          dateFilter = {
            createdAt: {
              $gte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
              $lte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1)
            }
          };
          break;
        case 'last7days':
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          dateFilter = {
            createdAt: {
              $gte: sevenDaysAgo,
              $lte: now
            }
          };
          break;
        case 'last30days':
          const thirtyDaysAgo = new Date(now);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          dateFilter = {
            createdAt: {
              $gte: thirtyDaysAgo,
              $lte: now
            }
          };
          break;
        case 'thisMonth':
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1),
              $lte: now
            }
          };
          break;
        case 'lastMonth':
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          dateFilter = {
            createdAt: {
              $gte: lastMonth,
              $lte: lastMonthEnd
            }
          };
          break;
        default:
          console.error(`Invalid dateRange value: ${dateRange}`);
          return res.status(400).json({ message: 'Invalid dateRange value' });
      }
    } else if (startDate && endDate) {
      const startDateTime = new Date(startDate);
      const endDateTime = new Date(endDate);
      
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }

      dateFilter = {
        createdAt: {
          $gte: startDateTime,
          $lte: new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000)
        }
      };
    } else {
      // Default to last 7 days if no date range specified
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      dateFilter = {
        createdAt: {
          $gte: sevenDaysAgo,
          $lte: now
        }
      };
    }

    // Get chats for the agent within date range
    const chats = await Chat.find({
      agentId,
      ...dateFilter
    }).populate('customerId', 'username')
      .populate('escortId', 'firstName');

    // Calculate statistics
    let totalMessagesSent = 0;
    let totalMessagesReceived = 0;
    let totalChatTime = 0;
    let completedChats = 0;

    const chatDetails = chats.map(chat => {
      const agentMessages = chat.messages.filter(msg => msg.sender === 'agent');
      const customerMessages = chat.messages.filter(msg => msg.sender === 'customer');

      totalMessagesSent += agentMessages.length;
      totalMessagesReceived += customerMessages.length;

      // Calculate chat duration
      let chatDuration = 0;
      if (chat.messages.length > 1) {
        const firstMessage = new Date(chat.messages[0].timestamp);
        const lastMessage = new Date(chat.messages[chat.messages.length - 1].timestamp);
        chatDuration = Math.max(0, (lastMessage - firstMessage) / (1000 * 60)); // in minutes
        totalChatTime += chatDuration;
      }

      if (chat.status === 'closed') {
        completedChats++;
      }

      return {
        id: chat._id,
        customer: chat.customerId?.username || 'Unknown',
        escort: chat.escortId?.firstName || 'Unknown',
        messagesSent: agentMessages.length,
        messagesReceived: customerMessages.length,
        status: chat.status,
        createdAt: chat.createdAt,
        duration: Math.round(chatDuration), // Add duration to individual chat
        earnings: 0 // Individual earnings would need to be calculated separately
      };
    });

    // Get earnings for the period
    const earnings = await Earnings.find({
      agentId,
      transactionDate: dateFilter.createdAt
    }).populate('userId', 'username')
      .populate({
        path: 'chatId',
        select: '_id escortId',
        populate: {
          path: 'escortId',
          select: 'firstName lastName'
        }
      });

    const totalEarnings = earnings.reduce((sum, earning) => sum + (earning.chatAgentCommission?.amount || 0), 0);
    const totalCoinsUsed = earnings.reduce((sum, earning) => sum + (earning.coinsUsed || 0), 0);
    const averageEarningsPerChat = completedChats > 0 ? totalEarnings / completedChats : 0;
    const averageChatTime = chats.length > 0 ? totalChatTime / chats.length : 0;

    // Create a map of chat earnings
    const chatEarningsMap = {};
    earnings.forEach(earning => {
      const chatId = earning.chatId?._id?.toString() || earning.chatId?.toString();
      if (chatId) {
        if (!chatEarningsMap[chatId]) {
          chatEarningsMap[chatId] = {
            totalEarnings: 0,
            totalCoins: 0,
            transactions: 0
          };
        }
        chatEarningsMap[chatId].totalEarnings += earning.chatAgentCommission?.amount || 0;
        chatEarningsMap[chatId].totalCoins += earning.coinsUsed || 0;
        chatEarningsMap[chatId].transactions += 1;
      }
    });

    // Update chat details with earnings data
    const chatDetailsWithEarnings = chatDetails.map(chat => {
      const chatId = chat.id.toString();
      const earningsData = chatEarningsMap[chatId] || { totalEarnings: 0, totalCoins: 0, transactions: 0 };
      
      return {
        ...chat,
        earnings: parseFloat(earningsData.totalEarnings.toFixed(2)),
        coinsUsed: earningsData.totalCoins,
        transactions: earningsData.transactions
      };
    });

    const response = {
      period: {
        startDate: dateFilter.createdAt.$gte,
        endDate: dateFilter.createdAt.$lte,
        dateRange
      },
      summary: {
        totalChats: chats.length,
        completedChats,
        activeChats: chats.filter(c => c.status === 'assigned').length,
        totalMessagesSent,
        totalMessagesReceived,
        totalMessages: totalMessagesSent + totalMessagesReceived,
        averageChatTime: Math.round(averageChatTime),
        totalChatTime: Math.round(totalChatTime),
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalCoinsUsed: totalCoinsUsed,
        averageEarningsPerChat: parseFloat(averageEarningsPerChat.toFixed(2)),
        totalTransactions: earnings.length
      },
      chatDetails: chatDetailsWithEarnings,
      earnings: earnings.map(earning => ({
        _id: earning._id,
        transactionDate: earning.transactionDate,
        customer: earning.userId?.username || 'Unknown',
        chatId: earning.chatId?._id,
        escortProfile: earning.chatId?.escortId?.firstName || 'Unknown Escort',
        coinsUsed: earning.coinsUsed || 0,
        totalAmount: earning.totalAmount,
        commission: earning.chatAgentCommission?.amount || 0,
        commissionPercentage: earning.chatAgentCommission?.percentage || 0,
        paymentStatus: earning.paymentStatus
      }))
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching chat statistics:', error);
    res.status(500).json({ 
      message: 'Failed to fetch chat statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export chat statistics to CSV
router.get('/export-stats', auth, async (req, res) => {
  try {
    const { startDate, endDate, dateRange } = req.query;
    
    // Get the agent ID - handle both agent and user scenarios
    const agentId = req.agent?.id || req.user?.id;
    if (!agentId) {
      return res.status(401).json({ message: 'Agent authentication required' });
    }
    
    // Use same date filtering logic as detailed-stats
    let dateFilter = {};
    const now = new Date();
    
    if (dateRange) {
      switch (dateRange) {
        case 'today':
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
            }
          };
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          dateFilter = {
            createdAt: {
              $gte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
              $lt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1)
            }
          };
          break;
        case 'last7days':
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            }
          };
          break;
        case 'last30days':
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            }
          };
          break;
        case 'thisMonth':
          dateFilter = {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1),
              $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
            }
          };
          break;
        case 'lastMonth':
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          dateFilter = {
            createdAt: {
              $gte: lastMonth,
              $lt: new Date(now.getFullYear(), now.getMonth(), 1)
            }
          };
          break;
      }
    } else if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lt: new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000)
        }
      };
    }

    const chats = await Chat.find({
      agentId: agentId,
      ...dateFilter
    }).populate('customerId', 'username')
      .populate('escortId', 'firstName');

    // Get earnings data
    const earnings = await require('../models/Earnings').find({
      agentId: agentId,
      createdAt: dateFilter.createdAt || { $exists: true }
    });

    const earningsByChat = {};
    earnings.forEach(earning => {
      if (earning.chatId) {
        earningsByChat[earning.chatId.toString()] = (earningsByChat[earning.chatId.toString()] || 0) + (earning.agentCommission?.amount || 0);
      }
    });

    // Build CSV data
    const csvData = chats.map(chat => {
      const agentMessages = chat.messages.filter(msg => msg.sender === 'agent');
      const customerMessages = chat.messages.filter(msg => msg.sender === 'customer');
      
      let chatDuration = 0;
      if (chat.messages.length > 1) {
        const firstMessage = chat.messages[0];
        const lastMessage = chat.messages[chat.messages.length - 1];
        chatDuration = (new Date(lastMessage.timestamp) - new Date(firstMessage.timestamp)) / (1000 * 60);
      }

      return {
        'Chat ID': chat._id.toString(),
        'Customer': chat.customerId?.username || chat.customerName || 'Unknown',
        'Escort': chat.escortId?.firstName || 'Unknown',
        'Status': chat.status,
        'Messages Sent': agentMessages.length,
        'Messages Received': customerMessages.length,
        'Total Messages': agentMessages.length + customerMessages.length,
        'Duration (minutes)': Math.round(chatDuration),
        'Earnings ($)': earningsByChat[chat._id.toString()] || 0,
        'Created Date': chat.createdAt.toISOString().split('T')[0],
        'Last Activity': chat.updatedAt.toISOString().split('T')[0]
      };
    });

    // Convert to CSV format
    if (csvData.length === 0) {
      return res.status(404).json({ message: 'No data found for the selected period' });
    }

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="chat-statistics-${dateRange || 'custom'}-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting chat stats:', error);
    res.status(500).json({ message: 'Failed to export chat statistics' });
  }
});

// Live queue updates for agent dashboard - OPTIMIZED
router.get('/live-queue-updates', auth, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check cache first for ultra-fast response
    const cacheKey = `live_queue_updates:${req.user?.id || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`🚀 Cache HIT: live-queue-updates (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }

    // Use aggregation pipeline for maximum performance
    const liveQueueData = await Chat.aggregate([
      // Stage 1: Match only relevant chats
      {
        $match: {
          status: { $in: ['new', 'assigned'] },
          $or: [
            { pushBackUntil: { $exists: false } },
            { pushBackUntil: { $lt: new Date() } }
          ]
        }
      },
      
      // Stage 2: Lookup customer data efficiently
      {
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
          pipeline: [
            { 
              $project: { 
                username: 1, 
                email: 1, 
                lastActiveDate: 1, 
                coins: 1, 
                createdAt: 1 
              } 
            }
          ]
        }
      },
      
      // Stage 3: Lookup escort data efficiently
      {
        $lookup: {
          from: 'escortprofiles',
          localField: 'escortId',
          foreignField: '_id',
          as: 'escort',
          pipeline: [
            { 
              $project: { 
                firstName: 1, 
                profileImage: 1, 
                country: 1 
              } 
            }
          ]
        }
      },
      
      // Stage 4: Calculate metrics in a single stage
      {
        $addFields: {
          customer: { $arrayElemAt: ['$customer', 0] },
          escort: { $arrayElemAt: ['$escort', 0] },
          unreadCount: {
            $size: {
              $filter: {
                input: '$messages',
                cond: {
                  $and: [
                    { $eq: ['$$this.sender', 'customer'] },
                    { $eq: ['$$this.readByAgent', false] }
                  ]
                }
              }
            }
          },
          hasUnreadAgentMessages: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: '$messages',
                    cond: {
                      $and: [
                        { $eq: ['$$this.sender', 'agent'] },
                        { $eq: ['$$this.readByCustomer', false] }
                      ]
                    }
                  }
                }
              },
              0
            ]
          },
          lastMessage: { $arrayElemAt: ['$messages', -1] }
        }
      },
      
      // Stage 5: Project final structure
      {
        $project: {
          chatId: '$_id',
          customerId: '$customer._id',
          customerName: { $ifNull: ['$customer.username', '$customerName'] },
          escortId: '$escort._id',
          escortName: { $ifNull: ['$escort.firstName', '$escortName'] },
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          lastActive: { $ifNull: ['$customer.lastActiveDate', '$updatedAt'] },
          unreadCount: 1,
          isUserActive: { $literal: false }, // Will be set by presence service
          isInPanicRoom: { $ifNull: ['$isInPanicRoom', false] },
          panicRoomReason: 1,
          panicRoomMovedAt: 1,
          lastMessage: {
            $cond: [
              { $ne: ['$lastMessage', null] },
              {
                message: {
                  $cond: [
                    { $eq: ['$lastMessage.messageType', 'image'] },
                    '📷 Image',
                    '$lastMessage.message'
                  ]
                },
                messageType: '$lastMessage.messageType',
                sender: '$lastMessage.sender',
                timestamp: '$lastMessage.timestamp',
                readByAgent: '$lastMessage.readByAgent',
                readByCustomer: '$lastMessage.readByCustomer'
              },
              null
            ]
          },
          hasUnreadAgentMessages: 1,
          presence: {
            isOnline: { $literal: false }, // Will be updated by presence service
            lastSeen: { $ifNull: ['$customer.lastActiveDate', '$updatedAt'] },
            status: { $literal: 'offline' }
          }
        }
      },
      
      // Stage 6: Sort efficiently
      {
        $sort: {
          unreadCount: -1,
          updatedAt: -1
        }
      },
      
      // Stage 7: Limit results for performance
      {
        $limit: 50
      }
    ]);

    // Get active users in batch for presence data
  const activeUsersMap = ActiveUsersService.getActiveUsers();
  const activeUserIds = new Set(activeUsersMap ? Array.from(activeUsersMap.keys()) : []);

    // Update presence data efficiently
    liveQueueData.forEach(chat => {
      const uid = chat.customerId?.toString();
      const isActive = uid && activeUserIds.has(uid);
      const lastSeen = isActive ? new Date() : (activeUsersMap?.get(uid) || chat.presence.lastSeen || chat.updatedAt);
      chat.isUserActive = !!isActive;
      chat.presence.isOnline = !!isActive;
      chat.presence.status = isActive ? 'online' : 'offline';
      chat.presence.lastSeen = lastSeen;
      // Keep lastActive fresh if online
      if (isActive) {
        chat.lastActive = new Date();
      }
    });

    // Build response with metadata
    const response = {
      liveQueue: liveQueueData,
      metadata: {
        totalChats: liveQueueData.length,
  activeUsers: activeUserIds.size,
        panicRoomCount: liveQueueData.filter(chat => chat.isInPanicRoom).length,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime
      }
    };

    // Cache the result for 30 seconds (live data)
    cache.set(cacheKey, response, 30 * 1000);
    
    console.log(`⚡ Live queue updates generated in ${Date.now() - startTime}ms`);
    res.json(response);

  } catch (error) {
    console.error('Error fetching live queue updates:', error);
    console.log(`❌ Live queue updates failed in ${Date.now() - startTime}ms`);
    res.status(500).json({ 
      message: 'Failed to fetch live queue updates',
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

// Get single chat - OPTIMIZED with caching and performance improvements
router.get('/:chatId', auth, async (req, res) => {
  const startTime = Date.now();
  const { chatId } = req.params;
  
  try {
    // Check cache first
    const cacheKey = `chat_${chatId}`;
    const cachedChat = cache.get(cacheKey);
    
    if (cachedChat) {
      console.log(`🚀 Cache HIT: single chat ${chatId} (${Date.now() - startTime}ms)`);
      return res.json(cachedChat);
    }

    console.log(`❌ Cache MISS: single chat ${chatId} - generating fresh data`);

    // Optimized database query with lean() for better performance
    const chat = await Chat.findById(chatId)
      .populate('customerId', 'username email dateOfBirth sex createdAt coins')
      .populate('escortId', 'firstName gender profileImage country region relationshipStatus interests profession height dateOfBirth')
      .lean(); // Use lean for better performance

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Optimized unread count - only process recent messages if there are many
    let unreadCount = 0;
    if (chat.messages && chat.messages.length > 0) {
      // For performance: if more than 100 messages, only check the last 50 for unread
      const messagesToCheck = chat.messages.length > 100 
        ? chat.messages.slice(-50) 
        : chat.messages;
      
      unreadCount = messagesToCheck.filter(msg => 
        msg.sender === 'customer' && !msg.readByAgent
      ).length;
    }

    // Get active user status
    const activeMap = ActiveUsersService.getActiveUsers();
    const uid = chat.customerId?._id?.toString();
    const isUserActive = !!(uid && activeMap.has(uid));
    const lastSeen = isUserActive ? new Date() : (uid ? activeMap.get(uid) : chat.updatedAt);

    // Limit messages for better performance - only return last 50 messages
    const limitedMessages = chat.messages && chat.messages.length > 50 
      ? chat.messages.slice(-50) 
      : chat.messages;

    const formattedChat = {
      _id: chat._id,
      customerId: chat.customerId,
      customerName: chat.customerId?.username || chat.customerName,
      escortId: chat.escortId,
      status: chat.status,
      messages: limitedMessages, // Limited messages for performance
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      unreadCount,
      lastActive: isUserActive ? new Date() : chat.updatedAt,
      isUserActive,
      presence: {
        isOnline: isUserActive,
        lastSeen: lastSeen,
        status: isUserActive ? 'online' : 'offline'
      },
      // Metadata for debugging
      totalMessages: chat.messages?.length || 0,
      messagesShown: limitedMessages?.length || 0
    };

    // Cache the result for 2 minutes (frequently accessed chats)
    const cacheTTL = 120000; // 2 minutes
    cache.set(cacheKey, formattedChat, cacheTTL);
    
    const duration = Date.now() - startTime;
    console.log(`⚡ Single chat ${chatId} loaded in ${duration}ms (${chat.messages?.length || 0} total messages, ${limitedMessages?.length || 0} returned)`);
    
    res.json(formattedChat);
  } catch (error) {
    console.error('Error fetching single chat:', error);
    res.status(500).json({ message: 'Failed to fetch chat' });
  }
});

// Get full message history for a chat - separate endpoint to avoid slowing down main chat load
router.get('/:chatId/messages/full', auth, async (req, res) => {
  const startTime = Date.now();
  const { chatId } = req.params;
  
  try {
    const { page = 1, limit = 100 } = req.query;
    
    // Check cache first
    const cacheKey = `chat_full_messages_${chatId}_${page}_${limit}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`🚀 Cache HIT: full messages ${chatId} page ${page} (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }

    // Get chat with all messages but use lean() for performance
    const chat = await Chat.findById(chatId, 'messages createdAt updatedAt').lean();
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Implement pagination
    const totalMessages = chat.messages?.length || 0;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    
    // Get messages in reverse order (newest first) then reverse to get chronological
    const allMessages = [...(chat.messages || [])].reverse();
    const paginatedMessages = allMessages.slice(startIndex, endIndex).reverse();
    
    const response = {
      chatId: chat._id,
      messages: paginatedMessages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalMessages,
        totalPages: Math.ceil(totalMessages / limit),
        hasNext: endIndex < totalMessages,
        hasPrev: page > 1
      }
    };

    // Cache for 5 minutes (message history doesn't change as often)
    cache.set(cacheKey, response, 300000);
    
    const duration = Date.now() - startTime;
    console.log(`⚡ Full message history ${chatId} loaded in ${duration}ms (page ${page}, ${paginatedMessages.length}/${totalMessages} messages)`);
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching full message history:', error);
    res.status(500).json({ message: 'Failed to fetch message history' });
  }
});

// Mark messages as read
router.post('/:chatId/mark-read', auth, async (req, res) => {
  try {
    const { chatId } = req.params;

    // Use atomic update to avoid full document validation on save (legacy enum values in messages can fail validation)
    const result = await Chat.updateOne(
      { _id: chatId },
      { $set: { 'messages.$[m].readByAgent': true } },
      {
        arrayFilters: [{ 'm.sender': 'customer', 'm.readByAgent': { $ne: true } }],
        runValidators: false
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    return res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Mark messages read error:', error);
    return res.status(500).json({ message: 'Failed to mark messages as read' });
  }
});

// File upload endpoint for chat messages
router.post('/:chatId/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { chatId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Find the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if user has access to this chat
    const isAgent = !!req.agent;
    const userId = req.user?.id;
    const agentId = req.agent?.id;

    if (!isAgent && chat.customer.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (isAgent && chat.assignedAgent && chat.assignedAgent.toString() !== agentId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create message object with file
    const messageId = new mongoose.Types.ObjectId();
    const senderType = isAgent ? 'agent' : 'user';
    const senderId = isAgent ? agentId : userId;

    const message = {
      _id: messageId,
      senderId,
      senderType,
      type: 'file',
      content: file.originalname,
      fileUrl: `/uploads/chat/${file.filename}`,
      fileName: file.originalname,
      fileSize: file.size,
      fileMimeType: file.mimetype,
      timestamp: new Date(),
      isRead: false
    };

    // Add message to chat
    chat.messages.push(message);
    chat.lastMessageTime = new Date();
    await chat.save();

    // Update active users if user is online
    const userName = isAgent ? `Agent-${agentId}` : userId;
    ActiveUsersService.updateUserActivity(userName);

    res.json({
      message: 'File uploaded successfully',
      messageId: messageId,
      fileUrl: message.fileUrl,
      fileName: message.fileName
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    
    // Clean up file if there was an error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      message: 'Failed to upload file',
      error: error.message 
    });
  }
});

// Voice message upload endpoint  
router.post('/:chatId/voice', auth, upload.single('voice'), async (req, res) => {
  // Voice messages are disabled
  try {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  } catch {}
  return res.status(403).json({ message: 'Voice messages are disabled.' });
});

// Edit message endpoint - for both agents and users
router.put('/:chatId/message/:messageId', auth, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { message } = req.body;
    
    // Validate message content
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required and must be a non-empty string' });
    }
    
    // Find chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // Find the message
    const messageIndex = chat.messages.findIndex(msg => msg._id.toString() === messageId);
    if (messageIndex === -1) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    const messageToEdit = chat.messages[messageIndex];
    
    // Check if user can edit this message and handle coin deduction for users
    if (req.agent) {
      // Agents can only edit their own messages
      if (messageToEdit.sender !== 'agent') {
        return res.status(403).json({ message: 'You can only edit your own messages' });
      }
    } else if (req.user) {
      // Users can only edit their own messages
      if (messageToEdit.sender !== 'customer') {
        return res.status(403).json({ message: 'You can only edit your own messages' });
      }
      
      // For users, check if they have enough coins for editing (same cost as sending a new message)
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const COINS_PER_MESSAGE = 1;
      if (user.coins.balance < COINS_PER_MESSAGE) {
        // Get available coin packages
        const coinPackages = await SubscriptionPlan.find({
          type: 'coin_package',
          isActive: true
        }).sort({ price: 1 });

        return res.status(403).json({ 
          message: 'Insufficient coins. Editing a message costs 1 coin. Please purchase a coin package to continue.',
          type: 'INSUFFICIENT_COINS',
          userCoins: user.coins.balance,
          coinsRequired: COINS_PER_MESSAGE,
          availablePackages: coinPackages.map(pkg => ({
            id: pkg._id,
            name: pkg.name,
            price: pkg.price,
            coins: pkg.coins,
            bonusCoins: pkg.bonusCoins,
            totalCoins: pkg.coins + pkg.bonusCoins
          }))
        });
      }

      // Deduct coins for editing
      user.coins.balance -= COINS_PER_MESSAGE;
      user.coins.totalUsed += COINS_PER_MESSAGE;
      user.coins.lastUsageDate = new Date();
      user.coins.usageHistory.push({
        date: new Date(),
        amount: COINS_PER_MESSAGE,
        chatId: chat._id,
        messageType: 'edit'
      });

      await user.save();

      // Record earnings for agent commission
      if (chat.agentId) {
        await recordEarnings(
          user._id,
          chat._id,
          chat.agentId,
          COINS_PER_MESSAGE,
          'edit'
        );
      }
    } else {
      return res.status(403).json({ message: 'Authentication required' });
    }
    
    // Store original message if this is the first edit
    if (!messageToEdit.isEdited) {
      messageToEdit.originalMessage = messageToEdit.message;
    }
    
    // Update message
    messageToEdit.message = message.trim();
    messageToEdit.isEdited = true;
    messageToEdit.editedAt = new Date();
    
    await chat.save();
    
    res.json({
      success: true,
      message: 'Message updated successfully',
      updatedMessage: {
        id: messageToEdit._id,
        message: messageToEdit.message,
        isEdited: messageToEdit.isEdited,
        editedAt: messageToEdit.editedAt,
        sender: messageToEdit.sender
      }
    });
    
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ 
      message: 'Failed to edit message',
      error: error.message 
    });
  }
});

// Delete message endpoint - handles both ID and index
router.delete('/:chatId/message/:messageIdOrIndex', auth, async (req, res) => {
  try {
    const { chatId, messageIdOrIndex } = req.params;
    
    // Find chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    let messageToDelete;
    let messageIndex;
    
    // Check if it's a numeric index or MongoDB ObjectId
    if (/^\d+$/.test(messageIdOrIndex)) {
      // It's a numeric index
      messageIndex = parseInt(messageIdOrIndex);
      if (messageIndex < 0 || messageIndex >= chat.messages.length) {
        return res.status(404).json({ message: 'Message not found at specified index' });
      }
      messageToDelete = chat.messages[messageIndex];
    } else {
      // It's a MongoDB ObjectId
      messageIndex = chat.messages.findIndex(msg => msg._id.toString() === messageIdOrIndex);
      if (messageIndex === -1) {
        return res.status(404).json({ message: 'Message not found' });
      }
      messageToDelete = chat.messages[messageIndex];
    }
    
    // Check if user can delete this message
    if (req.agent) {
      // Agents can only delete their own messages
      if (messageToDelete.sender !== 'agent') {
        return res.status(403).json({ message: 'You can only delete your own messages' });
      }
    } else if (req.user) {
      // Users can only delete their own messages
      if (messageToDelete.sender !== 'customer') {
        return res.status(403).json({ message: 'You can only delete your own messages' });
      }
    } else {
      return res.status(403).json({ message: 'Authentication required' });
    }
    
    // Mark as deleted instead of removing completely
    messageToDelete.isDeleted = true;
    messageToDelete.deletedAt = new Date();
    messageToDelete.message = '[This message has been deleted]';
    
    // Clean up any legacy voice messageTypes before saving to prevent validation errors
    chat.messages.forEach(msg => {
      if (msg.messageType === 'voice') {
        msg.messageType = 'text';
      }
    });
    
    // Important: Do NOT refund coins to users when they delete messages
    // Users paid for the message sending service, deletion doesn't reverse that
    
    await chat.save();
    
    // Send WebSocket notification for real-time updates
    if (req.app.locals.wss) {
      const notification = {
        type: 'message_deleted',
        chatId: chat._id,
        messageIndex: messageIndex,
        messageId: messageToDelete._id,
        sender: messageToDelete.sender,
        timestamp: new Date().toISOString()
      };

      req.app.locals.wss.clients.forEach(client => {
        if (client.readyState === 1 && client.clientInfo?.role === 'agent') {
          try {
            client.send(JSON.stringify(notification));
          } catch (error) {
            console.error('Error sending message deletion notification:', error);
          }
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Message deleted successfully',
      deletedMessageId: messageToDelete._id,
      deletedMessageIndex: messageIndex,
      sender: messageToDelete.sender
    });
    
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ 
      message: 'Failed to delete message',
      error: error.message 
    });
  }
});

// Additional routes for chat management...

module.exports = router;
