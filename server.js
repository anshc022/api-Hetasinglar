const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const WebSocket = require('ws');
const http = require('http');
const corsConfig = require('./config/corsConfig');
const cacheService = require('./services/cache');
const { router: authRoutes } = require('./auth');
const adminRoutes = require('./routes/adminRoutes');
const agentRoutes = require('./routes/agentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const commissionRoutes = require('./routes/commissionRoutes');
const userAssignmentRoutes = require('./routes/userAssignmentRoutes');
const affiliateRoutes = require('./routes/affiliateRoutes');
const logRoutes = require('./routes/logRoutes');
const firstContactRoutes = require('./routes/firstContactRoutes');
const createDefaultAdmin = require('./initAdmin');
const initializeCommissionSystem = require('./initCommissionSystem');
const ActiveUsersService = require('./services/activeUsers');
const Chat = require('./models/Chat');
const Agent = require('./models/Agent');
const Subscription = require('./models/Subscription');
const EscortProfile = require('./models/EscortProfile');
// Reminder system constants
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000; // run every 1 minute
const DEFAULT_REMINDER_INTERVAL_HOURS = 4; // 4 hours inactivity

const app = express();
const server = http.createServer(app);

// Make cache service globally available
global.cacheService = cacheService;

// Performance optimizations
app.use(compression()); // Enable gzip compression
app.set('trust proxy', 1); // Trust first proxy for performance
app.disable('x-powered-by'); // Remove Express signature for security

// CORS Configuration
console.log('🌐 CORS Configuration:');
console.log('📍 Environment:', process.env.NODE_ENV || 'development');
console.log('� Allowed Origins:', corsConfig.getAllowedOrigins());

const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => corsConfig.verifyWebSocketClient(info)
});

// Make WebSocket server accessible to routes
app.locals.wss = wss;

// CORS middleware for credentialed requests - must use specific origin, not wildcard
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = corsConfig.getAllowedOrigins();
  
  // Set specific origin for credentialed requests if it's in our allowed list
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // For unknown origins, deny access
    console.log('🚫 CORS blocked origin:', origin);
    console.log('🔍 Allowed origins:', allowedOrigins);
    res.setHeader('Access-Control-Allow-Origin', '');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Access-Token');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Optimized body parsing with performance settings
app.use(express.json({ 
  limit: '5mb',
  verify: (req, res, buf) => {
    // Pre-parse optimization - only for small payloads
    if (buf.length < 1000) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ 
  limit: '5mb', 
  extended: true,
  parameterLimit: 1000 // Limit parameters for security and performance
}));

// Add response time header for monitoring (fixed version)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log(`⚠️  Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  next();
});

// Add global caching for specific endpoints
app.use(cacheService.middleware([
  '/agents/dashboard',
  '/agents/my-escorts', 
  '/health',
  '/status'
], 120000)); // 2 minute cache

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/commission', commissionRoutes);
app.use('/api/user-assignment', userAssignmentRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/logs', logRoutes); // Add logs API routes
app.use('/api/first-contact', firstContactRoutes); // Add first contact API routes

// Expose helper to clear fallback live queue cache
if (typeof agentRoutes.clearLiveQueueFallbackCache === 'function') {
  app.locals.clearLiveQueueFallbackCache = agentRoutes.clearLiveQueueFallbackCache;
}

// Health check endpoint with caching
app.get('/api/health', (req, res) => {
  // Cache health check for 30 seconds
  res.set('Cache-Control', 'public, max-age=30');
  
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    deploymentId: 'deploy-2025-08-24-v4', // Track deployment
    memory: process.memoryUsage(),
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      websocket: wss.clients.size
    }
  };
  
  console.log('🟢 API Health Check:', healthStatus.timestamp);
  res.json(healthStatus);
});

// Cache statistics endpoint (for debugging)
app.get('/api/cache-stats', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({
    cache: cacheService.getStats(),
    timestamp: new Date().toISOString()
  });
});

