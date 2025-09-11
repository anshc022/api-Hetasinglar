const express = require('express');
const router = express.Router();
const Like = require('../models/Like');
const EscortProfile = require('../models/EscortProfile');
const User = require('../models/User');
const { auth, agentAuth } = require('../auth');

// User Routes - Like an escort profile
router.post('/escort/:escortId', auth, async (req, res) => {
  try {
    const { escortId } = req.params;
    const userId = req.user.id;

    // Check if escort profile exists
    const escort = await EscortProfile.findById(escortId);
    if (!escort) {
      return res.status(404).json({ message: 'Escort profile not found' });
    }

    // Check if user already liked this escort
    const existingLike = await Like.findOne({ 
      userId, 
      escortId,
      status: { $ne: 'deleted' }
    });

    if (existingLike) {
      if (existingLike.status === 'active') {
        return res.status(400).json({ message: 'You have already liked this profile' });
      } else {
        // Reactivate the like if it was previously read
        existingLike.status = 'active';
        existingLike.readBy = undefined;
        existingLike.readAt = undefined;
        await existingLike.save();
        
        return res.json({
          message: 'Profile liked successfully',
          like: existingLike
        });
      }
    }

    // Create new like
    const like = new Like({
      userId,
      escortId
    });

    try {
      await like.save();
    } catch (error) {
      // Handle duplicate key error
      if (error.code === 11000) {
        // Check if the like exists and return appropriate response
        const existingLike = await Like.findOne({ 
          userId, 
          escortId,
          status: { $ne: 'deleted' }
        });
        
        if (existingLike) {
          return res.status(400).json({ 
            message: 'You have already liked this profile',
            like: existingLike
          });
        }
      }
      throw error; // Re-throw if it's not a duplicate key error
    }

    // Populate the like with user and escort data
    const populatedLike = await Like.findById(like._id)
      .populate('userId', 'username profile.firstName profile.lastName profile.avatar')
      .populate('escortId', 'username firstName profileImage');

    // Broadcast like notification to relevant agents via WebSocket
    const wss = req.app.locals.wss;
    if (wss) {
      const notification = {
        type: 'new_like',
        data: {
          likeId: like._id,
          userId: userId,
          escortId: escortId,
          userName: populatedLike.userId.username,
          escortName: populatedLike.escortId.firstName || populatedLike.escortId.username,
          timestamp: like.createdAt
        }
      };

      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.clientInfo?.role === 'agent') {
          try {
            client.send(JSON.stringify(notification));
          } catch (error) {
            console.error('Error sending like notification:', error);
          }
        }
      });
    }

    res.json({
      message: 'Profile liked successfully',
      like: populatedLike
    });
  } catch (error) {
    console.error('Error liking profile:', error);
    res.status(500).json({ message: 'Failed to like profile' });
  }
});

// User Routes - Unlike an escort profile
router.delete('/escort/:escortId', auth, async (req, res) => {
  try {
    const { escortId } = req.params;
    const userId = req.user.id;

    const like = await Like.findOneAndUpdate(
      { userId, escortId, status: { $ne: 'deleted' } },
      { status: 'deleted' },
      { new: true }
    );

    if (!like) {
      return res.status(404).json({ message: 'Like not found' });
    }

    res.json({
      message: 'Profile unliked successfully',
      like
    });
  } catch (error) {
    console.error('Error unliking profile:', error);
    res.status(500).json({ message: 'Failed to unlike profile' });
  }
});

// User Routes - Get user's liked profiles
router.get('/user/my-likes', auth, async (req, res) => {
  console.log('📝 GET /user/my-likes endpoint hit by user:', req.user?.id);
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const likes = await Like.find({ 
      userId, 
      status: 'active' 
    })
    .populate('escortId', 'username firstName profileImage country region profession dateOfBirth gender')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Like.countDocuments({ userId, status: 'active' });

    res.json({
      likes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalLikes: total,
        hasMore: skip + likes.length < total
      }
    });
  } catch (error) {
    console.error('Error fetching user likes:', error);
    res.status(500).json({ message: 'Failed to fetch liked profiles' });
  }
});

