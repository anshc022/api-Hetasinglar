const mongoose = require('mongoose');

const agentImageSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  escortProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EscortProfile',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  imageData: {
    type: String, // base64 encoded image
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    enum: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  size: {
    type: Number,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  description: {
    type: String,
    maxlength: 200
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  isActive: {
    type: Boolean,
    default: true
  }
});

// Index for faster queries
agentImageSchema.index({ agentId: 1, isActive: 1 });
agentImageSchema.index({ escortProfileId: 1, isActive: 1 });

module.exports = mongoose.model('AgentImage', agentImageSchema);