// CORS Test endpoint
app.get('/api/cors-test', (req, res) => {
  const corsTestResult = {
    message: 'CORS is working correctly',
    origin: req.headers.origin || 'No origin header',
    userAgent: req.headers['user-agent'] || 'No user agent',
    timestamp: new Date().toISOString(),
    allowedOrigins: corsConfig.getAllowedOrigins(),
    requestHeaders: req.headers
  };
  
  console.log('🌐 CORS Test Request from:', req.headers.origin);
  res.json(corsTestResult);
});

// OPTIONS preflight handler for all routes
app.options('*', (req, res) => {
  console.log('✈️  CORS Preflight Request from:', req.headers.origin);
  res.sendStatus(200);
});

// Server status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    message: 'HetaSinglar Backend API is running',
    status: 'active',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 5000,
    endpoints: [
      '/api/health',
      '/api/auth',
      '/api/admin',
      '/api/agents',
      '/api/chats',
      '/api/subscription',
      '/api/commission',
      '/api/affiliate'
    ]
  });
});

// Lightweight reminder scheduler implementation
function startReminderScheduler() {
  console.log('⏰ Reminder scheduler starting...');
  setInterval(async () => {
    try {
      const now = new Date();
      const intervalMs = DEFAULT_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000;
      const threshold = new Date(Date.now() - intervalMs);

      // Find candidate chats: have an agent message but no customer reply for interval
      const candidates = await Chat.find({
        // Only for active/assigned chats not closed
        status: { $in: ['new', 'assigned', 'active'] },
        // Customer inactivity threshold
        $or: [
          { lastCustomerResponse: { $lte: threshold } },
          { lastCustomerResponse: { $exists: false }, createdAt: { $lte: threshold } }
        ],
        // Ensure at least one agent message exists
        messages: { $elemMatch: { sender: 'agent' } },
        // Customer has NOT responded after agent message in this cycle
        reminderActive: { $in: [false, null] }
      }).select('_id lastCustomerResponse lastAgentResponse reminderActive reminderCount lastReminderAt reminderIntervalHours createdAt');

      let activated = 0;
      for (const chat of candidates) {
        const intervalHours = chat.reminderIntervalHours || DEFAULT_REMINDER_INTERVAL_HOURS;
        const intervalMsCurrent = intervalHours * 60 * 60 * 1000;
        const lastCustomer = chat.lastCustomerResponse || chat.createdAt;
        if (Date.now() - lastCustomer.getTime() >= intervalMsCurrent) {
          await Chat.findByIdAndUpdate(chat._id, {
            $set: {
              reminderActive: true,
              lastReminderAt: now,
              firstReminderAt: chat.firstReminderAt || now
            },
            $inc: { reminderCount: 1 }
          });
          activated++;
        }
      }

      // Handle escalated reminders (already active but still no customer response)
      const activeChats = await Chat.find({
        reminderActive: true,
        status: { $in: ['new', 'assigned', 'active'] }
      }).select('_id lastCustomerResponse lastReminderAt reminderCount reminderIntervalHours createdAt');

      let escalated = 0;
      for (const chat of activeChats) {
        const intervalHours = chat.reminderIntervalHours || DEFAULT_REMINDER_INTERVAL_HOURS;
        const intervalMsCurrent = intervalHours * 60 * 60 * 1000;
        const lastCustomer = chat.lastCustomerResponse || chat.createdAt;
        // If customer still inactive and enough time since last reminder
        if (Date.now() - lastCustomer.getTime() >= (chat.reminderCount + 1) * intervalMsCurrent) {
          await Chat.findByIdAndUpdate(chat._id, {
            $set: { lastReminderAt: now },
            $inc: { reminderCount: 1 }
          });
          escalated++;
        }
      }

      if ((activated + escalated) > 0) {
        console.log(`🔔 Reminder scheduler: activated=${activated}, escalated=${escalated}`);
        // Broadcast a lightweight update event to agents so they can refetch live queue
        if (app.locals.wss) {
          const payload = JSON.stringify({ type: 'reminder_updates', activated, escalated, timestamp: now.toISOString() });
          app.locals.wss.clients.forEach(client => {
            try {
              if (client.readyState === 1 && client.clientInfo?.role === 'agent') {
                client.send(payload);
              }
            } catch {}
          });
        }
      }
    } catch (err) {
      console.warn('Reminder scheduler error:', err.message);
    }
  }, REMINDER_CHECK_INTERVAL_MS);
}

mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Performance optimizations (updated for latest mongoose)
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  // Additional performance settings
  maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
  family: 4 // Use IPv4, skip trying IPv6
}).then(async () => {
  console.log('🟢 MongoDB connected successfully');
  console.log('📊 Database Status: Connected');
  await createDefaultAdmin(); // Initialize default admin account
  await initializeCommissionSystem(); // Initialize commission and affiliate system

  // Warm-up: Prefetch public escorts list into cache to reduce first-hit latency
  try {
    const cacheKey = 'escorts:active:all';
    const existing = cacheService.get(cacheKey);
    if (!existing) {
      console.log('🔥 Warming up escorts cache...');
      const profiles = await EscortProfile.find({ status: 'active' })
        .select('username firstName gender profileImage profilePicture imageUrl country region status createdAt')
        .sort({ createdAt: -1 })
        .lean();
      cacheService.set(cacheKey, profiles, 120000);
      console.log(`✅ Warmed escorts cache with ${profiles.length} profiles`);
    }
  } catch (warmErr) {
    console.log('⚠️  Escorts cache warm-up failed:', warmErr.message);
  }
  console.log('🔄 System initialization complete');

  // Start lightweight reminder scheduler AFTER DB connection
  startReminderScheduler();
}).catch(err => {
  console.error('🔴 MongoDB connection error:', err);
  console.log('❌ Database Status: Failed to connect');
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Store client info
  ws.clientInfo = {
    chatId: null,
    role: null,
    userId: null
  };

  // Check for overdue responses periodically
  if (ws.clientInfo?.role === 'agent') {
    ws.responseCheckInterval = setInterval(async () => {
      try {
        const agent = await Agent.findById(ws.clientInfo.userId);
        if (!agent) return;

        const chats = await Chat.find({
          agentId: agent._id,
          status: { $in: ['assigned', 'new'] },
          requiresFollowUp: true,
          followUpDue: { $lte: new Date() }
        }).populate('customerId', 'username')
          .populate('escortId', 'firstName');

        if (chats.length > 0) {
          const notifications = chats.map(chat => ({
            type: 'reminder_notification',
            chatId: chat._id,
            customerName: chat.customerId?.username || 'User',
            escortName: chat.escortId?.firstName || 'Escort',
            followUpDue: chat.followUpDue,
            lastMessage: chat.messages[chat.messages.length - 1]?.message || '',
            severity: getNotificationSeverity(chat.followUpDue)
          }));

          ws.send(JSON.stringify({
            type: 'notifications_update',
            notifications
          }));
        }
      } catch (error) {
        console.error('Error checking for overdue responses:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle client info updates
      if (data.type === 'client_info') {
        ws.clientInfo = {
          chatId: data.chatId,
          role: data.role,
          userId: data.userId
        };
        
        // Set user as active when they connect
  if (data.userId && data.role !== 'agent') {
          ActiveUsersService.setUserActive(data.userId);
          
          // Broadcast user online status to agents
          const presenceUpdate = {
            type: 'user_presence',
            userId: data.userId,
            status: 'online',
            timestamp: new Date().toISOString()
          };
          
          // Send to all agent clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.clientInfo?.role === 'agent') {
              client.send(JSON.stringify(presenceUpdate));
            }
          });
        }
        return;
      }

      // Handle user activity updates
      if (data.type === 'user_activity') {
        if (data.userId && ws.clientInfo?.role !== 'agent') {
          ActiveUsersService.setUserActive(data.userId);
          
          // Optional: Broadcast activity to agents for live presence updates
          const activityUpdate = {
            type: 'user_activity_update',
            userId: data.userId,
            timestamp: data.timestamp
          };
          
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.clientInfo?.role === 'agent') {
              client.send(JSON.stringify(activityUpdate));
            }
          });
        }
        return;
      }

      // Handle message read status updates
      if (data.type === 'message_read') {
        try {
          const chat = await Chat.findById(data.chatId);
          if (chat && chat.messages.length > 0) {
            // Mark messages as read by the appropriate party
            chat.messages.forEach(message => {
              if (data.sender === 'agent') {
                message.readByAgent = true;
              } else if (data.sender === 'customer') {
                message.readByCustomer = true;
              }
            });
            
            await chat.save();
            
            // Broadcast read status update
            const readUpdate = {
              type: 'messages_read',
              chatId: data.chatId,
              readBy: data.sender,
              timestamp: new Date().toISOString()
            };
            
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                const isInSameChat = client.clientInfo?.chatId === data.chatId;
                const isAgent = client.clientInfo?.role === 'agent';
                const isTargetedUser = chat.customerId && client.clientInfo?.userId === chat.customerId.toString();
                
                if (isInSameChat || isAgent || isTargetedUser) {
                  client.send(JSON.stringify(readUpdate));
                }
              }
            });
          }
        } catch (error) {
          console.error('Error handling message read update:', error);
        }
        return;
      }

      // Handle subscription purchases
      if (data.type === 'subscription_purchase') {
        // Broadcast subscription purchase to admin clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.clientInfo?.role === 'admin') {
            client.send(JSON.stringify({
              type: 'subscription_update',
              data: {
                ...data.data,
                id: Date.now(), // Add unique ID for the purchase
                timestamp: new Date()
              }
            }));
          }
        });
        return;
      }

      // Handle chat messages
      if (data.type === 'chat_message') {
        try {
          // Deduplicate by clientId if provided to avoid double-processing
          if (data.clientId && recordAndCheckDuplicate(data.chatId, data.clientId)) {
            // Already processed/broadcast recently; skip
            return;
          }
          // Find the chat
          const chat = await Chat.findById(data.chatId).populate('customerId').populate('escortId');
          
          if (!chat) {
            const errorMessage = {
              type: 'error',
              error: 'Chat not found',
              chatId: data.chatId
            };
            
            // Send error to sender only since we don't have chat details
            ws.send(JSON.stringify(errorMessage));
            return;
          }

          // Create new message
          const newMessage = {
            sender: data.sender,
            message: data.message,
            messageType: data.messageType || 'text',
            timestamp: new Date(),
            readByAgent: data.sender === 'agent',
            readByCustomer: data.sender === 'customer'
          };

          // Add image-specific fields if it's an image message
          if (data.messageType === 'image') {
            newMessage.imageData = data.imageData;
            newMessage.mimeType = data.mimeType;
            newMessage.filename = data.filename;
          }

          // Save message to database
          chat.messages.push(newMessage);
          chat.updatedAt = new Date();

          // Handle message based on sender
          if (data.sender === 'agent') {
            // Mark any existing reminder as handled when agent replies
            chat.reminderHandled = true;
            chat.reminderHandledAt = new Date();
            chat.reminderSnoozedUntil = undefined;
            
            // If this was marked as a follow-up response
            if (data.isFollowUp) {
              newMessage.isFollowUpResponse = true;
            }
          } else {
            // Customer message - reset reminder flags to start tracking agent response time
            chat.reminderHandled = false;
            chat.reminderHandledAt = undefined;
            chat.reminderSnoozedUntil = undefined;
            
            // Reset any follow-up flags
            chat.requiresFollowUp = false;
            chat.followUpDue = null;
          }

          await chat.save();

          // Broadcast message to all relevant clients
          const broadcastMessage = {
            type: 'chat_message',
            chatId: data.chatId,
            message: data.message,
            messageType: data.messageType || 'text',
            sender: data.sender,
            timestamp: newMessage.timestamp,
            readByAgent: newMessage.readByAgent,
            readByCustomer: newMessage.readByCustomer,
            clientId: data.clientId,
            reminderHandled: chat.reminderHandled,
            reminderHandledAt: chat.reminderHandledAt,
            reminderSnoozedUntil: chat.reminderSnoozedUntil
          };

          // Add image-specific fields if it's an image message
          if (data.messageType === 'image') {
            broadcastMessage.imageData = data.imageData;
            broadcastMessage.mimeType = data.mimeType;
            broadcastMessage.filename = data.filename;
          }

          // Add subscription info for customer messages
          if (data.sender === 'customer') {
            const subscription = await Subscription.findOne({
              userId: chat.customerId,
              status: 'active'
            });
            if (subscription) {
              broadcastMessage.subscription = {
                type: subscription.type,
                messagesAllowed: subscription.messagesAllowed,
                messagesRemaining: subscription.messagesRemaining
              };
            }
          }

          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              const isInSameChat = client.clientInfo?.chatId === data.chatId;
              const isAgent = client.clientInfo?.role === 'agent';
              const isTargetedUser = chat.customerId && client.clientInfo?.userId === chat.customerId.toString();
              const isTargetedAgent = isAgent && chat.escortId && client.clientInfo?.agentId === chat.escortId.toString();
              
              if (isInSameChat || isTargetedUser || isTargetedAgent) {
                client.send(JSON.stringify(broadcastMessage));
              }
            }
          });

          // Broadcast live queue update to all agents
          const liveQueueUpdate = {
            type: 'live_queue_update',
            chatId: data.chatId,
            action: 'message_added',
            timestamp: new Date().toISOString(),
            unreadCount: chat.messages.filter(msg => msg.sender === 'customer' && !msg.readByAgent).length,
            lastMessage: {
              message: data.messageType === 'image' ? '📷 Image' : data.message,
              messageType: data.messageType || 'text',
              sender: data.sender,
              timestamp: newMessage.timestamp
            }
          };

          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.clientInfo?.role === 'agent') {
              client.send(JSON.stringify(liveQueueUpdate));
            }
          });
        } catch (error) {
          console.error('WebSocket message error:', error);
          // Send error message back to sender
          const errorMessage = {
            type: 'error',
            error: 'Failed to process message',
            details: error.message,
            chatId: data?.chatId
          };
          ws.send(JSON.stringify(errorMessage));
        }
      }
    } catch (error) {
      console.error('WebSocket message parsing error:', error);
      // Send error message back to sender
      const errorMessage = {
        type: 'error',
        error: 'Invalid message format',
        details: error.message
      };
      ws.send(JSON.stringify(errorMessage));
    }
  });

  ws.on('close', () => {
    if (ws.clientInfo?.userId) {
      if (ws.clientInfo?.userId && ws.clientInfo?.role !== 'agent') {
        ActiveUsersService.removeUser(ws.clientInfo.userId);
      }
      
      // Broadcast user offline status to agents
      if (ws.clientInfo.userId !== 'agent') {
        const presenceUpdate = {
          type: 'user_presence',
          userId: ws.clientInfo.userId,
          status: 'offline',
          timestamp: new Date().toISOString()
        };
        
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.clientInfo?.role === 'agent') {
            client.send(JSON.stringify(presenceUpdate));
          }
        });
      }
    }
    if (ws.responseCheckInterval) {
      clearInterval(ws.responseCheckInterval);
    }
  });
});

