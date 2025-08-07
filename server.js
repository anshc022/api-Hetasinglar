const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
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
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    return origin === 'http://localhost:8000';
  }
});

app.use(cors({
  origin: 'http://localhost:8000', // Allow frontend URL
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
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

mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('MongoDB connected');
  await createDefaultAdmin(); // Initialize default admin account
  await initializeCommissionSystem(); // Initialize commission and affiliate system
  
  // Start the reminder service
  reminderService.start(30); // Check every 30 minutes
  console.log('Reminder service started');
}).catch(err => console.error('MongoDB connection error:', err));

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
  console.log('Shutting down gracefully...');
  reminderService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  reminderService.stop();
  process.exit(0);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

// Update the server start
server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
