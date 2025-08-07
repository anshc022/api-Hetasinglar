const mongoose = require('mongoose');

const affiliateLinkSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    unique: true
  },
  affiliateCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  clickCount: {
    type: Number,
    default: 0
  },
  registrationCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
affiliateLinkSchema.index({ agentId: 1 });
affiliateLinkSchema.index({ affiliateCode: 1 });
affiliateLinkSchema.index({ isActive: 1 });

// Method to increment click count
affiliateLinkSchema.methods.incrementClick = function() {
  this.clickCount = (this.clickCount || 0) + 1;
  this.lastUsed = new Date();
  return this.save();
};

// Method to increment registration count
affiliateLinkSchema.methods.incrementRegistration = function() {
  this.registrationCount = (this.registrationCount || 0) + 1;
  return this.save();
};

// Static method to get affiliate link by code
affiliateLinkSchema.statics.findByCode = function(affiliateCode) {
  return this.findOne({ affiliateCode, isActive: true });
};

// Static method to get agent's affiliate link
affiliateLinkSchema.statics.getAgentLink = function(agentId) {
  return this.findOne({ agentId });
};

const AffiliateLink = mongoose.model('AffiliateLink', affiliateLinkSchema);

module.exports = AffiliateLink;