// Agent Routes - Get likes for agent's escorts (Live Dashboard)
router.get('/agent/live-likes', agentAuth, async (req, res) => {
  try {
    if (!req.agent) {
      return res.status(401).json({ message: 'Agent authentication required' });
    }

    const agentId = req.agent._id;
    const status = req.query.status || 'active';
    const limit = parseInt(req.query.limit) || 50;

    const likes = await Like.getUnreadLikesForAgent(agentId, { limit });

    // Format for agent dashboard
    const formattedLikes = likes.map(like => ({
      _id: like._id,
      userId: like.user._id,
      userName: like.user.username,
      userFullName: `${like.user.profile?.firstName || ''} ${like.user.profile?.lastName || ''}`.trim(),
      userAvatar: like.user.profile?.avatar,
      escortId: like.escort._id,
      escortName: like.escort.firstName || like.escort.username,
      escortImage: like.escort.profileImage,
      likedAt: like.createdAt,
      status: like.status,
      readAt: like.readAt,
      readBy: like.readBy
    }));

    res.json({
      likes: formattedLikes,
      total: formattedLikes.length
    });
  } catch (error) {
    console.error('Error fetching agent likes:', error);
    res.status(500).json({ message: 'Failed to fetch likes' });
  }
});

// Agent Routes - Mark like as read
router.patch('/:likeId/read', agentAuth, async (req, res) => {
  try {
    const { likeId } = req.params;
    const agentId = req.agent._id;

    const like = await Like.markAsRead(likeId, agentId);
    
    if (!like) {
      return res.status(404).json({ message: 'Like not found' });
    }

    res.json({
      message: 'Like marked as read',
      like
    });
  } catch (error) {
    console.error('Error marking like as read:', error);
    res.status(500).json({ message: 'Failed to mark like as read' });
  }
});

// Agent Routes - Delete like entry
router.delete('/:likeId', agentAuth, async (req, res) => {
  try {
    const { likeId } = req.params;

    const like = await Like.deleteLike(likeId);
    
    if (!like) {
      return res.status(404).json({ message: 'Like not found' });
    }

    res.json({
      message: 'Like entry deleted',
      like
    });
  } catch (error) {
    console.error('Error deleting like:', error);
    res.status(500).json({ message: 'Failed to delete like' });
  }
});

// Agent Routes - Start chat with user who liked escort
router.post('/:likeId/start-chat', agentAuth, async (req, res) => {
  try {
    const { likeId } = req.params;
    
    const like = await Like.findById(likeId)
      .populate('userId')
      .populate('escortId');

    if (!like) {
      return res.status(404).json({ message: 'Like not found' });
    }

    // Check if chat already exists
    const Chat = require('../models/Chat');
    let existingChat = await Chat.findOne({
      customerId: like.userId._id,
      escortId: like.escortId._id,
      status: { $ne: 'closed' }
    });

    if (existingChat) {
      return res.json({
        message: 'Chat already exists',
        chatId: existingChat._id,
        existing: true
      });
    }

    // Create new chat
    const newChat = new Chat({
      customerId: like.userId._id,
      escortId: like.escortId._id,
      agentId: req.agent._id,
      status: 'assigned',
      isFirstContact: false,
      customerName: like.userId.username,
      messages: []
    });

    await newChat.save();

    res.json({
      message: 'Chat started successfully',
      chatId: newChat._id,
      existing: false
    });
  } catch (error) {
    console.error('Error starting chat from like:', error);
    res.status(500).json({ message: 'Failed to start chat' });
  }
});

// Escort Routes - Get users who liked this escort's profile
router.get('/escort/:escortId/likes', agentAuth, async (req, res) => {
  try {
    const { escortId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Verify the agent owns this escort
    const escort = await EscortProfile.findById(escortId);
    if (!escort || escort.createdBy.id.toString() !== req.agent._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this escort profile' });
    }

    const likes = await Like.find({ 
      escortId, 
      status: { $ne: 'deleted' }
    })
    .populate('userId', 'username profile.firstName profile.lastName profile.avatar dateOfBirth sex')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Like.countDocuments({ escortId, status: { $ne: 'deleted' } });

    res.json({
      likes,
      escort: {
        id: escort._id,
        name: escort.firstName || escort.username,
        image: escort.profileImage
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalLikes: total,
        hasMore: skip + likes.length < total
      }
    });
  } catch (error) {
    console.error('Error fetching escort likes:', error);
    res.status(500).json({ message: 'Failed to fetch likes for escort' });
  }
});

// Check if user has liked a specific escort
router.get('/check/:escortId', auth, async (req, res) => {
  try {
    const { escortId } = req.params;
    const userId = req.user.id;

    const like = await Like.findOne({
      userId,
      escortId,
      status: 'active'
    });

    res.json({
      isLiked: !!like,
      like: like || null
    });
  } catch (error) {
    console.error('Error checking like status:', error);
    res.status(500).json({ message: 'Failed to check like status' });
  }
});

module.exports = router;