function getNotificationSeverity(dueDate) {
  const now = new Date();
  const hours = Math.floor((now - new Date(dueDate)) / (1000 * 60 * 60));
  
  if (hours >= 6) return 'high';
  if (hours >= 4) return 'medium';
  return 'low';
}

// Clean up inactive users every minute
setInterval(() => {
  ActiveUsersService.cleanupInactiveUsers();
}, 60000);

// Periodic server health status alerts (every 30 minutes)
setInterval(() => {
  const timestamp = new Date().toISOString();
  const uptime = Math.floor(process.uptime());
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  console.log('\n🏥 SERVER HEALTH STATUS ALERT');
  console.log('━'.repeat(40));
  console.log(`⏰ Time: ${timestamp}`);
  console.log(`⏱️  Uptime: ${hours}h ${minutes}m`);
  console.log(`🔗 Active WebSocket connections: ${wss.clients.size}`);
  console.log(`💾 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  console.log(`🗄️  Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  console.log('━'.repeat(40));
  console.log('🟢 API STATUS: HEALTHY & OPERATIONAL\n');
}, 30 * 60 * 1000); // Every 30 minutes

// Add WebSocket heartbeat
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 SHUTDOWN ALERT - SIGINT received');
  console.log('━'.repeat(50));
  console.log('⏰ Shutdown initiated at:', new Date().toISOString());
  console.log(' Closing WebSocket connections...');
  wss.close();
  console.log('✅ WebSocket server closed');
  console.log('💾 Closing database connections...');
  mongoose.connection.close();
  console.log('✅ Database connections closed');
  console.log('━'.repeat(50));
  console.log('👋 HetaSinglar Backend Server shutdown complete\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 SHUTDOWN ALERT - SIGTERM received');
  console.log('━'.repeat(50));
  console.log('⏰ Shutdown initiated at:', new Date().toISOString());
  console.log(' Closing WebSocket connections...');
  wss.close();
  console.log('✅ WebSocket server closed');
  console.log('💾 Closing database connections...');
  mongoose.connection.close();
  console.log('✅ Database connections closed');
  console.log('━'.repeat(50));
  console.log('👋 HetaSinglar Backend Server shutdown complete\n');
  process.exit(0);
});

