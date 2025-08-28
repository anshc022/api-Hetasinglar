/**
 * Live Queue Fix Implementation
 * Fixes the issue where messages sent by users don't appear in agent live queue immediately
 */

const express = require('express');
const WebSocket = require('ws');

/**
 * ISSUE ANALYSIS:
 * When users send messages to agents, the messages are saved to the database
 * but the live queue in the agent dashboard doesn't update immediately.
 * 
 * ROOT CAUSES:
 * 1. No WebSocket notification to agents when new messages arrive
 * 2. Live queue polling interval might be too slow
 * 3. No real-time chat status updates
 * 4. Missing message broadcast system
 */

/**
 * FIX 1: Add WebSocket notification system to chatRoutes.js
 * When a message is sent, notify all connected agents immediately
 */

// Add this to the message sending route in chatRoutes.js after saving the message
function broadcastMessageToAgents(io, chat, newMessage) {
  if (io && io.clients) {
    // Broadcast to all connected agent clients
    io.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && 
          client.clientInfo?.role === 'agent') {
        
        const notification = {
          type: 'new_message',
          chatId: chat._id,
          customerId: chat.customerId,
          escortId: chat.escortId,
          message: {
            sender: newMessage.sender,
            message: newMessage.message,
            messageType: newMessage.messageType,
            timestamp: newMessage.timestamp
          },
          customerName: chat.customerName || 'Anonymous',
          unreadCount: chat.messages.filter(msg => 
            msg.sender === 'customer' && !msg.readByAgent
          ).length
        };
        
        client.send(JSON.stringify(notification));
      }
    });
  }
}

/**
 * FIX 2: Update chat status and last activity when messages are sent
 */
function updateChatActivity(chat, sender) {
  // Update last activity timestamps
  if (sender === 'customer') {
    chat.lastCustomerResponse = new Date();
  } else {
    chat.lastAgentResponse = new Date();
  }
  
  // Update chat status if needed
  if (chat.status === 'new' && sender === 'customer') {
    chat.status = 'active'; // Mark as active when customer sends message
  }
  
  chat.updatedAt = new Date();
  return chat;
}

/**
 * FIX 3: Enhanced live queue endpoint with real-time data
 */
function formatLiveQueueChat(chat, activeUsersService) {
  const unreadCount = chat.messages.filter(msg => 
    msg.sender === 'customer' && !msg.readByAgent
  ).length;

  const lastMessage = chat.messages.length > 0 ? 
    chat.messages[chat.messages.length - 1] : null;

  const isUserActive = activeUsersService ? 
    activeUsersService.isUserActive(chat.customerId?._id.toString()) : false;

  return {
    _id: chat._id,
    customerId: chat.customerId,
    escortId: chat.escortId,
    agentId: chat.agentId,
    status: chat.status,
    customerName: chat.customerName || chat.customerId?.username,
    lastCustomerResponse: chat.lastCustomerResponse,
    lastAgentResponse: chat.lastAgentResponse,
    unreadCount,
    isUserActive,
    hasNewMessages: unreadCount > 0,
    lastMessage: lastMessage ? {
      message: lastMessage.messageType === 'image' ? '📷 Image' : lastMessage.message,
      messageType: lastMessage.messageType,
      sender: lastMessage.sender,
      timestamp: lastMessage.timestamp,
      readByAgent: lastMessage.readByAgent
    } : null,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    priority: unreadCount > 5 ? 'high' : unreadCount > 0 ? 'medium' : 'normal'
  };
}

/**
 * FIX 4: Auto-refresh mechanism for frontend
 */
const LIVE_QUEUE_REFRESH_INTERVAL = 30000; // 30 seconds
const NEW_MESSAGE_REFRESH_INTERVAL = 5000;  // 5 seconds when new messages

function createAutoRefreshSystem() {
  return {
    // Normal refresh interval
    normalInterval: LIVE_QUEUE_REFRESH_INTERVAL,
    
    // Fast refresh when new messages detected
    fastInterval: NEW_MESSAGE_REFRESH_INTERVAL,
    
    // Switch to fast refresh when new messages arrive
    enableFastRefresh() {
      return NEW_MESSAGE_REFRESH_INTERVAL;
    },
    
    // Return to normal refresh after no new messages
    enableNormalRefresh() {
      return LIVE_QUEUE_REFRESH_INTERVAL;
    }
  };
}

/**
 * IMPLEMENTATION STEPS:
 */
console.log('🔧 Live Queue Fix Implementation Guide:');
console.log('');
console.log('1. ADD WEBSOCKET NOTIFICATION:');
console.log('   - In chatRoutes.js message route, add broadcastMessageToAgents() call');
console.log('   - Pass WebSocket server instance to broadcast new messages');
console.log('');
console.log('2. UPDATE CHAT ACTIVITY:');
console.log('   - Call updateChatActivity() when saving messages');
console.log('   - Update lastCustomerResponse/lastAgentResponse timestamps');
console.log('');
console.log('3. ENHANCE LIVE QUEUE ENDPOINT:');
console.log('   - Use formatLiveQueueChat() for consistent formatting');
console.log('   - Include unread counts and priority levels');
console.log('');
console.log('4. FRONTEND AUTO-REFRESH:');
console.log('   - Implement faster refresh when new messages arrive');
console.log('   - Use WebSocket notifications to trigger immediate updates');
console.log('');
console.log('5. SORT BY PRIORITY:');
console.log('   - Sort chats by unread count and last activity');
console.log('   - Show high-priority chats (>5 unread) at top');
console.log('');

// Export functions for implementation
module.exports = {
  broadcastMessageToAgents,
  updateChatActivity,
  formatLiveQueueChat,
  createAutoRefreshSystem
};
