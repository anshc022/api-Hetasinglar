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
  // Use a plain object for default to avoid Map default pitfalls in Mongoose
  default: {},
    required: false
  },
  description: {
    type: String,
  // Only required for subscription-type plans; coin packages can auto-fill
  required: function() { return this.type === 'subscription'; }
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
  // Basic price check
  if (this.price == null || this.price <= 0) {
    this.invalidate('price', 'Price must be greater than 0');
  }

  if (this.type === 'coin_package') {
    // For coin packages, coins must be provided and > 0
    if (this.coins == null || this.coins <= 0) {
      this.invalidate('coins', 'Coins are required and must be greater than 0 for coin packages');
    }

    // Auto-generate a description if not provided
    if (!this.description) {
      const bonus = this.bonusCoins ? ` + ${this.bonusCoins} bonus` : '';
      this.description = `${this.coins || 0} coins${bonus}`;
    }
  }
  next();
});

// Keep updatedAt fresh on updates as well
subscriptionPlanSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
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