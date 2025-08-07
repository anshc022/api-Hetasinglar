const mongoose = require('mongoose');

const escortProfileSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  firstName: String,
  gender: { type: String, enum: ['male', 'female'] },
  profileImage: String,
  country: String,
  region: String,
  relationshipStatus: String,
  interests: [String],
  profession: String,
  height: Number,
  dateOfBirth: Date,
  serialNumber: { type: String, unique: true },
  status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'active' },
  massMailActive: { type: Boolean, default: false },
  createdBy: { 
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    type: { type: String, default: 'Agent' }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EscortProfile', escortProfileSchema);
