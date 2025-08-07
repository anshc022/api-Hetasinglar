const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  type: {
    type: String,
    enum: ['coin_package', 'subscription'],
    required: true,
    default: 'coin_package'
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  coins: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  bonusCoins: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  features: {
    type: Map,
    of: Boolean,
    default: new Map(),
    required: false
  },
  description: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamps on save
subscriptionPlanSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Validate coin package fields
subscriptionPlanSchema.pre('validate', function(next) {
  if (this.type === 'coin_package') {
    if (!this.coins) {
      this.invalidate('coins', 'Coins are required for coin packages');
    }
  }
  next();
});

// Calculate total coins (including bonus)
subscriptionPlanSchema.virtual('totalCoins').get(function() {
  return this.coins + (this.bonusCoins || 0);
});

// Get price per coin (excluding bonus coins)
subscriptionPlanSchema.virtual('pricePerCoin').get(function() {
  return this.coins > 0 ? this.price / this.coins : 0;
});

// Static method to find active coin packages
subscriptionPlanSchema.statics.findActiveCoinPackages = function() {
  return this.find({ 
    type: 'coin_package',
    isActive: true 
  }).sort('price');
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = SubscriptionPlan;