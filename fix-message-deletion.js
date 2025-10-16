// Fix for message deletion issue
// This script demonstrates the correct way to handle message deletion

const mongoose = require('mongoose');

// Message schema should include these fields for proper deletion handling
const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: function() { return !this.isDeleted; } // Only required if not deleted
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // ... other fields
});

// Backend route for deleting messages (correct implementation)
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id; // or req.agent.id for agents

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check authorization
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // CORRECT WAY: Set content to null, don't replace with deletion text
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = userId;
    message.content = null; // This ensures users don't see any content
    
    await message.save();

    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// Frontend: How to handle deleted messages in React components
const MessageComponent = ({ message }) => {
  // Don't render deleted messages at all for regular users
  if (message.isDeleted) {
    return null; // or return empty div for spacing if needed
  }

  return (
    <div className="message">
      <p>{message.content}</p>
      {/* Other message content */}
    </div>
  );
};

// For admin view, you might want to show deleted messages differently
const AdminMessageComponent = ({ message, isAdmin }) => {
  if (message.isDeleted && !isAdmin) {
    return null; // Regular users don't see deleted messages
  }

  if (message.isDeleted && isAdmin) {
    return (
      <div className="message deleted-message admin-only">
        <p className="text-gray-500 italic">
          [Message deleted by user at {new Date(message.deletedAt).toLocaleString()}]
        </p>
      </div>
    );
  }

  return (
    <div className="message">
      <p>{message.content}</p>
    </div>
  );
};

module.exports = { deleteMessage, MessageComponent, AdminMessageComponent };