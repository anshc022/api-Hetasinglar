const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  emailOTP: String,
  emailOTPExpires: Date,
  // Password reset fields
  passwordResetToken: String,
  passwordResetExpires: Date,
  full_name: {
    type: String,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date
  },
  sex: {
    type: String,
    enum: ['male', 'female']
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  
  // Affiliate tracking
  affiliateAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  referral: {
    affiliateCode: String,
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent'
    },
    referredAt: Date
  },
  referralCode: String, // Keep for backward compatibility
  registrationSource: {
    type: String,
    enum: ['direct', 'affiliate', 'referral', 'social', 'ads'],
    default: 'direct'
  },
  registrationDomain: String, // Track which domain/platform user registered from
  
  // Credits system
  credits: {
    balance: { type: Number, default: 0, min: 0 },
    totalPurchased: { type: Number, default: 0, min: 0 },
    totalUsed: { type: Number, default: 0, min: 0 },
    lastPurchaseDate: Date,
    lastUsageDate: Date
  },

  // Coins system
  coins: {
    balance: { type: Number, default: 0, min: 0 },
    totalPurchased: { type: Number, default: 0, min: 0 },
    totalUsed: { type: Number, default: 0, min: 0 },
    // Track free/awarded coins separate from purchased
    lastAwardDate: Date,
    awardHistory: [{
      date: { type: Date, default: Date.now },
      amount: { type: Number, required: true },
      type: { type: String, enum: ['welcome', 'promo', 'manual'], default: 'manual' },
      note: { type: String, default: '' }
    }],
    welcomeBonusGranted: { type: Boolean, default: false },
    purchaseHistory: [{
      date: { type: Date, default: Date.now },
      amount: { type: Number, required: true },
      packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
      price: { type: Number, required: true },
      bonusAmount: { type: Number, default: 0 }
    }],
    usageHistory: [{
      date: { type: Date, default: Date.now },
      amount: { type: Number, required: true },
      chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
  // Voice removed; legacy usageHistory entries allowed through route coercion
  messageType: { type: String, enum: ['text', 'image'], default: 'text' }
    }],
    lastPurchaseDate: Date,
    lastUsageDate: Date
  },
  
  // User status and activity
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'banned'],
    default: 'active'
  },
  lastActiveDate: Date,
  
  // User preferences
  preferences: {
    notifications: { type: Boolean, default: true },
    emailUpdates: { type: Boolean, default: true },
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
    // Granular notification settings (backward compatible)
    notificationSettings: {
      email: {
        messages: {
          enabled: { type: Boolean, default: true },
          // Only send if user has been offline for at least N minutes (0 = always)
          onlyWhenOfflineMinutes: { type: Number, default: 10, min: 0 },
          // Optional per-escort overrides
          perEscort: [{
            escortId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscortProfile' },
            enabled: { type: Boolean, default: true }
          }]
        }
      }
    }
  },
  
  // Profile information
  profile: {
    firstName: String,
    lastName: String,
    phoneNumber: String,
    country: String,
    city: String,
    region: String,
    description: {
      type: String,
      maxlength: 2000
    },
    avatar: String
  },

  legal: {
    policyAcceptedAt: Date,
    policyVersion: {
      type: String,
      default: 'current'
    }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index to speed up new-customer queries (status + createdAt)
userSchema.index({ status: 1, createdAt: -1 });

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Credit management methods
userSchema.methods.addCredits = function(amount, purchaseData = {}) {
  this.credits.balance += amount;
  this.credits.totalPurchased += amount;
  this.credits.lastPurchaseDate = new Date();
  
  return this.save();
};

userSchema.methods.useCredits = function(amount) {
  if (this.credits.balance < amount) {
    throw new Error('Insufficient credits');
  }
  
  this.credits.balance -= amount;
  this.credits.totalUsed += amount;
  this.credits.lastUsageDate = new Date();
  this.lastActiveDate = new Date();
  
  return this.save();
};

userSchema.methods.getCreditsBalance = function() {
  return this.credits.balance;
};

// Coin management methods
userSchema.methods.addCoins = function(amount, purchaseData = {}) {
  this.coins.balance += amount;
  this.coins.totalPurchased += amount;
  this.coins.lastPurchaseDate = new Date();
  
  if (purchaseData.packageId || purchaseData.price) {
    this.coins.purchaseHistory.push({
      amount,
      packageId: purchaseData.packageId,
      price: purchaseData.price || 0,
      bonusAmount: purchaseData.bonusAmount || 0
    });
  }
  
  return this.save();
};

userSchema.methods.useCoins = function(amount, usageData = {}) {
  if (this.coins.balance < amount) {
    throw new Error('Insufficient coins');
  }
  
  this.coins.balance -= amount;
  this.coins.totalUsed += amount;
  this.coins.lastUsageDate = new Date();
  this.lastActiveDate = new Date();
  
  if (usageData.chatId || usageData.messageType) {
    this.coins.usageHistory.push({
      amount,
      chatId: usageData.chatId,
      messageType: usageData.messageType || 'text'
    });
  }
  
  return this.save();
};

userSchema.methods.getCoinsBalance = function() {
  return this.coins.balance;
};

// Grant free coins (does not impact totalPurchased)
userSchema.methods.grantFreeCoins = async function(amount, meta = {}) {
  const amt = Math.max(0, parseInt(amount || 0, 10));
  if (!amt) return false;
  this.coins.balance = (this.coins.balance || 0) + amt;
  this.coins.lastAwardDate = new Date();
  // Record in award history
  if (!Array.isArray(this.coins.awardHistory)) this.coins.awardHistory = [];
  this.coins.awardHistory.push({
    amount: amt,
    type: meta.type || 'manual',
    note: meta.note || ''
  });
  await this.save();
  return true;
};

// Grant 5-coin welcome bonus exactly once
userSchema.methods.grantWelcomeBonus = async function(amount = 5) {
  try {
    if (this.coins?.welcomeBonusGranted) return false;
    const granted = await this.grantFreeCoins(amount, { type: 'welcome', note: 'Welcome bonus' });
    this.coins.welcomeBonusGranted = true;
    await this.save();
    return granted;
  } catch (e) {
    console.warn('Failed to grant welcome bonus:', e.message || e);
    return false;
  }
};

// Sync credits with subscription
userSchema.methods.syncCreditsWithSubscription = async function() {
  try {
    const Subscription = require('./Subscription');
    const subscription = await Subscription.findOne({ 
      userId: this._id, 
      status: 'active',
      endDate: { $gt: new Date() }
    });
    
    if (subscription) {
      // Sync credits with subscription remaining messages
      this.credits.balance = subscription.messagesRemaining;
      await this.save();
    }
  } catch (error) {
    console.error('Error syncing credits with subscription:', error);
  }
};

// Override useCredits to also update subscription
userSchema.methods.useCredits = async function(amount) {
  if (this.credits.balance < amount) {
    throw new Error('Insufficient credits');
  }
  
  this.credits.balance -= amount;
  this.credits.totalUsed += amount;
  this.credits.lastUsageDate = new Date();
  this.lastActiveDate = new Date();
  
  // Also update subscription if exists
  const Subscription = require('./Subscription');
  const subscription = await Subscription.findOne({ 
    userId: this._id, 
    status: 'active',
    endDate: { $gt: new Date() }
  });
  
  if (subscription && subscription.messagesRemaining > 0) {
    subscription.messagesRemaining -= amount;
    await subscription.save();
  }
  
  return this.save();
};

// Static methods
userSchema.statics.findByAffiliateAgent = function(affiliateAgentId) {
  return this.find({ affiliateAgent: affiliateAgentId, status: 'active' });
};

module.exports = mongoose.model('User', userSchema);
