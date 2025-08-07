const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['free', 'basic', 'premium', 'gold'],
    default: 'free',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  messagesAllowed: {
    type: Number,
    required: true
  },
  messagesRemaining: {
    type: Number,
    required: true
  },
  features: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  paymentId: String,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update lastUpdated timestamp before save
subscriptionSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Method to sync credits with user account
subscriptionSchema.methods.syncCreditsWithUser = async function() {
  try {
    const User = require('./User');
    const user = await User.findById(this.userId);
    if (user) {
      // Update user credits to match subscription remaining messages
      user.credits = this.messagesRemaining;
      await user.save();
    }
  } catch (error) {
    console.error('Error syncing credits with user:', error);
  }
};

// Method to consume credits
subscriptionSchema.methods.consumeCredit = async function() {
  if (this.messagesRemaining > 0) {
    this.messagesRemaining -= 1;
    await this.save();
    
    // Sync with user credits
    await this.syncCreditsWithUser();
    return true;
  }
  return false;
};

// Static method to create subscription and sync credits
subscriptionSchema.statics.createWithCredits = async function(subscriptionData) {
  try {
    const User = require('./User');
    const SubscriptionPlan = require('./SubscriptionPlan');
    
    // Get the subscription plan
    const plan = await SubscriptionPlan.findOne({ name: subscriptionData.type });
    if (!plan) {
      throw new Error('Subscription plan not found');
    }
    
    // Create subscription with credits from plan
    const subscription = new this({
      ...subscriptionData,
      messagesAllowed: plan.features.credits || plan.features.messages,
      messagesRemaining: plan.features.credits || plan.features.messages
    });
    
    await subscription.save();
    
    // Update user credits
    const user = await User.findById(subscriptionData.userId);
    if (user) {
      user.credits = subscription.messagesRemaining;
      user.subscription = subscription._id;
      await user.save();
    }
    
    return subscription;
  } catch (error) {
    console.error('Error creating subscription with credits:', error);
    throw error;
  }
};

// Add indexes for common queries
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ type: 1 });
subscriptionSchema.index({ endDate: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;