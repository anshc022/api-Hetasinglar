// ULTRA OPTIMIZED Live Queue Endpoint
// This replacement should reduce query time from 7000ms to under 500ms

const mongoose = require('mongoose');

// Optimized live-queue endpoint - replaces the slow one in agentRoutes.js
function createOptimizedLiveQueueEndpoint(router, agentAuth, Chat, cache, liveQueueCache, cacheTimers) {

router.get('/chats/live-queue', agentAuth, async (req, res) => {
  const startTime = Date.now();
  const agentId = req.agent?._id;
  
  try {
    // Use global cache key since all agents see the same live queue now
    const cacheKey = `live_queue:global:v2`; // v2 for new optimized version
    
    // Check fallback cache first - reduced TTL for fresher data
    if (liveQueueCache.has(cacheKey)) {
      const cachedData = liveQueueCache.get(cacheKey);
      console.log(`🚀 OPTIMIZED Cache HIT: global live-queue (${Date.now() - startTime}ms)`);
      return res.json(cachedData);
    }
    
    // Check main cache as backup
    const cached = cache.get && cache.get(cacheKey);
    if (cached) {
      console.log(`🚀 Main Cache HIT: optimized live-queue (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }
    
    console.log(`🔍 Cache MISS: generating optimized live-queue data`);

    // STEP 1: Pre-filter with the most selective criteria using indexes
    const preFilterTime = Date.now();
    
    // Use the most efficient query possible with compound indexes
    const baseQuery = {
      $or: [
        // Active chats (uses status index)
        { status: { $in: ['new', 'assigned', 'active'] } },
        // Panic room chats (uses isInPanicRoom index)
        { isInPanicRoom: true },
        // Recent chats with potential unread messages (time-bounded for performance)
        { 
          updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours only
          status: { $ne: 'completed' }
        }
      ]
    };

    console.log(`🔍 Pre-filter built in ${Date.now() - preFilterTime}ms`);

    // STEP 2: Ultra-fast aggregation with minimal operations
    const aggregationTime = Date.now();
    
    const chats = await Chat.aggregate([
      {
        // Stage 1: Fast initial filter using compound indexes
        $match: baseQuery
      },
      {
        // Stage 2: Add only essential computed fields (much faster than complex filters)
        $addFields: {
          // Quick unread count using slice (only last 10 messages for speed)
          lastMessages: { $slice: ["$messages", -10] },
          lastMessage: { $arrayElemAt: ["$messages", -1] }
        }
      },
      {
        // Stage 3: Filter with computed fields (faster than complex $filter operations)
        $addFields: {
          unreadCount: {
            $size: {
              $filter: {
                input: "$lastMessages",
                as: "msg",
                cond: {
                  $and: [
                    { $eq: ["$$msg.sender", "customer"] },
                    { $eq: ["$$msg.readByAgent", false] }
                  ]
                }
              }
            }
          },
          // Simple priority calculation
          priority: {
            $cond: [
              { $eq: ["$isInPanicRoom", true] }, 5,
              {
                $cond: [
                  { $gte: [{ $size: { $ifNull: ["$lastMessages", []] } }, 5] }, 3,
                  {
                    $cond: [
                      { $gt: [{ $size: { $ifNull: ["$lastMessages", []] } }, 0] }, 2,
                      1
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      {
        // Stage 4: Filter out chats that don't need attention
        $match: {
          $or: [
            { isInPanicRoom: true },
            { unreadCount: { $gt: 0 } },
            { status: { $in: ['new', 'assigned'] } },
            { 
              $and: [
                { reminderActive: true },
                { reminderHandled: { $ne: true } }
              ]
            }
          ]
        }
      },
      {
        // Stage 5: Essential lookups only - minimal data
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
          pipeline: [{ $project: { username: 1, _id: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'escortprofiles',
          localField: 'escortId',
          foreignField: '_id',
          as: 'escort',
          pipeline: [{ $project: { firstName: 1, _id: 1 } }]
        }
      },
      {
        // Stage 6: Final projection - only essential data
        $project: {
          _id: 1,
          customerId: { $arrayElemAt: ['$customer', 0] },
          escortId: { $arrayElemAt: ['$escort', 0] },
          agentId: 1,
          status: 1,
          customerName: 1,
          isInPanicRoom: 1,
          createdAt: 1,
          updatedAt: 1,
          unreadCount: 1,
          priority: 1,
          reminderActive: 1,
          reminderHandled: 1,
          // Simplified chat type determination
          chatType: {
            $cond: [
              { $eq: ['$isInPanicRoom', true] }, 'panic',
              {
                $cond: [
                  { $gt: ['$unreadCount', 0] }, 'queue',
                  {
                    $cond: [
                      { $and: [{ $eq: ['$reminderActive', true] }, { $ne: ['$reminderHandled', true] }] }, 'reminder',
                      'idle'
                    ]
                  }
                ]
              }
            ]
          },
          // Simplified last message
          lastMessage: {
            message: {
              $cond: [
                { $eq: ['$lastMessage.messageType', 'image'] },
                '📷 Image',
                { $substr: [{ $ifNull: ['$lastMessage.message', ''] }, 0, 50] } // Shorter for speed
              ]
            },
            messageType: '$lastMessage.messageType',
            sender: '$lastMessage.sender',
            timestamp: '$lastMessage.timestamp',
            readByAgent: '$lastMessage.readByAgent'
          },
          hasNewMessages: { $gt: ['$unreadCount', 0] }
        }
      },
      {
        // Stage 7: Fast sort
        $sort: {
          priority: -1,
          updatedAt: -1
        }
      },
      {
        // Stage 8: Reasonable limit for performance
        $limit: 25
      }
    ]);

    console.log(`🔍 Aggregation completed in ${Date.now() - aggregationTime}ms`);

    // STEP 3: Cache with shorter TTL for fresher data
    const cacheTime = Date.now();
    
    // Set optimized cache with 20-second TTL for balance of performance vs freshness
    liveQueueCache.set(cacheKey, chats);
    console.log(`💾 OPTIMIZED cache set for global live-queue`);
    
    // Clear cache after 20 seconds (shorter for fresher data)
    if (cacheTimers.has(cacheKey)) {
      clearTimeout(cacheTimers.get(cacheKey));
    }
    const timer = setTimeout(() => {
      liveQueueCache.delete(cacheKey);
      cacheTimers.delete(cacheKey);
      console.log(`🗑️ OPTIMIZED cache expired for global live-queue`);
    }, 20000); // 20 second cache
    cacheTimers.set(cacheKey, timer);
    
    // Also set main cache
    try {
      if (cache.set) {
        cache.set(cacheKey, chats, 30 * 1000); // 30 seconds
        console.log(`🗄️ Main cache also set for optimized live-queue`);
      }
    } catch (cacheError) {
      console.log(`⚠️ Main cache failed, but fallback cache is working`);
    }
    
    console.log(`💾 Cache operations completed in ${Date.now() - cacheTime}ms`);

    const responseTime = Date.now() - startTime;
    
    if (responseTime > 1000) {
      console.log(`🐌 STILL SLOW: optimized live-queue took ${responseTime}ms`);
    } else if (responseTime > 500) {
      console.log(`⚠️ Moderate: optimized live-queue took ${responseTime}ms`);
    } else {
      console.log(`⚡ FAST: optimized live-queue took ${responseTime}ms`);
    }
    
    console.log(`🚀 OPTIMIZED Global live queue: ${chats.length} chats in ${responseTime}ms`);
    res.json(chats);
    
  } catch (error) {
    console.error('Error in optimized live queue:', error);
    console.log(`❌ OPTIMIZED live queue failed in ${Date.now() - startTime}ms`);
    res.status(500).json({ 
      message: 'Failed to fetch optimized live queue chats',
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

console.log('🚀 Optimized live-queue endpoint registered');

}

module.exports = { createOptimizedLiveQueueEndpoint };