const mongoose = require('mongoose');

const PRESET_USER_LOG_CATEGORIES = [
  'City',
  'Job',
  'Family',
  'Money',
  'Relationship',
  'Health',
  'Travel',
  'Other'
];

const userLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
    enum: PRESET_USER_LOG_CATEGORIES,
    default: function () {
      return PRESET_USER_LOG_CATEGORIES.includes(this.category) ? this.category : undefined;
    }
  },
  isCustomCategory: {
    type: Boolean,
    default: function () {
      return !PRESET_USER_LOG_CATEGORIES.includes(this.category);
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
      get: v => (v ? v.toString() : undefined),
      set: v => (v ? mongoose.Types.ObjectId(v.toString()) : undefined)
    },
    type: { type: String, enum: ['Admin', 'Agent'], required: true },
    name: { type: String, trim: true }
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

// Update timestamp and category metadata on document save
userLogSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  if (typeof this.category === 'string') {
    this.category = this.category.trim();
  }

  if (!this.category) {
    return next(new Error('Category is required'));
  }

  if (PRESET_USER_LOG_CATEGORIES.includes(this.category)) {
    this.categoryPreset = this.category;
    this.isCustomCategory = false;
  } else {
    this.categoryPreset = undefined;
    this.isCustomCategory = true;
  }

  try {
    if (this.userId) {
      this.userId = mongoose.Types.ObjectId(this.userId.toString());
    }

    if (this.createdBy && this.createdBy.id) {
      this.createdBy.id = mongoose.Types.ObjectId(this.createdBy.id.toString());
    }
  } catch (err) {
    console.error('Invalid ObjectId in UserLog:', err);
    return next(err);
  }

  next();
});

const UserLog = mongoose.model('UserLog', userLogSchema);

module.exports = UserLog;