app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error('\n🚨 SERVER ERROR ALERT');
  console.error('━'.repeat(50));
  console.error(`⏰ Time: ${timestamp}`);
  console.error(`🔍 Endpoint: ${req.method} ${req.path}`);
  console.error(`❌ Error: ${err.message}`);
  console.error(`📍 Stack: ${err.stack}`);
  console.error('━'.repeat(50));
  console.error('⚠️  Server encountered an error but remains operational\n');
  
  res.status(500).json({ 
    message: 'Server error',
    timestamp: timestamp,
    status: 'error_handled'
  });
});

// Update the server start
// Initialize a lightweight idempotency cache for chat message broadcasts (prevents dupes)
// Keyed by `${chatId}:${clientId}` with a timestamp value
app.locals.sentMessageIds = app.locals.sentMessageIds || new Map();
function recordAndCheckDuplicate(chatId, clientId, ttlMs = 5 * 60 * 1000) {
  try {
    if (!clientId) return false; // No clientId means we cannot dedupe
    const key = `${chatId}:${clientId}`;
    const now = Date.now();
    const last = app.locals.sentMessageIds.get(key);
    if (last && now - last < ttlMs) {
      return true; // duplicate within TTL
    }
    app.locals.sentMessageIds.set(key, now);
    return false;
  } catch {
    return false;
  }
}

