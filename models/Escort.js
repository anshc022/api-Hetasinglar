const mongoose = require('mongoose');
const { SWEDISH_REGIONS } = require('../constants/swedishRegions');
const { RELATIONSHIP_STATUSES } = require('../constants/relationshipStatuses');

// Add debugging methods that can be used in routes
async function verifyDbConnection() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return {
        connected: false,
        readyState: mongoose.connection ? mongoose.connection.readyState : 'no connection',
        error: 'MongoDB connection not ready'
      };
    }
    
    // Test a simple query
    const count = await mongoose.model('Escort').countDocuments();
    return {
      connected: true,
      readyState: mongoose.connection.readyState,
      count: count
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      stack: error.stack
    };
  }
}

async function debugFindById(id) {
  console.log(`Escort.debugFindById called with ID: ${id}`);
  try {
    // Try multiple ways of finding the document
    let result = await mongoose.model('Escort').findById(id);
    if (result) {
      return result;
    }
    
    // Try with ObjectId explicit conversion
    const ObjectId = mongoose.Types.ObjectId;
    try {
      const objId = new ObjectId(id);
      result = await mongoose.model('Escort').findOne({ _id: objId });
      if (result) {
        return result;
      }
    } catch (e) {
      // ObjectId conversion failed
    }
    
    // Try a looser query
    result = await mongoose.model('Escort').findOne({});
    
    return null;
  } catch (error) {
    console.error('Error in debugFindById:', error);
    return null;
  }
}

// Model initialization

const escortSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  firstName: {
    type: String,
    trim: true
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true
  },
  profileImage: {
    type: String
  },
  country: {
    type: String,
    trim: true,
    default: 'Sweden'
  },
  region: {
    type: String,
    trim: true,
    enum: SWEDISH_REGIONS,
    required: true
  },
  relationshipStatus: {
    type: String,
    trim: true,
    enum: RELATIONSHIP_STATUSES
  },
  interests: [{
    type: String
  }],
  profession: {
    type: String,
    trim: true
  },
  height: {
    type: Number
  },
  dateOfBirth: {
    type: Date
  },
  createdBy: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['Admin', 'Agent'], required: true }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
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
escortSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add static methods for debugging
escortSchema.statics.verifyDbConnection = verifyDbConnection;
escortSchema.statics.debugFindById = debugFindById;

// Add helper method for client response
escortSchema.methods.toClientObject = function() {
  return {
    id: this._id,
    name: this.firstName || this.username,
    age: this.dateOfBirth ? Math.floor((Date.now() - this.dateOfBirth) / (365.25 * 24 * 60 * 60 * 1000)) : null,
    location: `${this.region || ''}, ${this.country || ''}`.replace(/^,\s*|,\s*$/g, ''),
    description: `${this.gender || ''} | ${this.profession || ''}`.replace(/^\s*\|\s*|\s*\|\s*$/g, ''),
    images: this.profileImage ? [this.profileImage] : [],
    services: [],
    rates: {},
    availability: this.status === 'active',
    featured: false
  };
};

// Add static debugging methods
escortSchema.statics.debugFindById = async function(id) {
  try {
    const result = await this.findById(id);
    return result;
  } catch (error) {
    throw error;
  }
};

escortSchema.statics.verifyDbConnection = async function() {
  try {
    const count = await this.countDocuments();
    
    return {
      status: 'connected',
      count
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
};

const Escort = mongoose.model('Escort', escortSchema);

module.exports = Escort;
