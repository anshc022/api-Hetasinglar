const mongoose = require('mongoose');

const userLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['City', 'Job', 'Family', 'Money', 'Relationship', 'Health', 'Travel', 'Other'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['Admin', 'Agent'], required: true }
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

// Update timestamp on document save
userLogSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const UserLog = mongoose.model('UserLog', userLogSchema);

module.exports = UserLog;