// Periodically prune old entries (every 10 minutes)
setInterval(() => {
  try {
    const now = Date.now();
    const ttlMs = 10 * 60 * 1000;
    for (const [key, ts] of app.locals.sentMessageIds) {
      if (now - ts > ttlMs) app.locals.sentMessageIds.delete(key);
    }
  } catch {}
}, 10 * 60 * 1000);

server.listen(process.env.PORT || 5000, () => {
  const port = process.env.PORT || 5000;
  const timestamp = new Date().toISOString();
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 HETASINGLAR BACKEND SERVER STARTED');
  console.log('='.repeat(60));
  console.log(`📍 Server URL: http://localhost:${port}`);
  console.log(`⏰ Started at: ${timestamp}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health Check: http://localhost:${port}/api/health`);
  console.log(`📊 Status Check: http://localhost:${port}/api/status`);
  console.log('='.repeat(60));
  console.log('🟢 API READY - All endpoints are available');
  console.log('🔄 WebSocket server is running');
  console.log('✅ Backend is fully operational\n');
  
  // Log available endpoints
  console.log('📋 Available API Endpoints:');
  console.log('   • /api/health - Health check');
  console.log('   • /api/status - Server status');
  console.log('   • /api/auth - Authentication');
  console.log('   • /api/admin - Admin panel');
  console.log('   • /api/agents - Agent management');
  console.log('   • /api/chats - Chat system');
  console.log('   • /api/subscription - Subscriptions');
  console.log('   • /api/commission - Commission system');
  console.log('   • /api/affiliate - Affiliate program');
  console.log('   • /api/logs - System logs');
  console.log('   • /api/first-contact - First contact\n');
});
