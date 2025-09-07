const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  name: String,
  email: {
  type: String
  },
  
  // Agent type and role
  agentType: {
    type: String,
    enum: ['chat', 'affiliate', 'both'],
    default: 'chat'
  },
  role: {
    type: String,
    enum: ['agent', 'senior_agent', 'team_lead', 'manager'],
    default: 'agent'
  },
  
  // Commission settings
  commissionSettings: {
    chatCommissionPercentage: { type: Number, default: 30, min: 0, max: 100 },
    affiliateCommissionPercentage: { type: Number, default: 20, min: 0, max: 100 },
    customRatesEnabled: { type: Boolean, default: false },
    bonusThresholds: [{
      minEarnings: Number,
      bonusPercentage: Number,
      description: String
    }]
  },
  
  // Earnings tracking
  earnings: {
    totalEarnings: { type: Number, default: 0, min: 0 },
    pendingEarnings: { type: Number, default: 0, min: 0 },
    paidEarnings: { type: Number, default: 0, min: 0 },
    thisMonthEarnings: { type: Number, default: 0, min: 0 },
    lastMonthEarnings: { type: Number, default: 0, min: 0 },
    lastPayoutDate: Date,
    nextPayoutDate: Date
  },
  
  // Affiliate specific data
  affiliateData: {
    isAffiliate: { type: Boolean, default: false },
    affiliateCode: { type: String, unique: true, sparse: true },
    totalReferrals: { type: Number, default: 0 },
    activeReferrals: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 }
  },
  
  stats: {
    liveMessageCount: { type: Number, default: 0 },
    totalMessagesSent: { type: Number, default: 0 },
    activeCustomers: { type: Number, default: 0 },
    totalCustomersServed: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 }, // in minutes
    customerSatisfactionRating: { type: Number, min: 1, max: 5 },
    totalChatSessions: { type: Number, default: 0 },
    totalCreditsGenerated: { type: Number, default: 0 }
  },
  permissions: {
    canMessage: { type: Boolean, default: true },
    canModerate: { type: Boolean, default: false },
    canViewStats: { type: Boolean, default: true },
    canCreateEscorts: { type: Boolean, default: true },
    canManageAffiliates: { type: Boolean, default: false },
    canViewCommissions: { type: Boolean, default: true }
  },
  
  // Profile information
  profile: {
    firstName: String,
    lastName: String,
    phoneNumber: String,
    avatar: String,
    bio: String,
    languages: [String],
    timezone: String
  },
  
  // Account status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'banned'],
    default: 'active'
  },
  
  // Work schedule
  workSchedule: {
    timezone: String,
    availableHours: [{
      day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
      startTime: String, // HH:MM format
      endTime: String    // HH:MM format
    }],
    isAvailable: { type: Boolean, default: true }
  },
  
  lastActive: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
// Ensure unique agentId
agentSchema.index({ agentId: 1 }, { unique: true });
// Email unique sparse index is created via migration to avoid null duplicates

agentSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  
  // Generate affiliate code if agent is an affiliate and doesn't have one
  if (this.affiliateData.isAffiliate && !this.affiliateData.affiliateCode) {
    this.affiliateData.affiliateCode = this.agentId;
  }
  
  next();
});

// Instance methods
agentSchema.methods.updateEarnings = function(amount, type = 'chat') {
  this.earnings.totalEarnings += amount;
  this.earnings.pendingEarnings += amount;
  this.earnings.thisMonthEarnings += amount;
  
  if (type === 'affiliate') {
    this.affiliateData.referralEarnings += amount;
  }
  
  return this.save();
};

agentSchema.methods.processPayment = function(amount) {
  if (this.earnings.pendingEarnings < amount) {
    throw new Error('Insufficient pending earnings');
  }
  
  this.earnings.pendingEarnings -= amount;
  this.earnings.paidEarnings += amount;
  this.earnings.lastPayoutDate = new Date();
  
  return this.save();
};

agentSchema.methods.getCustomers = function() {
  const AgentCustomer = mongoose.model('AgentCustomer');
  return AgentCustomer.getAgentCustomers(this._id);
};

agentSchema.methods.getAffiliateCustomers = function() {
  const AffiliateRegistration = mongoose.model('AffiliateRegistration');
  return AffiliateRegistration.getAffiliateCustomers(this._id);
};

// Static methods
agentSchema.statics.getTopEarners = function(limit = 10) {
  return this.find({ status: 'active' })
    .sort({ 'earnings.thisMonthEarnings': -1 })
    .limit(limit)
    .select('agentId name earnings stats');
};

agentSchema.statics.getAffiliateAgents = function() {
  return this.find({ 
    'affiliateData.isAffiliate': true, 
    status: 'active' 
  }).select('agentId name affiliateData earnings');
};

module.exports = mongoose.model('Agent', agentSchema);
