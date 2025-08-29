const mongoose = require('mongoose');

const agentCustomerSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Assignment details
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  assignmentType: {
    type: String,
    enum: ['affiliate', 'manual', 'auto'],
    default: 'manual'
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  // Commission settings for this specific agent-customer relationship
  customCommissionRates: {
    chatAgentPercentage: { type: Number, min: 0, max: 100 },
    affiliatePercentage: { type: Number, min: 0, max: 100 },
    adminPercentage: { type: Number, min: 0, max: 100 }
  },
  
  // Statistics
  stats: {
    totalChats: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    totalCreditsUsed: { type: Number, default: 0 },
    lastChatDate: Date,
    averageResponseTime: { type: Number, default: 0 }, // in minutes
    customerSatisfactionRating: { type: Number, min: 1, max: 5 }
  },
  
  // Relationship metadata
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'vip'],
    default: 'medium'
  },
  tags: [String],
  notes: String,
  
  // Dates
  assignedDate: {
    type: Date,
    default: Date.now
  },
  lastActiveDate: Date,
  
  // Restrictions
  restrictions: {
    canMessage: { type: Boolean, default: true },
    maxDailyMessages: { type: Number, min: 0 },
    allowedHours: {
      start: { type: String, match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ }, // HH:MM format
      end: { type: String, match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ }
    }
  }
}, {
  timestamps: true
});

// Compound indexes for better query performance
agentCustomerSchema.index({ agentId: 1, customerId: 1 }, { unique: true });
agentCustomerSchema.index({ agentId: 1, status: 1 });
agentCustomerSchema.index({ customerId: 1, status: 1 });
agentCustomerSchema.index({ assignedDate: -1 });
agentCustomerSchema.index({ priority: 1 });

// Static methods
agentCustomerSchema.statics.getAgentCustomers = function(agentId, options = {}) {
  const match = { agentId };
  if (options.status) match.status = options.status;
  if (options.priority) match.priority = options.priority;
  
  return this.find(match)
    .populate('customerId', 'username email dateOfBirth sex')
    .populate('agentId', 'agentId name')
    .sort({ assignedDate: -1 })
    .limit(options.limit || 50);
};

agentCustomerSchema.statics.getCustomerAgents = function(customerId) {
  return this.find({ customerId, status: 'active' })
    .populate('agentId', 'agentId name permissions')
    .sort({ assignedDate: -1 });
};

agentCustomerSchema.statics.assignCustomerToAgent = function(customerId, agentId, assignedBy, options = {}) {
  return this.findOneAndUpdate(
    { customerId, agentId },
    {
      customerId,
      agentId,
      assignedBy,
      assignmentType: options.assignmentType || 'manual',
      status: 'active',
      priority: options.priority || 'medium',
      customCommissionRates: options.customCommissionRates,
      notes: options.notes,
      restrictions: options.restrictions,
      assignedDate: new Date()
    },
    { upsert: true, new: true }
  );
};

// Instance methods
agentCustomerSchema.methods.updateStats = function(chatData) {
  this.stats.totalChats += 1;
  this.stats.totalEarnings += chatData.earnings || 0;
  this.stats.totalCreditsUsed += chatData.creditsUsed || 0;
  this.stats.lastChatDate = new Date();
  this.lastActiveDate = new Date();
  
  // Update average response time if provided
  if (chatData.responseTime) {
    const currentAvg = this.stats.averageResponseTime || 0;
    const totalChats = this.stats.totalChats;
    this.stats.averageResponseTime = ((currentAvg * (totalChats - 1)) + chatData.responseTime) / totalChats;
  }
  
  return this.save();
};

module.exports = mongoose.model('AgentCustomer', agentCustomerSchema);
