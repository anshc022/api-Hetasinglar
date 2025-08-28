const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const EscortProfile = require('../models/EscortProfile');
const Agent = require('../models/Agent');
const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const Earnings = require('../models/Earnings');
const { auth } = require('../auth');
const ActiveUsersService = require('../services/activeUsers');
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

// Add message limit middleware
const checkMessageLimit = async (req, res, next) => {
  if (req.agent) {
    return next(); // Agents can always send messages
  }

  // Ensure user is authenticated before proceeding
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Authentication required to send messages.' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has enough coins
    const COINS_PER_MESSAGE = 1;
    if (!user || user.coins.balance < COINS_PER_MESSAGE) {
      // Get available coin packages
      const coinPackages = await SubscriptionPlan.find({
        type: 'coin_package',
        isActive: true
      }).sort({ price: 1 }); // Sort by price ascending

      return res.status(403).json({ 
        message: 'Insufficient coins. Please purchase a coin package to continue chatting.',
        type: 'INSUFFICIENT_COINS',
        userCoins: user ? user.coins.balance : 0,
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

    req.userForCoins = user;
    next();
  } catch (error) {
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
    
    // Simple fixed commission percentages
    // Agent: 30%, Affiliate: 20% (if exists), Admin: 50% (or 70% if no affiliate)
    const agentPerc = 30;
    const affiliatePerc = user.affiliateAgent ? 20 : 0;
    const adminPerc = user.affiliateAgent ? 50 : 70;

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
          await affiliateReg.updateCommission(earning.affiliateCommission.amount, coinsUsed);
        }
      }
    }

    // Update agent-customer relationship stats
    const AgentCustomer = require('../models/AgentCustomer');
    const agentCustomer = await AgentCustomer.findOne({ agentId, customerId: userId });
    if (agentCustomer) {
      await agentCustomer.updateStats(earning.chatAgentCommission.amount, coinsUsed);
    }

    return earning;
  } catch (error) {
    console.error('Error recording earnings:', error);
    throw error;
  }
};

router.use(auth);

// Watch live queue
router.get('/live-queue/:escortId?/:chatId?', async (req, res) => {
  try {
    const { escortId, chatId } = req.params;
    
    // Base query for regular live queue
    let query = {
      status: { $in: ['new', 'assigned'] },
      $or: [
        { pushBackUntil: { $exists: false } },
        { pushBackUntil: { $lt: new Date() } }
      ]
    };
    
    // If escortId is provided, filter by it
    if (escortId) {
      try {
        query.escortId = new mongoose.Types.ObjectId(escortId);
      } catch (error) {
        return res.status(400).json({ message: 'Invalid escort ID format' });
      }
    }

    // If chatId is provided, modify query to include it regardless of other criteria
    if (chatId) {
      try {
        const chatObjectId = new mongoose.Types.ObjectId(chatId);
        // Create a compound query: either matches live queue criteria OR is the specific chat
        query = {
          $or: [
            // Original live queue query
            {
              status: { $in: ['new', 'assigned'] },
              $or: [
                { pushBackUntil: { $exists: false } },
                { pushBackUntil: { $lt: new Date() } }
              ],
              ...(escortId && { escortId: new mongoose.Types.ObjectId(escortId) })
            },
            // Specific chat query (include chat regardless of status/pushback)
            {
              _id: chatObjectId,
              ...(escortId && { escortId: new mongoose.Types.ObjectId(escortId) })
            }
          ]
        };
      } catch (error) {
        return res.status(400).json({ message: 'Invalid chat ID format' });
      }
    }

    const chats = await Chat.find(query)
      .populate('customerId', 'username email dateOfBirth sex createdAt coins')
      .populate('escortId', 'firstName gender profileImage country region relationshipStatus interests profession height dateOfBirth')
      .sort({ createdAt: -1 });

    const formattedChats = chats.map(chat => {
      const unreadCount = chat.messages.filter(msg => 
        msg.sender === 'customer' && !msg.readByAgent
      ).length;

      const isUserActive = ActiveUsersService.isUserActive(chat.customerId?._id.toString());
      
      // Get last message read status
      const lastMessage = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
      const hasUnreadAgentMessages = chat.messages.filter(msg => 
        msg.sender === 'agent' && !msg.readByCustomer
      ).length > 0;

      return {
        _id: chat._id,
        customerId: chat.customerId,
        customerName: chat.customerId?.username || chat.customerName,
        escortId: chat.escortId,
        escortName: chat.escortId?.firstName || chat.escortName,
        status: chat.status,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        lastActive: chat.updatedAt,
        unreadCount,
        isUserActive,
        isInPanicRoom: chat.isInPanicRoom || false,
        panicRoomReason: chat.panicRoomReason,
        panicRoomMovedAt: chat.panicRoomMovedAt,
        requiresFollowUp: chat.requiresFollowUp || false,
        followUpDue: chat.followUpDue,
        lastMessage: lastMessage ? {
          message: lastMessage.message,
          messageType: lastMessage.messageType,
          sender: lastMessage.sender,
          timestamp: lastMessage.timestamp,
          readByAgent: lastMessage.readByAgent,
          readByCustomer: lastMessage.readByCustomer
        } : null,
        hasUnreadAgentMessages
      };
    });

    res.json(formattedChats);
  } catch (error) {
    console.error('Error fetching live queue:', error);
    res.status(500).json({ 
      message: 'Failed to fetch live queue',
      error: error.message 
    });
  }
});

