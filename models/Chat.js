const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  escortId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'EscortProfile', 
    required: true 
  },
  status: {
    type: String,
    enum: ['new', 'assigned', 'pushed', 'closed'],
    default: 'new'
  },
  isFirstContact: { type: Boolean, default: false },
  pushBackUntil: Date,  messages: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    sender: { type: String, enum: ['agent', 'customer'] },
    message: String,
  messageType: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
    imageData: String, // Base64 encoded image data
    mimeType: String, // Image MIME type
    filename: String, // Original filename
    timestamp: { type: Date, default: Date.now },
    readByAgent: { type: Boolean, default: false },
    readByCustomer: { type: Boolean, default: false },
    senderName: String,
    senderImage: String,
    requiresResponse: { type: Boolean, default: false },
    responseTimeout: Date,
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    originalMessage: String, // Store original message for edit history
    isFollowUpResponse: { type: Boolean, default: false }, // Flag for follow-up messages
    note: { 
      text: String,
      timestamp: { type: Date },
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
      agentName: String
    }
  }],
  customerName: String,
  lastCustomerResponse: Date,
  lastAgentResponse: Date,
  requiresFollowUp: { type: Boolean, default: false },  followUpDue: Date,
  comments: [{ 
    text: String, 
    timestamp: { type: Date, default: Date.now },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    agentName: String
  }],
  domain: String,
  
  // New reminder system fields
  reminderHandled: { type: Boolean, default: false },
  reminderHandledAt: Date,
  reminderSnoozedUntil: Date,
  
  // Panic Room fields
  isInPanicRoom: { type: Boolean, default: false },
  panicRoomEnteredAt: Date,
  panicRoomReason: String,
  panicRoomNotes: [{
    text: String,
    timestamp: { type: Date, default: Date.now },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    agentName: String
  }],
  panicRoomEnteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  reminders: [{
    text: String,
    dueDate: Date,
    completed: { type: Boolean, default: false },
    type: { type: String, enum: ['followup', 'auto', 'manual'], default: 'manual' }
  }],
  assignedHistory: [{
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    assignedAt: { type: Date, default: Date.now }
  }],
  pushBackHistory: [{
    hours: Number,
    pushedAt: { type: Date, default: Date.now },
    pushedUntil: Date,
    reason: String
  }]
});

// Update timestamps and handle message response tracking
chatSchema.pre('save', function(next) {
  // Update lastMessage field if there are messages
  if (this.messages && this.messages.length > 0) {
    this.lastMessage = this.messages[this.messages.length - 1];
    
    // Handle customer vs agent messages
    if (this.isModified('messages')) {
      const lastMessage = this.messages[this.messages.length - 1];
      
      if (lastMessage.sender === 'customer') {
        // When customer sends a message, reset any existing follow-up timers
        this.requiresFollowUp = false;
        this.followUpDue = undefined;
        
        // Set reminder flags since we need to track agent response time
        this.reminderHandled = false;
        this.reminderHandledAt = undefined;
        this.reminderSnoozedUntil = undefined;
        
      } else if (lastMessage.sender === 'agent') {
        this.lastAgentResponse = lastMessage.timestamp;
        
        // Clear any existing reminder flags since agent responded
        this.reminderHandled = true;
        this.reminderHandledAt = new Date();
        this.reminderSnoozedUntil = undefined;
      }
    }
  }
  next();
});

module.exports = mongoose.model('Chat', chatSchema);
