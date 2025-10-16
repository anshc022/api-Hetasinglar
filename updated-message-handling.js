// Backend update for message filtering
// Add this to your message routes to properly filter deleted messages

// Update the get messages endpoint in your routes
const getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { isAdmin } = req.query; // Check if request is from admin
    
    // Base query
    let query = { chatId };
    
    // For non-admin users, exclude deleted messages
    if (!isAdmin || isAdmin !== 'true') {
      query.isDeleted = { $ne: true };
    }
    
    const messages = await Message.find(query)
      .populate('sender', 'username firstName')
      .sort({ createdAt: 1 });
    
    res.json({ 
      success: true, 
      messages: messages 
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch messages' 
    });
  }
};

// Update WebSocket message deletion handler
io.on('connection', (socket) => {
  socket.on('deleteMessage', async (data) => {
    try {
      const { messageId, chatId } = data;
      const userId = socket.userId;
      
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }
      
      // Check authorization
      if (message.sender.toString() !== userId) {
        socket.emit('error', { message: 'Not authorized to delete this message' });
        return;
      }
      
      // Mark as deleted but keep in database for admin purposes
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      message.content = null; // This hides content from users
      await message.save();
      
      // Emit to all users in the chat that message was deleted
      // Only send the deletion event, not the "deleted message" text
      io.to(chatId).emit('messageDeleted', { 
        messageId: messageId,
        deletedBy: userId,
        timestamp: message.deletedAt
      });
      
      socket.emit('messageDeleteSuccess', { 
        messageId: messageId 
      });
      
    } catch (error) {
      console.error('Error deleting message:', error);
      socket.emit('error', { 
        message: 'Failed to delete message' 
      });
    }
  });
});

// Frontend WebSocket handler update
const handleWebSocketEvents = (socket) => {
  // Handle message deletion
  socket.on('messageDeleted', (data) => {
    // Remove the message from the UI completely for regular users
    // Admin users can still see deleted messages in their special view
    const { messageId } = data;
    
    // Update your message state to remove the deleted message
    setMessages(prevMessages => 
      prevMessages.filter(msg => msg._id !== messageId)
    );
  });
  
  socket.on('messageDeleteSuccess', (data) => {
    // Show success notification
    console.log('Message deleted successfully');
  });
};

module.exports = { getMessages, handleWebSocketEvents };