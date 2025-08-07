const mongoose = require('mongoose');

const earningsSchema = new mongoose.Schema({
  // Transaction details
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['earning', 'withdrawal', 'chat_commission', 'affiliate_commission'],
    default: 'earning'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return this.type === 'earning'; }
  },
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: function() { return this.type === 'earning'; }
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  affiliateAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  
  // For withdrawals
  amount: {
    type: Number,
    required: function() { return this.type === 'withdrawal'; }
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'paypal', 'crypto', 'upi'],
    required: function() { return this.type === 'withdrawal'; }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  description: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  payoutDate: Date,
  
  // Amount details - Customer buys coins and uses them to chat
  coinsUsed: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  coinValue: {
    type: Number,
    required: true,
    min: 0,
    default: 1.0 // $1 per coin
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0 // coinsUsed * coinValue
  },
  
  // Commission breakdown - simplified to direct amounts
  agentCommission: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  agentCommissionPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 30
  },
  affiliateCommission: {
    type: Number,
    min: 0,
    default: 0
  },
  affiliateCommissionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 20
  },
  adminCommission: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  adminCommissionPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 50
  },
  
  // Payment status
  paymentStatus: {
    type: String,
    enum: ['pending', 'processed', 'paid', 'disputed', 'cancelled'],
    default: 'pending'
  },
  
  // Metadata
  description: String,
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file'],
    default: 'text'
  },
  
  // Timestamps
  transactionDate: {
    type: Date,
    default: Date.now
  },
  processedDate: Date,
  paidDate: Date,
  
  // Additional fields
  notes: String,
  isRecurring: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate commissions
earningsSchema.pre('save', function(next) {
  // Calculate total amount if not set
  if (!this.totalAmount || this.totalAmount === 0) {
    this.totalAmount = this.coinsUsed * this.coinValue;
  }
  
  // Set commission percentages based on whether affiliate exists
  if (this.affiliateAgentId) {
    // With affiliate: Agent 30%, Affiliate 20%, Admin 50%
    this.agentCommissionPercentage = 30;
    this.affiliateCommissionPercentage = 20;
    this.adminCommissionPercentage = 50;
  } else {
    // Without affiliate: Agent 30%, Admin 70%
    this.agentCommissionPercentage = 30;
    this.affiliateCommissionPercentage = 0;
    this.adminCommissionPercentage = 70;
  }
  
  // Calculate commission amounts
  this.agentCommission = (this.totalAmount * this.agentCommissionPercentage) / 100;
  
  if (this.affiliateAgentId) {
    this.affiliateCommission = (this.totalAmount * this.affiliateCommissionPercentage) / 100;
  } else {
    this.affiliateCommission = 0;
  }
  
  this.adminCommission = (this.totalAmount * this.adminCommissionPercentage) / 100;
  
  // Validate that commissions add up to total amount
  const totalCommissions = this.agentCommission + this.affiliateCommission + this.adminCommission;
  if (Math.abs(totalCommissions - this.totalAmount) > 0.01) {
    console.warn(`Warning: Commission amounts don't match total: ${totalCommissions} vs ${this.totalAmount}`);
  }
  
  next();
});

// Indexes for better query performance
earningsSchema.index({ userId: 1, transactionDate: -1 });
earningsSchema.index({ agentId: 1, transactionDate: -1 });
earningsSchema.index({ affiliateAgentId: 1, transactionDate: -1 });
earningsSchema.index({ transactionDate: -1 });
earningsSchema.index({ paymentStatus: 1 });
earningsSchema.index({ transactionId: 1 });

// Static methods for earnings aggregation
earningsSchema.statics.getAgentEarnings = function(agentId, startDate, endDate) {
  const match = { agentId: new mongoose.Types.ObjectId(agentId) };
  if (startDate || endDate) {
    match.transactionDate = {};
    if (startDate) match.transactionDate.$gte = new Date(startDate);
    if (endDate) match.transactionDate.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$agentCommission' },
        totalTransactions: { $sum: 1 },
        totalCoinsUsed: { $sum: '$coinsUsed' },
        averagePerTransaction: { $avg: '$agentCommission' }
      }
    }
  ]);
};

earningsSchema.statics.getAffiliateEarnings = function(affiliateAgentId, startDate, endDate) {
  const match = { affiliateAgentId: new mongoose.Types.ObjectId(affiliateAgentId) };
  if (startDate || endDate) {
    match.transactionDate = {};
    if (startDate) match.transactionDate.$gte = new Date(startDate);
    if (endDate) match.transactionDate.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$affiliateCommission' },
        totalTransactions: { $sum: 1 },
        totalCoinsUsed: { $sum: '$coinsUsed' },
        averagePerTransaction: { $avg: '$affiliateCommission' }
      }
    }
  ]);
};

earningsSchema.statics.getAdminEarnings = function(startDate, endDate) {
  const match = {};
  if (startDate || endDate) {
    match.transactionDate = {};
    if (startDate) match.transactionDate.$gte = new Date(startDate);
    if (endDate) match.transactionDate.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$adminCommission' },
        totalTransactions: { $sum: 1 },
        totalCoinsUsed: { $sum: '$coinsUsed' },
        averagePerTransaction: { $avg: '$adminCommission' }
      }
    }
  ]);
};

module.exports = mongoose.model('Earnings', earningsSchema);
