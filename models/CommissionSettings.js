const mongoose = require('mongoose');

const CommissionSettingsSchema = new mongoose.Schema(
  {
    defaultAdminPercentage: { type: Number, required: true, min: 0, max: 100, default: 50 },
    defaultAgentPercentage: { type: Number, required: true, min: 0, max: 100, default: 30 },
    defaultAffiliatePercentage: { type: Number, required: true, min: 0, max: 100, default: 20 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CommissionSettings', CommissionSettingsSchema);
