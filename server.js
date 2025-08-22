const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const corsConfig = require('./config/corsConfig');
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
const reminderService = require('./services/reminderService');
const Chat = require('./models/Chat');
const Agent = require('./models/Agent');
const Subscription = require('./models/Subscription');

const app = express();
const server = http.createServer(app);

// Production-ready configuration
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;

// Enhanced logging for production
const log = {
  info: (message, ...args) => {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`, ...args);
  }
};

// Process error handlers for production
process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err);
  if (isProduction) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (isProduction) {
    process.exit(1);
  }
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    log.info('Process terminated');
    process.exit(0);
  });
});

// Database connection with enhanced error handling and production settings
const connectDB = async () => {
  try {
    const mongoOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 45000, // 45 seconds
      maxPoolSize: isProduction ? 20 : 10, // Connection pool size
      minPoolSize: isProduction ? 5 : 2,
      maxIdleTimeMS: 30000, // 30 seconds
      bufferCommands: false
    };

    if (isProduction) {
      mongoOptions.retryWrites = true;
      mongoOptions.w = 'majority';
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    log.info('MongoDB connected successfully:', conn.connection.host);
    
    mongoose.connection.on('error', (err) => {
      log.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      log.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      log.info('MongoDB reconnected');
    });

  } catch (error) {
    log.error('Database connection failed:', error.message);
    if (isProduction) {
      process.exit(1);
    }
  }
};

// Initialize database connection
connectDB();

// CORS Configuration with production settings
log.info('🌐 CORS Configuration:');
log.info('📍 Environment:', process.env.NODE_ENV || 'development');
log.info('🔗 Allowed Origins:', corsConfig.getAllowedOrigins());

// WebSocket server with enhanced configuration
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => corsConfig.verifyWebSocketClient(info),
  clientTracking: true,
  maxPayload: 1024 * 1024 // 1MB max payload
});

// Production-ready middleware configuration
// Custom CORS middleware to handle nginx conflicts
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Remove any conflicting headers first
  res.removeHeader('access-control-allow-origin');
  res.removeHeader('access-control-allow-credentials');
  res.removeHeader('access-control-allow-methods');
  res.removeHeader('access-control-allow-headers');
  
  // Set our specific CORS headers
  if (origin === 'https://hetasinglar.vercel.app') {
    res.setHeader('Access-Control-Allow-Origin', 'https://hetasinglar.vercel.app');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Access-Token');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Security middleware for production
if (isProduction) {
  app.set('trust proxy', 1); // Trust first proxy for AWS ELB
  app.use((req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
}

// Body parsing middleware with size limits
app.use(express.json({ 
  limit: isProduction ? '10mb' : '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: isProduction ? '10mb' : '50mb' 
}));

// Request logging middleware for production
if (isProduction) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      log.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);

// Ensure CORS headers are set properly on all responses
app.use((req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    // Force set CORS headers before sending
    const origin = req.headers.origin;
    if (origin === 'https://hetasinglar.vercel.app') {
      this.setHeader('Access-Control-Allow-Origin', 'https://hetasinglar.vercel.app');
    }
    this.setHeader('Access-Control-Allow-Credentials', 'true');
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    // Force set CORS headers before sending JSON
    const origin = req.headers.origin;
    if (origin === 'https://hetasinglar.vercel.app') {
      this.setHeader('Access-Control-Allow-Origin', 'https://hetasinglar.vercel.app');
    }
    this.setHeader('Access-Control-Allow-Credentials', 'true');
    return originalJson.call(this, data);
  };
  
  next();
});

// Continue with other routes...
app.use('/api/admin', adminRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/commission', commissionRoutes);
app.use('/api/user-assignment', userAssignmentRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/first-contact', firstContactRoutes);

// Enhanced health check endpoint
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    memory: process.memoryUsage(),
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      websocket: wss.clients.size,
      reminders: 'active'
    },
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      cpuUsage: process.cpuUsage()
    }
  };
  
  log.info('🟢 API Health Check:', healthStatus.timestamp);
  res.json(healthStatus);
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

mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('🟢 MongoDB connected successfully');
  console.log('📊 Database Status: Connected');
  await createDefaultAdmin(); // Initialize default admin account
  await initializeCommissionSystem(); // Initialize commission and affiliate system
  
  // Start the reminder service
  reminderService.start(30); // Check every 30 minutes
  console.log('⏰ Reminder service started');
  console.log('🔄 System initialization complete');
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
        if (data.userId && data.userId !== 'agent') {
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
        if (data.userId && data.userId !== 'agent') {
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
      ActiveUsersService.removeUser(ws.clientInfo.userId);
      
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
  console.log('🔄 Stopping reminder service...');
  reminderService.stop();
  console.log('✅ Reminder service stopped');
  console.log('🔌 Closing WebSocket connections...');
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
  console.log('🔄 Stopping reminder service...');
  reminderService.stop();
  console.log('✅ Reminder service stopped');
  console.log('🔌 Closing WebSocket connections...');
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

// Production-ready server startup
server.listen(PORT, '0.0.0.0', () => {
  const timestamp = new Date().toISOString();
  
  log.info('\n' + '='.repeat(60));
  log.info('🚀 HETASINGLAR BACKEND SERVER STARTED');
  log.info('='.repeat(60));
  log.info(`📍 Server URL: ${isProduction ? 'Production Environment' : `http://localhost:${PORT}`}`);
  log.info(`⏰ Started at: ${timestamp}`);
  log.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  log.info(`💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  log.info(`🔗 Health Check: ${isProduction ? '/api/health' : `http://localhost:${PORT}/api/health`}`);
  log.info(`📊 Status Check: ${isProduction ? '/api/status' : `http://localhost:${PORT}/api/status`}`);
  log.info('='.repeat(60));
  log.info('🟢 API READY - All endpoints are available');
  log.info('🔄 WebSocket server is running');
  log.info('✅ Backend is fully operational\n');
  
  // Log available endpoints
  log.info('📋 Available API Endpoints:');
  log.info('   • /api/health - Health check');
  log.info('   • /api/status - Server status');
  log.info('   • /api/auth - Authentication (with username validation)');
  log.info('   • /api/admin - Admin panel');
  log.info('   • /api/agents - Agent management');
  log.info('   • /api/chats - Chat system');
  log.info('   • /api/subscription - Subscriptions');
  log.info('   • /api/commission - Commission system');
  log.info('   • /api/affiliate - Affiliate program');
  log.info('   • /api/logs - System logs');
  log.info('   • /api/first-contact - First contact\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    log.error('Server error:', err);
    if (isProduction) {
      process.exit(1);
    }
  }
});