// Make first contact - update this route
router.post('/:chatId/first-contact', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;

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

    const chats = await Chat.find({
      customerId: req.user.id,
      status: { $ne: 'closed' }
    })
    .populate('escortId', 'firstName profileImage')
    .sort({ updatedAt: -1 });

    // Group chats by escort
    const chatsByEscort = chats.reduce((acc, chat) => {
      if (!acc[chat.escortId._id]) {
        acc[chat.escortId._id] = {
          escortId: chat.escortId._id,
          escortName: chat.escortId?.firstName || 'Escort',
          profileImage: chat.escortId?.profileImage,
          chats: []
        };
      }
      
      acc[chat.escortId._id].chats.push({
        id: chat._id,
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
      });

      return acc;
    }, {});

    const formattedResponse = Object.values(chatsByEscort);
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

// Send a message in chat
router.post('/:chatId/message', [auth, checkMessageLimit], async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message, messageType = 'text', imageData, mimeType, filename } = req.body;
    
    // Validate message content
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required and must be a non-empty string' });
    }
    
    // Find chat and validate
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    let user; // Declare user here to be accessible in the whole try block

    // If user is customer, deduct coins
    if (!req.agent) {
      const COINS_PER_MESSAGE = 1;
      user = await User.findById(req.user.id);
      
      // Add a check to ensure user was found
      if (!user) {
        return res.status(404).json({ message: 'User sending message not found' });
      }
      
      // Double check coin balance
      if (user.coins.balance < COINS_PER_MESSAGE) {
        // Get available coin packages for user to purchase
        const coinPackages = await SubscriptionPlan.find({
          type: 'coin_package',
          isActive: true
        }).sort({ price: 1 });

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

      // Deduct coins and record usage
      user.coins.balance -= COINS_PER_MESSAGE;
      user.coins.totalUsed += COINS_PER_MESSAGE;
      user.coins.lastUsageDate = new Date();
      user.coins.usageHistory.push({
        date: new Date(),
        amount: COINS_PER_MESSAGE,
        chatId: chat._id,
        messageType
      });

      await user.save();

      // Record earnings for agent commission
      if (chat.agentId) {
        await recordEarnings(
          user._id,
          chat._id,
          chat.agentId,
          COINS_PER_MESSAGE,
          messageType
        );
      }
    }

    // Add message to chat
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

    chat.messages.push(newMessage);

    // Update chat activity timestamps
    if (req.agent) {
      chat.lastAgentResponse = new Date();
    } else {
      chat.lastCustomerResponse = new Date();
    }

    // Update chat status if needed
    if (chat.status === 'new') {
      chat.status = 'assigned';
      // If agent is sending the message, assign them to the chat
      if (req.agent) {
        chat.agentId = req.agent._id;
      }
    }

    await chat.save();

    // 🚀 LIVE QUEUE FIX: Notify agents via WebSocket when user sends message
    if (!req.agent && req.app.locals.wss) {
      const unreadCount = chat.messages.filter(msg => 
        msg.sender === 'customer' && !msg.readByAgent
      ).length;

      const notification = {
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
        status: chat.status
      };

      // Broadcast to all connected agents
      req.app.locals.wss.clients.forEach(client => {
        if (client.readyState === 1 && // WebSocket.OPEN
            client.clientInfo?.role === 'agent') {
          try {
            client.send(JSON.stringify(notification));
          } catch (error) {
            console.error('Error sending live queue notification:', error);
          }
        }
      });
    }

    await chat.save();

    // Return formatted response with coin info if user is customer
    const response = {
      id: chat._id,
      message,
      messageType,
      sender: req.agent ? 'agent' : 'customer',
      timestamp: new Date().toISOString()
    };

    // Include image data in response if it's an image message
    if (messageType === 'image') {
      response.imageData = imageData;
      response.mimeType = mimeType;
      response.filename = filename;
    }

    if (!req.agent && user) {
      response.coinInfo = {
        used: 1,
        remaining: user.coins.balance
      };
    }

    res.json(response);

  } catch (error) {
    console.error('Send message error:', error);
    console.error('Error stack:', error.stack);
    console.error('Chat ID:', req.params.chatId);
    console.error('User info:', { 
      isAgent: !!req.agent, 
      agentId: req.agent?._id, 
      userId: req.user?._id 
    });
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

// Get chat statistics and reminders
router.get('/stats', auth, async (req, res) => {
  try {
    const chats = await Chat.find({
      agentId: req.agent.id,
      status: { $ne: 'closed' }
    }).populate('customerId', 'username')
      .populate('escortId', 'firstName');

    // Get all chats requiring follow-up
    const followUps = chats.filter(chat => 
      chat.requiresFollowUp && 
      chat.followUpDue && 
      new Date(chat.followUpDue) <= new Date()
    ).map(chat => ({
      _id: chat._id,
      customerName: chat.customerId?.username || chat.customerName,
      escortName: chat.escortId?.firstName,
      lastMessage: chat.messages[chat.messages.length - 1]?.message,
      followUpDue: chat.followUpDue
    }));

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

// Live queue updates for agent dashboard
router.get('/live-queue-updates', auth, async (req, res) => {
  try {
    // Get all chats that should appear in live queue
    const query = {
      status: { $in: ['new', 'assigned'] },
      $or: [
        { pushBackUntil: { $exists: false } },
        { pushBackUntil: { $lt: new Date() } }
      ]
    };

    const chats = await Chat.find(query)
      .populate('customerId', 'username email dateOfBirth sex createdAt coins lastActiveDate')
      .populate('escortId', 'firstName gender profileImage country region relationshipStatus interests profession height dateOfBirth')
      .sort({ createdAt: -1 });

    const liveQueueData = chats.map(chat => {
      const unreadCount = chat.messages.filter(msg => 
        msg.sender === 'customer' && !msg.readByAgent
      ).length;

      const isUserActive = ActiveUsersService.isUserActive(chat.customerId?._id.toString());
      
      // Get last message read status
      const lastMessage = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
      const hasUnreadAgentMessages = chat.messages.filter(msg => 
        msg.sender === 'agent' && !msg.readByCustomer
      ).length > 0;

      // Calculate follow-up requirements
      const requiresFollowUp = chat.requiresFollowUp && chat.followUpDue && new Date(chat.followUpDue) <= new Date();

      return {
        chatId: chat._id,
        customerId: chat.customerId?._id,
        customerName: chat.customerId?.username || chat.customerName,
        escortId: chat.escortId?._id,
        escortName: chat.escortId?.firstName || chat.escortName,
        status: chat.status,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        lastActive: chat.customerId?.lastActiveDate || chat.updatedAt,
        unreadCount,
        isUserActive,
        isInPanicRoom: chat.isInPanicRoom || false,
        panicRoomReason: chat.panicRoomReason,
        panicRoomMovedAt: chat.panicRoomMovedAt,
        requiresFollowUp,
        followUpDue: chat.followUpDue,
        lastMessage: lastMessage ? {
          message: lastMessage.messageType === 'image' ? '📷 Image' : lastMessage.message,
          messageType: lastMessage.messageType,
          sender: lastMessage.sender,
          timestamp: lastMessage.timestamp,
          readByAgent: lastMessage.readByAgent,
          readByCustomer: lastMessage.readByCustomer
        } : null,
        hasUnreadAgentMessages,
        // Presence data
        presence: {
          isOnline: isUserActive,
          lastSeen: chat.customerId?.lastActiveDate || chat.updatedAt,
          status: isUserActive ? 'online' : 'offline'
        }
      };
    });

    // Also get active users count for stats
    const activeUsersCount = ActiveUsersService.getActiveUsers().size;

    res.json({
      liveQueue: liveQueueData,
      metadata: {
        totalChats: liveQueueData.length,
        activeUsers: activeUsersCount,
        panicRoomCount: liveQueueData.filter(chat => chat.isInPanicRoom).length,
        followUpCount: liveQueueData.filter(chat => chat.requiresFollowUp).length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching live queue updates:', error);
    res.status(500).json({ 
      message: 'Failed to fetch live queue updates',
      error: error.message 
    });
  }
});

// Get single chat
router.get('/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('customerId', 'username email dateOfBirth sex createdAt coins')
      .populate('escortId', 'firstName gender profileImage country region relationshipStatus interests profession height dateOfBirth');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Format response consistent with live queue
    const unreadCount = chat.messages.filter(msg => 
      msg.sender === 'customer' && !msg.readByAgent
    ).length;

    const isUserActive = ActiveUsersService.isUserActive(chat.customerId?._id.toString());

    const formattedChat = {
      _id: chat._id,
      customerId: chat.customerId,
      customerName: chat.customerId?.username || chat.customerName,
      escortId: chat.escortId,
      status: chat.status,
      messages: chat.messages,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      unreadCount,
      lastActive: chat.updatedAt,
      isUserActive
    };

    res.json(formattedChat);
  } catch (error) {
    console.error('Error fetching single chat:', error);
    res.status(500).json({ message: 'Failed to fetch chat' });
  }
});

// Mark messages as read
router.post('/:chatId/mark-read', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Mark all customer messages as read
    chat.messages = chat.messages.map(msg => {
      if (msg.sender === 'customer') {
        msg.readByAgent = true;
      }
      return msg;
    });

    await chat.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Mark messages read error:', error);
    res.status(500).json({ message: 'Failed to mark messages as read' });
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
  try {
    const { chatId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ message: 'No voice file uploaded' });
    }

    // Validate it's an audio file
    if (!file.mimetype.startsWith('audio/')) {
      // Clean up invalid file
      fs.unlinkSync(file.path);
      return res.status(400).json({ message: 'Invalid file type. Only audio files are allowed.' });
    }

    // Find the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      // Clean up file
      fs.unlinkSync(file.path);
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check access permissions
    const isAgent = !!req.agent;
    const userId = req.user?.id;
    const agentId = req.agent?.id;

    if (!isAgent && chat.customer.toString() !== userId) {
      fs.unlinkSync(file.path);
      return res.status(403).json({ message: 'Access denied' });
    }

    if (isAgent && chat.assignedAgent && chat.assignedAgent.toString() !== agentId) {
      fs.unlinkSync(file.path);
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create voice message
    const messageId = new mongoose.Types.ObjectId();
    const senderType = isAgent ? 'agent' : 'user';
    const senderId = isAgent ? agentId : userId;

    const message = {
      _id: messageId,
      senderId,
      senderType,
      type: 'voice',
      content: 'Voice message',
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

    // Update active users
    const userName = isAgent ? `Agent-${agentId}` : userId;
    ActiveUsersService.updateUserActivity(userName);

    res.json({
      message: 'Voice message uploaded successfully',
      messageId: messageId,
      fileUrl: message.fileUrl,
      duration: req.body.duration || null
    });

  } catch (error) {
    console.error('Error uploading voice message:', error);
    
    // Clean up file if there was an error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up voice file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      message: 'Failed to upload voice message',
      error: error.message 
    });
  }
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

// Delete message endpoint - for both agents and users
router.delete('/:chatId/message/:messageId', auth, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    
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
    
    const messageToDelete = chat.messages[messageIndex];
    
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
    
    // Important: Do NOT refund coins to users when they delete messages
    // Users paid for the message sending service, deletion doesn't reverse that
    
    await chat.save();
    
    res.json({
      success: true,
      message: 'Message deleted successfully',
      deletedMessageId: messageId,
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
