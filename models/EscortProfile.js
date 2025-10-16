const mongoose = require('mongoose');
const { SWEDISH_REGIONS } = require('../constants/swedishRegions');
const { RELATIONSHIP_STATUSES } = require('../constants/relationshipStatuses');

const escortProfileSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  firstName: String,
  gender: { type: String, enum: ['male', 'female'] },
  profileImage: String,
  country: { type: String, default: 'Sweden' },
  region: { type: String, enum: SWEDISH_REGIONS, required: true },
  relationshipStatus: { type: String, enum: RELATIONSHIP_STATUSES },
  interests: [String],
  profession: String,
  height: Number,
  dateOfBirth: Date,
  description: { type: String, maxlength: 1000 }, // Personal information about the escort
  serialNumber: { type: String, unique: true },
  status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'active' },
  massMailActive: { type: Boolean, default: false },
  createdBy: { 
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    type: { type: String, default: 'Agent' }
  },
  createdAt: { type: Date, default: Date.now }
});

// Performance indexes for common queries:
// 1) Active escorts ordered by recency
escortProfileSchema.index({ status: 1, createdAt: -1 });
// 2) Active by gender ordered by recency
escortProfileSchema.index({ status: 1, gender: 1, createdAt: -1 });
// 3) Active by country/region ordered by recency
escortProfileSchema.index({ status: 1, country: 1, region: 1, createdAt: -1 });

module.exports = mongoose.model('EscortProfile', escortProfileSchema);
