const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { auth } = require('../auth');
const cache = require('../services/cache');
const WebSocket = require('ws');

// Get subscription plans
router.get('/plans', async (req, res) => {
  try {
    const { type } = req.query;
    const query = { isActive: true };
    if (type) {
      query.type = type;
    }
    const plans = await SubscriptionPlan.find(query).sort({ price: 1 });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ message: 'Failed to fetch subscription plans' });
  }
});

// Get user's subscription
router.get('/user', auth, async (req, res) => {
  try {
    // Ensure we have a valid user ID
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid user ID' });
    }

    // First check for any subscription by user ID, including expired ones
    let subscription = await Subscription.findOne({
      userId: userId,
      status: 'active'
    });

    if (subscription) {
      // Check if subscription is expired
      if (subscription.endDate <= new Date()) {
        subscription.status = 'expired';
        await subscription.save();
        subscription = null; // We'll create a new free subscription below
      } else {
        return res.json({ subscription });
      }
    }

    // If no active subscription, create or update to free plan
    try {
      // Get the free plan details
      const freePlan = await SubscriptionPlan.findOne({ name: 'free', isActive: true });
      
      if (!freePlan) {
        return res.status(404).json({ 
          message: 'No free plan available. Please contact support.',
          subscription: null
        });
      }

      // Safely convert features to object if needed
      let featuresObj;
      try {
        featuresObj = freePlan.features?.toObject?.() || freePlan.features || {};
      } catch (err) {
        console.error('Error converting features to object:', err);
        featuresObj = freePlan.features || {};
      }

      // Find existing subscription to update, or create new one
      const existingSubscription = await Subscription.findOne({ userId: userId });
      
      if (existingSubscription) {
        // Update existing subscription
        existingSubscription.type = 'free';
        existingSubscription.price = 0;
        existingSubscription.status = 'active';
        existingSubscription.messagesAllowed = featuresObj.messages || 8;
        existingSubscription.messagesRemaining = featuresObj.messages || 8;
        existingSubscription.startDate = new Date();
        existingSubscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        existingSubscription.features = new Map(Object.entries(featuresObj));
        
        await existingSubscription.save();
        subscription = existingSubscription;
      } else {
        // Create new subscription
        const newSubscription = new Subscription({
          userId: userId,
          type: 'free',
          price: 0,
          status: 'active',
          messagesAllowed: featuresObj.messages || 8,
          messagesRemaining: featuresObj.messages || 8,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          features: new Map(Object.entries(featuresObj))
        });

        await newSubscription.save();
        subscription = newSubscription;
      }

      // Update user's subscription reference
      await User.findByIdAndUpdate(userId, { subscription: subscription._id });

      return res.json({ subscription });
    } catch (createError) {
      console.error('Error creating/updating free subscription:', createError);
      return res.status(500).json({ 
        message: 'Failed to create/update free subscription',
        error: createError.message 
      });
    }
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ 
      message: 'Failed to fetch subscription',
      error: error.message
    });
  }
});

// Purchase subscription
router.post('/purchase', auth, async (req, res) => {
  try {
    const { planType } = req.body;

    // Ensure req.user is populated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get plan details from the database
    const plan = await SubscriptionPlan.findOne({ name: planType, isActive: true });
    if (!plan) {
      return res.status(400).json({ message: 'Invalid or inactive plan type' });
    }

    // Cancel any existing active subscription
    await Subscription.updateMany(
      { 
        userId: user._id, 
        status: 'active',
        endDate: { $gt: new Date() }
      },
      { $set: { status: 'cancelled' } }
    );    // Create new subscription with credits
    const featuresObj = plan.features.toObject ? plan.features.toObject() : plan.features;
    const creditsAmount = featuresObj.credits || featuresObj.messages; // Use credits if available, fallback to messages
    
    const subscription = new Subscription({
      userId: user._id,
      type: planType,
      price: plan.price,
      messagesAllowed: creditsAmount,
      messagesRemaining: creditsAmount,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      features: new Map(Object.entries(featuresObj))
    });

    await subscription.save();

    // Update user's active subscription and credits
    user.subscription = subscription._id;
    user.credits.balance = creditsAmount; // Sync credits with subscription
    await user.save();

    // Send WebSocket notification to admin dashboard
    const wss = req.app.get('wss');
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.clientInfo?.role === 'admin') {
          client.send(JSON.stringify({
            type: 'subscription_update',
            data: {
              id: subscription._id,
              username: user.username,
              email: user.email,
              plan: planType,
              amount: plan.price,
              date: subscription.startDate,
              status: 'active'
            }
          }));
        }
      });
    }

    res.json({ subscription });
  } catch (error) {
    console.error('Subscription purchase error:', error);
    res.status(500).json({ message: 'Failed to process subscription purchase' });
  }
});

