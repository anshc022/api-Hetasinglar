const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  escortId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EscortProfile',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'read', 'deleted'],
    default: 'active'
  },
  readBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  readAt: {
    type: Date
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

// Compound index to prevent duplicate likes from the same user to the same escort
likeSchema.index({ userId: 1, escortId: 1 }, { unique: true });

// Index for efficient queries
likeSchema.index({ escortId: 1, status: 1, createdAt: -1 });
likeSchema.index({ userId: 1, status: 1, createdAt: -1 });
likeSchema.index({ status: 1, createdAt: -1 });

// Update the updatedAt field on save
likeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static methods
likeSchema.statics.getLikesForEscort = function(escortId, options = {}) {
  const match = { escortId, status: options.status || 'active' };
  
  return this.find(match)
    .populate('userId', 'username profile.firstName profile.lastName profile.avatar dateOfBirth sex')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

likeSchema.statics.getLikesForUser = function(userId, options = {}) {
  const match = { userId, status: options.status || 'active' };
  
  return this.find(match)
    .populate('escortId', 'username firstName profileImage country region profession')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

likeSchema.statics.getUnreadLikesForAgent = function(agentId, options = {}) {
  // Show ALL likes to ALL agents (not filtered by escort creator)
  // This allows any agent to see likes for any escort
  return this.aggregate([
    {
      $lookup: {
        from: 'escortprofiles',
        localField: 'escortId',
        foreignField: '_id',
        as: 'escort'
      }
    },
    {
      $unwind: '$escort'
    },
    {
      $match: {
        // Removed the escort.createdBy.id filter - show all active likes
        status: 'active'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $limit: options.limit || 100
    }
  ]);
};

likeSchema.statics.markAsRead = function(likeId, agentId) {
  return this.findByIdAndUpdate(
    likeId,
    {
      status: 'read',
      readBy: agentId,
      readAt: new Date()
    },
    { new: true }
  );
};

likeSchema.statics.deleteLike = function(likeId) {
  return this.findByIdAndUpdate(
    likeId,
    { status: 'deleted' },
    { new: true }
  );
};

module.exports = mongoose.model('Like', likeSchema);