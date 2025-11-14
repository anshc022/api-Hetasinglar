const mongoose = require('mongoose');

const PRESET_ESCORT_LOG_CATEGORIES = [
  'City',
  'Job',
  'Family',
  'Money',
  'Relationship',
  'Health',
  'Travel',
  'Other'
];

const escortLogSchema = new mongoose.Schema({
  escortId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Escort',
    required: true
  },
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    set: value => (typeof value === 'string' ? value.trim() : value),
    validate: {
      validator(value) {
        return Boolean(value && value.trim().length);
      },
      message: 'Category is required'
    }
  },
  categoryPreset: {
    type: String,
    enum: PRESET_ESCORT_LOG_CATEGORIES,
    default: function () {
      return PRESET_ESCORT_LOG_CATEGORIES.includes(this.category) ? this.category : undefined;
    }
  },
  isCustomCategory: {
    type: Boolean,
    default: function () {
      return !PRESET_ESCORT_LOG_CATEGORIES.includes(this.category);
    }
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    id: { 
      type: mongoose.Schema.Types.ObjectId, 
      required: true,
      // Make ID conversion more flexible
      get: v => v ? v.toString() : undefined,
      set: v => v ? mongoose.Types.ObjectId(v.toString()) : undefined
    },
    type: { type: String, enum: ['Admin', 'Agent', 'User'], required: true }
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
escortLogSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  if (typeof this.category === 'string') {
    this.category = this.category.trim();
  }

  if (!this.category) {
    return next(new Error('Category is required'));
  }

  if (PRESET_ESCORT_LOG_CATEGORIES.includes(this.category)) {
    this.categoryPreset = this.category;
    this.isCustomCategory = false;
  } else {
    this.categoryPreset = undefined;
    this.isCustomCategory = true;
  }
  
  // Check if escortId and createdBy.id are valid ObjectIds
  try {
    if (this.escortId) {
      this.escortId = mongoose.Types.ObjectId(this.escortId.toString());
    }
    
    if (this.createdBy && this.createdBy.id) {
      this.createdBy.id = mongoose.Types.ObjectId(this.createdBy.id.toString());
    }
  } catch (err) {
    console.error('Invalid ObjectId in EscortLog:', err);
    return next(err);
  }
  
  next();
});

// Add debug method to check escort reference
escortLogSchema.statics.validateEscortId = async function(escortId) {
  try {
    const Escort = mongoose.model('Escort');
    const escort = await Escort.findById(escortId);
    return {
      valid: Boolean(escort),
      escort: escort ? escort._id : null
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};


const EscortLog = mongoose.model('EscortLog', escortLogSchema);

module.exports = EscortLog;