// Cancel subscription
router.post('/cancel', auth, async (req, res) => { // Corrected usage: use 'auth'
  try {
    const subscription = await Subscription.findOneAndUpdate(
      {
        userId: req.user._id,
        status: 'active',
        endDate: { $gt: new Date() }
      },
      { $set: { status: 'cancelled' } },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    res.json({ subscription });
  } catch (error) {
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
});

// Update message count
router.post('/update-message-count', auth, async (req, res) => { // Corrected usage: use 'auth'
  try {
    const subscription = await Subscription.findOneAndUpdate(
      {
        userId: req.user._id,
        status: 'active',
        endDate: { $gt: new Date() },
        messagesRemaining: { $gt: 0 }
      },
      { $inc: { messagesRemaining: -1 } },
      { new: true }
    );

    if (!subscription) {
      return res.status(403).json({ message: 'No active subscription with remaining messages' });
    }

    res.json({ subscription });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update message count' });
  }
});

// Purchase coin package
router.post('/purchase/coins', auth, async (req, res) => {
  try {
    const { packageId } = req.body;
    const userId = req.user.id;

    // Get the coin package
    const coinPackage = await SubscriptionPlan.findOne({
      _id: packageId,
      type: 'coin_package',
      isActive: true
    });

    if (!coinPackage) {
      return res.status(404).json({ message: 'Coin package not found' });
    }

    // Get the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Add coins to user's balance
    const totalCoins = coinPackage.coins + coinPackage.bonusCoins;
    user.coins.balance += totalCoins;
    user.coins.totalPurchased += totalCoins;
    user.coins.lastPurchaseDate = new Date();

    // Add purchase to history
    user.coins.purchaseHistory.push({
      date: new Date(),
      amount: totalCoins,
      packageId: coinPackage._id,
      price: coinPackage.price,
      bonusAmount: coinPackage.bonusCoins
    });

    await user.save();

    res.json({
      message: 'Coin package purchased successfully',
      newBalance: user.coins.balance,
      purchased: totalCoins
    });

  } catch (error) {
    console.error('Error purchasing coin package:', error);
    res.status(500).json({ message: 'Failed to purchase coin package' });
  }
});

// Get user's coin balance
router.get('/coins/balance', auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });

    const cacheKey = `coins:balance:${userId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const etagCached = require('crypto').createHash('md5').update(JSON.stringify(cached)).digest('hex');
      res.set('ETag', etagCached);
      if (req.headers['if-none-match'] === etagCached) return res.status(304).end();
      return res.json(cached);
    }

    const user = await User.findById(userId)
      .select('coins.balance coins.totalPurchased coins.totalUsed coins.lastPurchaseDate coins.lastUsageDate')
      .lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const payload = {
      balance: user.coins?.balance || 0,
      totalPurchased: user.coins?.totalPurchased || 0,
      totalUsed: user.coins?.totalUsed || 0,
      lastPurchase: user.coins?.lastPurchaseDate || null,
      lastUsage: user.coins?.lastUsageDate || null
    };

    // Short TTL to keep it fresh but reduce DB hits
    cache.set(cacheKey, payload, 30 * 1000);

    const etag = require('crypto').createHash('md5').update(JSON.stringify(payload)).digest('hex');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(payload);
  } catch (error) {
    console.error('Error fetching coin balance:', error);
    res.status(500).json({ message: 'Failed to fetch coin balance' });
  }
});

module.exports = router;