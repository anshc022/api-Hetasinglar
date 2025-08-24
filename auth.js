const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('./models/User');

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  sex: { type: String, enum: ['male', 'female'], required: true },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Auth Middleware
const auth = async (req, res, next) => {
  try {
    // Allow OPTIONS requests to pass through without authentication (for CORS preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    let token = req.headers.authorization;
    
    // Handle different token formats
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Clean the token
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    // Additional validation
    if (!token || token === 'undefined' || token === 'null') {
      return res.status(401).json({ message: 'Invalid token format' });
    }

    const decoded = jwt.verify(token.trim(), process.env.JWT_SECRET || 'your-secret-key');
    
    try {
      // Support both agent and user tokens
      if (decoded.agentId) {
        const Agent = require('./models/Agent');
        const agent = await Agent.findById(decoded.agentId);
        if (!agent) {
          return res.status(401).json({ message: 'Agent not found' });
        }
        
        // Set req.user to the agent for compatibility with routes that expect req.user
        req.agent = agent;
        req.user = {
          id: agent._id,
          _id: agent._id,
          name: agent.name,
          role: agent.role || 'Agent',
          email: agent.email,
          type: 'Agent'
        };
      } else if (decoded.userId) {
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }
        req.user = {
          id: user._id,
          _id: user._id,
          name: user.username,
          role: 'User',
          email: user.email,
          type: 'User'
        };
      } else {
        return res.status(401).json({ message: 'Invalid token payload' });
      }

      // Add token expiration info to request for refresh logic
      req.tokenExp = decoded.exp;
      req.tokenIat = decoded.iat;

      next();
    } catch (dbError) {
      console.error('Database error in auth middleware:', dbError);
      return res.status(500).json({ message: 'Error retrieving user data' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    
    // Provide more specific error messages
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Your session has expired. Please log in again.',
        expiredAt: error.expiredAt,
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token format',
        code: 'TOKEN_MALFORMED'
      });
    }
    
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Admin Auth Middleware
const adminAuth = async (req, res, next) => {
  try {
    let token = req.headers.authorization;
    
    // Handle different token formats
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Clean the token
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    // Additional validation
    if (!token || token === 'undefined' || token === 'null') {
      return res.status(401).json({ message: 'Invalid token format' });
    }

    const decoded = jwt.verify(token.trim(), process.env.JWT_SECRET || 'your-secret-key');
    
    console.log('Admin auth - decoded token:', decoded); // Debug log
    
    if (!decoded.adminId) {
      console.log('Admin auth - no adminId in token, decoded:', decoded); // Debug log
      return res.status(401).json({ message: 'Invalid token payload - missing adminId' });
    }
    
    // Fetch the admin document from database to get the actual _id
    const Admin = require('./models/Admin');
    const admin = await Admin.findById(decoded.adminId);
    
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }
    
    req.admin = { 
      id: admin._id, 
      _id: admin._id,
      adminId: admin.adminId,
      name: admin.name,
      role: admin.role
    };
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Your admin session has expired. Please log in again.',
        expiredAt: error.expiredAt,
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token format',
        code: 'TOKEN_MALFORMED'
      });
    }
      res.status(401).json({ message: 'Admin authentication failed' });
  }
};

// Agent Auth Middleware
const agentAuth = async (req, res, next) => {
  try {
    let token = req.headers.authorization;

    req.agent = null;
    req.user = null;
    req.admin = null;

    if (!token) {
      // No token, just continue, routes will protect themselves
      return next();
    }

    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    if (!token || token === 'undefined' || token === 'null') {
      return res.status(401).json({ message: 'Invalid token format' });
    }
    
    const decoded = jwt.verify(token.trim(), process.env.JWT_SECRET || 'your-secret-key');

    if (decoded.agentId) {
      const Agent = require('./models/Agent');
      const agent = await Agent.findById(decoded.agentId).lean();
      if (agent) {
        req.agent = agent;
      }
    } else if (decoded.userId) {
      const User = require('./models/User');
      const user = await User.findById(decoded.userId).lean();
      if (user) {
        req.user = user;
      }
    } else if (decoded.adminId) {
        const Admin = require('./models/Admin');
        const admin = await Admin.findById(decoded.adminId).lean();
        if(admin) {
            req.admin = admin;
        }
    }

    if (decoded) {
        req.tokenExp = decoded.exp;
        req.tokenIat = decoded.iat;
    }

    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    req.agent = null;
    req.user = null;
    req.admin = null;
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Your session has expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
            message: 'Invalid token.',
            code: 'TOKEN_INVALID'
        });
    }
    
    next(error);
  }
};

