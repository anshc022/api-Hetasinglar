const mongoose = require('mongoose');

const affiliateRegistrationSchema = new mongoose.Schema({
  affiliateAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Registration details
  registrationSource: {
    type: String,
    enum: ['referral_link', 'manual_assignment', 'import', 'api'],
    required: true
  },
  referralCode: String,
  affiliateLink: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AffiliateLink'
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive', 'suspended', 'banned'],
    default: 'active'
  },
  
  // Commission tracking
  totalCommissionEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  totalTransactions: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCreditsGenerated: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Performance metrics
  metrics: {
    conversionRate: { type: Number, default: 0, min: 0, max: 100 },
    averageOrderValue: { type: Number, default: 0, min: 0 },
    customerLifetimeValue: { type: Number, default: 0, min: 0 },
    retentionRate: { type: Number, default: 0, min: 0, max: 100 }
  },
  
  // Customer activity
  customerActivity: {
    firstPurchaseDate: Date,
    lastPurchaseDate: Date,
    totalSpent: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    lastActivityDate: Date
  },
  
  // Metadata
  tags: [String],
  notes: String,
  
  // Dates
  registrationDate: {
    type: Date,
    default: Date.now
  },
  activationDate: Date,
  suspensionDate: Date,
  
  // IP tracking (for fraud prevention)
  registrationIP: String,
  lastLoginIP: String,
  
  // Additional fields for tracking
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  }
}, {
  timestamps: true
});

// Compound indexes
affiliateRegistrationSchema.index({ affiliateAgentId: 1, customerId: 1 }, { unique: true });
affiliateRegistrationSchema.index({ affiliateAgentId: 1, status: 1 });
affiliateRegistrationSchema.index({ customerId: 1 });
affiliateRegistrationSchema.index({ registrationDate: -1 });
affiliateRegistrationSchema.index({ referralCode: 1 });
affiliateRegistrationSchema.index({ status: 1 });

// Static methods
affiliateRegistrationSchema.statics.getAffiliateCustomers = function(affiliateAgentId, options = {}) {
  const match = { affiliateAgentId };
  if (options.status) match.status = options.status;
  if (options.startDate || options.endDate) {
    match.registrationDate = {};
    if (options.startDate) match.registrationDate.$gte = new Date(options.startDate);
    if (options.endDate) match.registrationDate.$lte = new Date(options.endDate);
  }
  
  return this.find(match)
    .populate('customerId', 'username email dateOfBirth sex subscription')
    .populate('affiliateAgentId', 'agentId name')
    .sort({ registrationDate: -1 })
    .limit(options.limit || 50);
};

affiliateRegistrationSchema.statics.getAffiliateStats = function(affiliateAgentId, startDate, endDate) {
  const match = { affiliateAgentId };
  if (startDate || endDate) {
    match.registrationDate = {};
    if (startDate) match.registrationDate.$gte = new Date(startDate);
    if (endDate) match.registrationDate.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        activeCustomers: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        totalCommission: { $sum: '$totalCommissionEarned' },
        totalTransactions: { $sum: '$totalTransactions' },
        totalCredits: { $sum: '$totalCreditsGenerated' },
        averageCommissionPerCustomer: { $avg: '$totalCommissionEarned' },
        averageTransactionsPerCustomer: { $avg: '$totalTransactions' }
      }
    }
  ]);
};

affiliateRegistrationSchema.statics.registerCustomer = function(affiliateAgentId, customerId, data = {}) {
  return this.create({
    affiliateAgentId,
    customerId,
    registrationSource: data.registrationSource || 'manual_assignment',
    referralCode: data.referralCode,
    affiliateLink: data.affiliateLink,
    registrationIP: data.registrationIP,
    metadata: data.metadata || new Map(),
    notes: data.notes,
    activationDate: new Date()
  });
};

// Instance methods
affiliateRegistrationSchema.methods.updateCommission = function(amount, creditsUsed) {
  this.totalCommissionEarned += amount;
  this.totalTransactions += 1;
  this.totalCreditsGenerated += creditsUsed;
  this.customerActivity.lastPurchaseDate = new Date();
  this.customerActivity.lastActivityDate = new Date();
  this.customerActivity.totalSpent += (amount / 0.2); // Assuming 20% commission rate
  
  if (!this.customerActivity.firstPurchaseDate) {
    this.customerActivity.firstPurchaseDate = new Date();
  }
  
  return this.save();
};

affiliateRegistrationSchema.methods.updateMetrics = function() {
  // Calculate performance metrics
  const daysSinceRegistration = Math.ceil((new Date() - this.registrationDate) / (1000 * 60 * 60 * 24));
  
  if (this.totalTransactions > 0 && daysSinceRegistration > 0) {
    this.metrics.conversionRate = (this.totalTransactions / daysSinceRegistration) * 100;
    this.metrics.averageOrderValue = this.customerActivity.totalSpent / this.totalTransactions;
    this.metrics.customerLifetimeValue = this.customerActivity.totalSpent;
  }
  
  // Calculate retention rate based on recent activity
  const daysSinceLastActivity = Math.ceil((new Date() - this.customerActivity.lastActivityDate) / (1000 * 60 * 60 * 24));
  this.metrics.retentionRate = daysSinceLastActivity <= 30 ? 100 : Math.max(0, 100 - daysSinceLastActivity);
  this.customerActivity.isActive = daysSinceLastActivity <= 30;
  
  return this.save();
};

module.exports = mongoose.model('AffiliateRegistration', affiliateRegistrationSchema);