// Token refresh endpoint
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    // Verify the token without checking expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', {
      ignoreExpiration: true
    });

    // Check if the token was issued more than 30 days ago (absolute max lifetime)
    const tokenIssueTime = new Date(decoded.iat * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    if (tokenIssueTime < thirtyDaysAgo) {
      return res.status(401).json({ 
        message: 'Token too old, please login again',
        code: 'TOKEN_TOO_OLD'
      });
    }

    // Generate a new token with the same payload but updated expiration
    let newToken;
    if (decoded.userId) {
      // User token
      newToken = jwt.sign(
        { userId: decoded.userId },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
    } else if (decoded.agentId) {
      // Agent token
      newToken = jwt.sign(
        { agentId: decoded.agentId },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
    } else if (decoded.adminId) {
      // Admin token
      newToken = jwt.sign(
        { adminId: decoded.adminId },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );
    } else {
      return res.status(400).json({ message: 'Invalid token format' });
    }

    res.json({ 
      access_token: newToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ message: 'Invalid token for refresh' });
  }
});

// Routes
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, dateOfBirth, sex, referral_code, full_name } = req.body;
    
    const userExists = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (userExists) {
      return res.status(400).json({
        message: userExists.email === email ? 
          'Email already registered' : 
          'Username already taken'
      });
    }

    // Process affiliate referral if provided (check both field names for compatibility)
    const referralCode = referral_code || req.body.referralCode;
    let affiliateData = {};
    if (referralCode) {
      try {
        const AffiliateLink = require('./models/AffiliateLink');
        const affiliateLink = await AffiliateLink.findByCode(referralCode);
        
        if (affiliateLink) {
          // Increment registration count
          await affiliateLink.incrementRegistration();
          
          affiliateData = {
            referral: {
              affiliateCode: referralCode,
              referredBy: affiliateLink.agentId,
              referredAt: new Date()
            },
            registrationSource: 'affiliate',
            affiliateAgent: affiliateLink.agentId
          };
        }
      } catch (error) {
        console.log('Error processing affiliate referral:', error);
        // Continue with registration even if affiliate processing fails
      }
    }

    const userData = {
      username,
      email,
      password,
      ...affiliateData
    };

    // Add optional fields if provided
    if (full_name) userData.full_name = full_name;
    if (dateOfBirth) userData.dateOfBirth = dateOfBirth;
    if (sex) userData.sex = sex;

    const user = await User.create(userData);

    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      dateOfBirth: user.dateOfBirth,
      sex: user.sex
    };

    res.status(201).json({ user: userResponse });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: username.toLowerCase() }
      ]
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' } // Increased from 24h to 7 days
    );

    res.json({
      access_token: token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        sex: user.sex
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});

// Add forgot password route
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    // Here you would typically:
    // 1. Generate a password reset token
    // 2. Save it to the user record
    // 3. Send an email with reset instructions
    // For demo purposes, we'll just return a success message

    res.json({ message: 'Password reset instructions sent to your email' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process password reset request' });
  }
});

// Middleware functions for routes protection
const isAuthenticated = async (req, res, next) => {
  // Authentication middleware
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Support both agent and admin tokens
    if (decoded.agentId) {
      const Agent = require('./models/Agent');
      const agent = await Agent.findById(decoded.agentId);
      if (!agent) {
        return res.status(401).json({ message: 'Agent not found' });
      }
      req.user = {
        _id: agent._id,
        id: agent._id, // Ensure both _id and id are available
        role: 'Agent',
        name: agent.name || 'Agent'
      };
    } else if (decoded.adminId) {
      const Admin = require('./models/Admin');
      const admin = await Admin.findById(decoded.adminId);
      if (!admin) {
        return res.status(401).json({ message: 'Admin not found' });
      }
      req.user = {
        _id: admin._id,
        id: admin._id, // Ensure both _id and id are available
        role: 'Admin',
        name: admin.name || 'Admin'
      };
    } else if (decoded.userId) {
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
      req.user = {
        _id: user._id,
        id: user._id, // Ensure both _id and id are available
        role: 'User',
        name: user.username || 'User'
      };
    } else {
      return res.status(401).json({ message: 'Invalid token payload' });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const isAgent = (req, res, next) => {
  // Check if user is set with proper role
  if (!req.user) {
    return res.status(403).json({ message: 'Authentication required' });
  }
  
  // Allow users with either Agent or Admin roles
  if (req.user.role === 'Agent' || req.user.role === 'Admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Agent permissions required' });
  }
};

const isAdmin = (req, res, next) => {
  console.log('isAdmin middleware called');
  // Check if user has admin role
  // For now, let's allow access
  next();
};

module.exports = { 
  router, 
  auth, 
  adminAuth, 
  agentAuth,
  isAuthenticated,
  isAgent,
  isAdmin
};
