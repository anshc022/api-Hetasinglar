const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const router = express.Router();
const Agent = require('../models/Agent');
const EscortProfile = require('../models/EscortProfile');
const Chat = require('../models/Chat');
const { auth, agentAuth } = require('../auth');
const AgentImage = require('../models/AgentImage');
const cache = require('../services/cache'); 
const crypto = require('crypto');
const { performanceMonitor } = require('../utils/performanceMonitor');
const { isValidSwedishRegion, getSwedishRegions, normalizeSwedishRegion } = require('../constants/swedishRegions');
const { isValidRelationshipStatus, getRelationshipStatuses } = require('../constants/relationshipStatuses');
// Inflight map to de-duplicate concurrent fetches per cacheKey
const inflightFetches = new Map();

// Fallback cache for ultra-fast live queue
const liveQueueCache = new Map();
const cacheTimers = new Map();

// Performance monitoring endpoint
router.get('/performance-stats', async (req, res) => {
  try {
    const escortCount = await EscortProfile.countDocuments({ status: 'active' });
    const perfStats = performanceMonitor.getStats();
    
    res.json({
      status: 'monitoring',
      timestamp: new Date().toISOString(),
      escortCount,
      performance: perfStats,
      optimizations: {
        fieldOptimization: 'UI-focused field selection',
        resultLimiting: 'Smart limits (50 full, 100 basic)',
        caching: 'Aggressive TTL (3-10 minutes)',
        indexHints: 'Query-specific index hints',
        performanceMonitoring: 'Real-time tracking'
      },
      cacheStats: {
        activeRequests: inflightFetches.size,
        liveQueueCacheSize: liveQueueCache.size
      }
    });
  } catch (error) {
    console.error('Performance stats error:', error);
    res.status(500).json({
      message: 'Failed to fetch performance stats',
      error: error.message
    });
  }
});

// Expose a helper to clear fallback live queue cache immediately
function clearLiveQueueFallbackCache() {
  try {
    if (cacheTimers && cacheTimers.size) {
      for (const [, timer] of cacheTimers) {
        try { clearTimeout(timer); } catch {}
      }
      cacheTimers.clear();
    }
    if (liveQueueCache && liveQueueCache.size) {
      liveQueueCache.clear();
    }
    // Live-queue cache cleared
  } catch (e) {
    console.warn('FALLBACK cache clear error:', e?.message || e);
  }
}

// Attach on router so server can register it in app.locals
router.clearLiveQueueFallbackCache = clearLiveQueueFallbackCache;

// Agent login - moved before auth middleware
let pendingConnectionPromise = null;

async function ensureDatabaseConnection() {
  const targetState = mongoose.connection.readyState;

  if (targetState === 1) {
    return;
  }

  if (targetState === 2) {
    if (!pendingConnectionPromise) {
      pendingConnectionPromise = new Promise((resolve, reject) => {
        const onConnected = () => {
          cleanup();
          resolve();
        };

        const onError = (err) => {
          cleanup();
          reject(err);
        };

        function cleanup() {
          mongoose.connection.removeListener('connected', onConnected);
          mongoose.connection.removeListener('error', onError);
        }

        mongoose.connection.once('connected', onConnected);
        mongoose.connection.once('error', onError);

        setTimeout(() => {
          cleanup();
          reject(new Error('MongoDB connection attempt timed out while connecting'));
        }, 10000);
      }).finally(() => {
        pendingConnectionPromise = null;
      });
    }

    await pendingConnectionPromise;
    return;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not configured');
  }

  if (targetState === 3) {
    try {
      await mongoose.disconnect();
    } catch (disconnectErr) {
      console.warn('Failed to complete disconnect before reconnect attempt:', disconnectErr.message);
    }
  }

  pendingConnectionPromise = mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxIdleTimeMS: 30000,
    family: 4
  }).finally(() => {
    pendingConnectionPromise = null;
  });

  await pendingConnectionPromise;
}

router.post('/login', async (req, res) => {
  try {
    const { agentId, password } = req.body;

    if (!agentId || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    await ensureDatabaseConnection();

    const agent = await Agent.findOne({ agentId });

    if (!agent) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, agent.password);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { agentId: agent._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }  // Increased from 24h to 7 days
    );

    res.json({
      access_token: token,
      agent: {
        id: agent._id,
        agentId: agent.agentId,
        name: agent.name,
        role: agent.role,
        permissions: agent.permissions,
        stats: agent.stats
      }
    });
  } catch (error) {
    console.error('Agent login error:', error);

    if (error.message?.includes('buffering timed out') || error.name === 'MongooseNetworkError') {
      return res.status(503).json({
        message: 'Temporarily unable to reach the database. Please try again in a moment.',
        error: error.message
      });
    }

    res.status(500).json({
      message: 'Failed to log in agent',
      error: error.message
    });
  }
});

// Ensure database connection for all subsequent agent routes
router.use(async (req, res, next) => {
  try {
    await ensureDatabaseConnection();
    next();
  } catch (error) {
    console.error('MongoDB connection middleware error:', error);
    res.status(503).json({
      message: 'Service temporarily unavailable due to database connectivity issues',
      error: error.message
    });
  }
});

// Get active escort profiles (with optional filtering & pagination) - OPTIMIZED
router.get('/escorts/active', async (req, res) => {
  const requestId = performanceMonitor.generateRequestId();
  const timer = performanceMonitor.startTimer(requestId, 'escorts/active');
  
  try {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 0, 0);
    const withTotals = (req.query.withTotals || 'false').toLowerCase() === 'true';
    const format = (req.query.format || 'array').toLowerCase(); // 'array' (default) or 'v2'
    const gender = req.query.gender;
    const country = req.query.country;
    const region = req.query.region;
    
    performanceMonitor.recordPhase(requestId, 'init', {
      full: req.query.full,
      filters: {gender, country, region},
      pagination: page > 0,
      pageSize
    });
    
    // Warn about potentially expensive full queries
    if (req.query.full === 'true' && !page) {
      console.warn(`[${requestId}] ⚠️ EXPENSIVE: Full query without pagination detected - consider adding pagination`);
    }

    const filter = { status: 'active' };
    if (gender) filter.gender = gender;
    if (country) filter.country = country;
    if (region) filter.region = region;

    const isPaginated = page > 0 && pageSize > 0;

    const baseKey = 'escorts:active';
    const filterKey = JSON.stringify({ gender: gender || null, country: country || null, region: region || null });
    const cacheKey = isPaginated
      ? `${baseKey}:filters:${filterKey}:page:${page}:size:${pageSize}:totals:${withTotals}`
      : (filterKey === JSON.stringify({ gender: null, country: null, region: null }) ? `${baseKey}:all` : `${baseKey}:filters:${filterKey}`);

    let profiles = cache.get(cacheKey);
    let hasMore = false;
    let totalsMeta = null;
    let cached = false;
    
    if (!profiles) {
      performanceMonitor.recordPhase(requestId, 'cache-miss', { cacheKey });
      // Cache miss - fetching from database

      // De-duplicate concurrent fetches per cacheKey
      if (inflightFetches.has(cacheKey)) {
        profiles = await inflightFetches.get(cacheKey);
      } else {
        const fetchPromise = (async () => {
          // Optimized field selection based on actual frontend usage
          const essentialFields = '_id username firstName profileImage profilePicture imageUrl country region status createdAt';
          // UI-focused full selection - only fields actually used by frontend
          const uiOptimizedFields = essentialFields + ' interests profession';
          const useFull = (req.query.full === 'true');

          let query = EscortProfile.find(filter)
            .select(useFull ? uiOptimizedFields : essentialFields)
            .sort({ createdAt: -1 })
            .lean();

          if (useFull) {
            // Using UI-OPTIMIZED projection
          } else {
            // Using ESSENTIAL projection
          }

          // Optimized index hints for better query performance
          try {
            // Primary compound index for most common queries
            if (gender && country && region) {
              query = query.hint({ status: 1, country: 1, region: 1, gender: 1, createdAt: -1 });
            } else if (country && region) {
              query = query.hint({ status: 1, country: 1, region: 1, createdAt: -1 });
            } else if (gender) {
              query = query.hint({ status: 1, gender: 1, createdAt: -1 });
            } else if (country) {
              query = query.hint({ status: 1, country: 1, createdAt: -1 });
            } else {
              // Fallback to simple status + creation date index
              query = query.hint({ status: 1, createdAt: -1 });
            }
          } catch (hintError) {
            console.log('Index hint failed (non-fatal):', hintError.message);
          }

          if (isPaginated) {
            // Use 1 extra doc to determine hasMore without total count
            query = query.skip((page - 1) * pageSize).limit(pageSize + 1);
          } else {
            // CRITICAL: Prevent massive data fetches - limit to 100 records max
            const maxRecords = useFull ? 50 : 100; // Lower limit for full queries
            query = query.limit(maxRecords);
            // Applied safety limit
          }
          const result = await query.exec();
          return result;
        })();

        inflightFetches.set(cacheKey, fetchPromise);
        try {
          profiles = await fetchPromise;
        } finally {
          inflightFetches.delete(cacheKey);
        }
      }

      if (isPaginated && Array.isArray(profiles)) {
        hasMore = profiles.length > pageSize;
        if (hasMore) profiles = profiles.slice(0, pageSize);
      }

      if (isPaginated && withTotals) {
        try {
          const total = await EscortProfile.countDocuments(filter);
          const totalPages = Math.ceil(total / pageSize);
          totalsMeta = { total, totalPages };
          res.set('X-Total-Count', String(total));
          res.set('X-Total-Pages', String(totalPages));
        } catch (countErr) {
          console.log('Count error (non-fatal):', countErr.message);
        }
      }

      // Optimize TTL based on query complexity and data size
      let ttl;
      if (useFull || profiles.length > 30) {
        // Longer cache for expensive full queries or large result sets
        ttl = 600 * 1000; // 10 minutes
      } else if (isPaginated) {
        // Medium cache for paginated results
        ttl = 300 * 1000; // 5 minutes
      } else {
        // Standard cache for simple queries
        ttl = 180 * 1000; // 3 minutes
      }
      
      cache.set(cacheKey, profiles, ttl);
      performanceMonitor.recordPhase(requestId, 'db-complete', { 
        resultCount: profiles.length,
        ttl: ttl/1000
      });
      // Profiles cached
    } else {
      cached = true;
      performanceMonitor.recordPhase(requestId, 'cache-hit', { cacheKey });
      // Cache hit - returning profiles
    }
    // Choose response shape (default array for backward compatibility)
    const responseBody = format === 'v2'
      ? (isPaginated
          ? { items: profiles, page, pageSize, hasMore, totals: withTotals ? (totalsMeta || null) : undefined }
          : { items: profiles })
      : profiles;

    // Expose hasMore via header for legacy clients
    if (isPaginated) {
      res.set('X-Has-More', String(hasMore));
      res.set('X-Page', String(page));
      res.set('X-Page-Size', String(pageSize));
    }

  const etag = crypto.createHash('md5').update(JSON.stringify(responseBody)).digest('hex');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    
    // Complete performance monitoring
    const resultCount = Array.isArray(profiles) ? profiles.length : 0;
    const perfResult = performanceMonitor.endTimer(requestId, resultCount, cached);
    
    // Add performance headers for monitoring
    res.set('X-Response-Time', `${perfResult.totalDuration}ms`);
    res.set('X-Result-Count', String(resultCount));
    res.set('X-Cache-Status', cached ? 'HIT' : 'MISS');
    
    res.json(responseBody);
  } catch (error) {
    performanceMonitor.endTimer(requestId, 0, false);
    console.error(`[${requestId}] ❌ Query failed:`, error);
    res.status(500).json({
      message: 'Failed to fetch escort profiles',
      error: error.message
    });
  }
});

// Create a new agent (PUBLIC - no auth required, but should be restricted in production)
router.post('/', async (req, res) => {
  try {
    const { agentId, name, email, password, role, permissions } = req.body;

    // Agent creation

    // Check if agent already exists
    const queryConditions = [{ agentId }];
    
    // Only check email if it's provided
    if (email) {
      queryConditions.push({ email });
    }

    console.log('Query conditions:', JSON.stringify(queryConditions, null, 2));
    
    const existingAgent = await Agent.findOne({ 
      $or: queryConditions
    });

    console.log('Existing agent found:', existingAgent ? 'YES' : 'NO');
    if (existingAgent) {
      console.log('Existing agent details:', {
        agentId: existingAgent.agentId,
        email: existingAgent.email,
        name: existingAgent.name
      });
    }
    
    if (existingAgent) {
      // Check which field caused the conflict
      if (existingAgent.agentId === agentId) {
        console.log('Conflict reason: Agent ID already taken');
        return res.status(400).json({ message: 'Agent ID already taken' });
      } else if (email && existingAgent.email === email) {
        console.log('Conflict reason: Email already in use');
        return res.status(400).json({ message: 'Email already in use' });
      } else {
        console.log('Conflict reason: Unknown conflict');
        return res.status(400).json({ message: 'Agent already exists' });
      }
    }

    // Create the new agent
    const newAgent = new Agent({
      agentId,
      name,
      email,
      password, // will be hashed by pre-save hook
      role: role || 'agent',
      permissions: permissions || {
        canMessage: true,
        canModerate: false,
        canViewStats: true
      },
      stats: {
        liveMessageCount: 0,
        totalMessagesSent: 0,
        activeCustomers: 0
      }
    });

    await newAgent.save();

    // Return the new agent without password
    const agentResponse = {
      id: newAgent._id,
      agentId: newAgent.agentId,
      name: newAgent.name,
      email: newAgent.email,
      role: newAgent.role,
      permissions: newAgent.permissions,
      stats: newAgent.stats
    };

    res.status(201).json(agentResponse);
  } catch (error) {
    console.error('Error creating agent:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error', 
        details: error.message 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists` 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create agent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Protect all routes after this point
router.use(auth);

// Simple cache for dashboard stats (5 minute TTL)
const dashboardCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get agent dashboard data - OPTIMIZED with caching
router.get('/dashboard', async (req, res) => {
  try {
    // Handle both auth middleware types
    const agentId = req.agent?._id || req.agent?.id;
    
    if (!agentId) {
      return res.status(401).json({ message: 'Agent ID not found in token' });
    }

    // Check cache first
    const cacheKey = `dashboard_${agentId}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return res.json(cached.data);
    }

    // Get agent data with optimized query - only select needed fields
    const agent = await Agent.findById(agentId).select('stats name agentId').lean();
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Optimize: Use cached/simplified platform stats instead of expensive aggregation
    // For development, use mock data or simple count instead of aggregation
    const platformStats = {
      totalLiveMessages: 150, // Mock value - replace with cached value in production
      onlineCustomers: 25,    // Mock value - can be updated via WebSocket or cache
      agentStats: {
        liveMessageCount: agent.stats?.liveMessageCount || 0,
        totalMessagesSent: agent.stats?.totalMessagesSent || 0,
        activeCustomers: agent.stats?.activeCustomers || 0
      },
      agent: {
        name: agent.name,
        agentId: agent.agentId
      }
    };

    // Cache the result
    dashboardCache.set(cacheKey, {
      data: platformStats,
      timestamp: Date.now()
    });

    // Clean old cache entries periodically
    if (dashboardCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of dashboardCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          dashboardCache.delete(key);
        }
      }
    }
    
    res.json(platformStats);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch dashboard data',
      error: error.message 
    });
  }
});

// Get agent profile
router.get('/profile', agentAuth, async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id).select('-password');
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    console.error('Error fetching agent profile:', error);
    res.status(500).json({ message: 'Failed to fetch agent profile' });
  }
});

// Get Swedish regions for escort creation
router.get('/swedish-regions', agentAuth, (req, res) => {
  try {
    res.json({
      success: true,
      regions: getSwedishRegions()
    });
  } catch (error) {
    console.error('Error fetching Swedish regions:', error);
    res.status(500).json({ message: 'Failed to fetch regions' });
  }
});

// Get relationship statuses for escort creation
router.get('/relationship-statuses', agentAuth, (req, res) => {
  try {
    res.json({
      success: true,
      statuses: getRelationshipStatuses()
    });
  } catch (error) {
    console.error('Error fetching relationship statuses:', error);
    res.status(500).json({ message: 'Failed to fetch relationship statuses' });
  }
});

// Get all agents
router.get('/', async (req, res) => {
  try {
    const agents = await Agent.find().select('-password');
    
    const formattedAgents = agents.map(agent => ({
      id: agent._id,
      agentId: agent.agentId,
      name: agent.name || '',
      email: agent.email || '',
      role: agent.role || 'agent',
      permissions: agent.permissions || {},
      stats: agent.stats || {
        avgResponseTime: 'N/A',
        totalMessages: 0,
        rating: 'N/A',
        activeChats: 0
      }
    }));
    
    res.json(formattedAgents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

// Create escort profile
router.post('/escorts', async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id);
    
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (!agent.permissions?.canCreateEscorts) {
      return res.status(403).json({ 
        message: 'Not authorized to create escort profiles. Please contact admin for permission.',
        code: 'PERMISSION_DENIED'
      });
    }

    // Validate required fields
    const { username, gender } = req.body;
    // Normalize Swedish region input to canonical form if possible
    if (req.body && typeof req.body.region === 'string') {
      const normalized = normalizeSwedishRegion(req.body.region);
      if (normalized) {
        req.body.region = normalized;
      }
    }
    const region = req.body.region;
    if (!username || !gender || !region) {
      return res.status(400).json({
        message: 'Username, gender, and region are required',
        missingFields: {
          username: !username,
          gender: !gender,
          region: !region
        }
      });
    }

    // Validate Swedish region
    if (!isValidSwedishRegion(region)) {
      return res.status(400).json({
        message: 'Invalid region. Please select a valid Swedish region (län)',
        validRegions: getSwedishRegions(),
        providedRegion: region
      });
    }

    // Validate relationship status if provided
    const { relationshipStatus } = req.body;
    if (relationshipStatus && !isValidRelationshipStatus(relationshipStatus)) {
      return res.status(400).json({
        message: 'Invalid relationship status. Please select a valid relationship status',
        validStatuses: getRelationshipStatuses(),
        providedStatus: relationshipStatus
      });
    }

    // Generate unique serial number with timestamp and random string
    const serialNumber = `ESC${Date.now()}${Math.random().toString(36).substr(2, 5)}`;    
    
    const escortData = {
      ...req.body,
      country: req.body.country || 'Sweden', // Default to Sweden if not provided
      createdBy: {
        id: req.agent._id,
        type: 'Agent'
      },
      serialNumber,
      status: 'active'
    };

    const escort = await EscortProfile.create(escortData);
    
    // Invalidate relevant caches so all agents see the new profile
    cache.delete(`my_escorts:${req.agent._id}`); // Clear creator's cache
    cache.delete('all_escorts'); // Clear shared cache
    
    res.status(201).json(escort);
  } catch (error) {
    console.error('Error creating escort profile:', error);
    res.status(500).json({ 
      message: 'Failed to create escort profile',
      error: error.message 
    });
  }
});

// Get escorts created by the agent - OPTIMIZED with caching
router.get('/my-escorts', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cacheKey = `my_escorts:${req.agent._id}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`🚀 Cache HIT: my-escorts (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }

    const escorts = await EscortProfile.find({ 
      $or: [
        { 'createdBy.id': req.agent._id },  // New format: { id, type }
        { 'createdBy': req.agent._id }      // Old format: just ObjectId
      ],
      status: 'active'
    })
  .select('username firstName gender profileImage profilePicture imageUrl country region status interests profession height dateOfBirth serialNumber massMailActive createdAt stats description')
    .sort({ createdAt: -1 })
    .lean() // Use lean() for better performance
    .exec();

  // Cache the results for 2 minutes
  cache.set(cacheKey, escorts, 120 * 1000);
    
    const responseTime = Date.now() - startTime;
    if (responseTime > 500) {
      console.log(`⚠️ Slow my-escorts query: ${responseTime}ms`);
    }
    
    res.json(escorts);
  } catch (error) {
    console.error('Error fetching agent escorts:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escorts',
      error: error.message 
    });
  }
});

// Get all active escort profiles (for all agents to see)
router.get('/all-escorts', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cacheKey = 'all_escorts';
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`🚀 Cache HIT: all-escorts (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }

    const escorts = await EscortProfile.find({ 
      status: 'active'
    })
  .select('username firstName gender profileImage profilePicture imageUrl country region status interests profession height dateOfBirth serialNumber massMailActive createdAt stats createdBy description')
    .sort({ createdAt: -1 })
    .lean() // Use lean() for better performance
    .exec();

    // Cache the results for 2 minutes
    cache.set(cacheKey, escorts, 120 * 1000);
    
    const responseTime = Date.now() - startTime;
    if (responseTime > 500) {
      console.log(`⚠️ Slow all-escorts query: ${responseTime}ms`);
    }
    
    res.json(escorts);
  } catch (error) {
    console.error('Error fetching all escorts:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escorts',
      error: error.message 
    });
  }
});

// Get a single escort profile by ID (for the current agent)
router.get('/escorts/:id', agentAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const agentId = req.agent?._id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid escort ID' });
    }

    // Fetch escort and ensure it belongs to the current agent
    const escort = await EscortProfile.findOne({
      _id: id,
      $or: [
        { 'createdBy.id': agentId }, // New format
        { createdBy: agentId }       // Backward compatibility
      ]
    }).lean();

    if (!escort) {
      return res.status(404).json({ message: 'Escort profile not found' });
    }

    res.json(escort);
  } catch (error) {
    console.error('Error fetching escort profile:', error);
    res.status(500).json({ message: 'Failed to fetch escort profile', error: error.message });
  }
});

// Update an agent
router.put('/:id', async (req, res) => {
  try {
    const { name, email, role, permissions } = req.body;
    const agentIdFromBody = req.body.agentId;
    const agentIdFromParams = req.params.id;

    // Check for duplicate email/agentId if they're being changed
    const agent = await Agent.findById(agentIdFromParams);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (email !== agent.email || agentIdFromBody !== agent.agentId) {
      const duplicate = await Agent.findOne({
        $or: [
          { email, _id: { $ne: agentIdFromParams } },
          { agentId: agentIdFromBody, _id: { $ne: agentIdFromParams } }
        ]
      });

      if (duplicate) {
        return res.status(400).json({ 
          message: duplicate.email === email ? 
            'Email already in use' : 'Agent ID already taken' 
        });
      }
    }

    // Update the agent
    const updateData = {
      agentId: agentIdFromBody,
      name,
      email,
      role,
      permissions
    };

    const updatedAgent = await Agent.findByIdAndUpdate(
      agentIdFromParams, 
      updateData, 
      { new: true }
    ).select('-password');

    if (!updatedAgent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Format the response
    const agentResponse = {
      id: updatedAgent._id,
      agentId: updatedAgent.agentId,
      name: updatedAgent.name,
      email: updatedAgent.email,
      role: updatedAgent.role,
      permissions: updatedAgent.permissions,
      stats: updatedAgent.stats
    };

    res.json(agentResponse);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ message: 'Failed to update agent' });
  }
});

// Agent chat statistics (moved from malformed block)
router.get('/chats/stats', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { dateRange, startDate, endDate } = req.query;

    // Build date filter for earnings
    let earningsDateFilter = {};
    const now = new Date();

    if (startDate && endDate) {
      earningsDateFilter = {
        transactionDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z')
        }
      };
    } else if (dateRange) {
      switch (dateRange) {
        case 'today': {
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          earningsDateFilter = { transactionDate: { $gte: startOfDay } };
          break;
        }
        case 'yesterday': {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          const endOfYesterday = new Date(yesterday);
          endOfYesterday.setHours(23, 59, 59, 999);
          earningsDateFilter = {
            transactionDate: {
              $gte: yesterday,
              $lte: endOfYesterday
            }
          };
          break;
        }
        case 'last7days': {
          const last7Days = new Date(now);
          last7Days.setDate(last7Days.getDate() - 7);
          earningsDateFilter = { transactionDate: { $gte: last7Days } };
          break;
        }
        case 'last30days': {
          const last30Days = new Date(now);
          last30Days.setDate(last30Days.getDate() - 30);
          earningsDateFilter = { transactionDate: { $gte: last30Days } };
          break;
        }
        case 'thisMonth': {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          earningsDateFilter = { transactionDate: { $gte: startOfMonth } };
          break;
        }
        case 'lastMonth': {
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          earningsDateFilter = {
            transactionDate: {
              $gte: startOfLastMonth,
              $lte: endOfLastMonth
            }
          };
          break;
        }
      }
    }

    // Build chat date filter (for chats)
    let chatDateFilter = {};
    if (startDate && endDate) {
      chatDateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z')
        }
      };
    } else if (dateRange) {
      switch (dateRange) {
        case 'today': {
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          chatDateFilter = { createdAt: { $gte: startOfDay } };
          break;
        }
        case 'yesterday': {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          const endOfYesterday = new Date(yesterday);
          endOfYesterday.setHours(23, 59, 59, 999);
          chatDateFilter = {
            createdAt: {
              $gte: yesterday,
              $lte: endOfYesterday
            }
          };
          break;
        }
        case 'last7days': {
          const last7Days = new Date(now);
          last7Days.setDate(last7Days.getDate() - 7);
          chatDateFilter = { createdAt: { $gte: last7Days } };
          break;
        }
        case 'last30days': {
          const last30Days = new Date(now);
          last30Days.setDate(last30Days.getDate() - 30);
          chatDateFilter = { createdAt: { $gte: last30Days } };
          break;
        }
        case 'thisMonth': {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          chatDateFilter = { createdAt: { $gte: startOfMonth } };
          break;
        }
        case 'lastMonth': {
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          chatDateFilter = {
            createdAt: {
              $gte: startOfLastMonth,
              $lte: endOfLastMonth
            }
          };
          break;
        }
      }
    }

    // Fetch earnings for this agent
    const Earnings = require('../models/Earnings');
    const earnings = await Earnings.find({
      agentId,
      ...earningsDateFilter
    })
      .populate('userId', 'username')
      .populate('chatId', 'customerName')
      .sort({ transactionDate: -1 });

    // Find chats handled by this agent
    const chats = await Chat.find({
      assignedAgent: agentId,
      ...chatDateFilter
    })
      .populate('customer', 'username')
      .populate('escort', 'name')
      .sort({ createdAt: -1 });

    // Transform earnings data for frontend
    const earningsWithCoins = earnings.map(earning => ({
      _id: earning._id,
      customer: earning.userId?.username || 'Unknown',
      customerName: earning.userId?.username || 'Unknown',
      escortName: earning.chatId?.customerName || 'Unknown',
      coinsUsed: earning.coinsUsed || 0,
      totalAmount: earning.totalAmount || 0,
      commission: earning.agentCommission || 0,
      commissionPercentage: earning.agentCommissionPercentage || 30,
      transactionDate: earning.transactionDate,
      paymentStatus: earning.paymentStatus
    }));

    // Calculate chat statistics
    const summary = {
      totalChats: chats.length,
      totalMessages: 0,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      totalChatTime: 0,
      averageChatTime: 0,
      totalEarnings: earningsWithCoins.reduce((sum, e) => sum + e.commission, 0),
      totalCoinsUsed: earningsWithCoins.reduce((sum, e) => sum + e.coinsUsed, 0),
      totalTransactions: earningsWithCoins.length,
      averageEarningsPerChat: earningsWithCoins.length > 0 ? earningsWithCoins.reduce((sum, e) => sum + e.commission, 0) / earningsWithCoins.length : 0,
      activeChats: 0,
      completedChats: 0
    };

    const chatDetails = [];

    for (const chat of chats) {
      const messagesSent = chat.messages ? chat.messages.filter(m => m.senderType === 'agent').length : 0;
      const messagesReceived = chat.messages ? chat.messages.filter(m => m.senderType === 'user').length : 0;
      const totalMessages = messagesSent + messagesReceived;

      // Calculate chat duration in minutes
      let duration = 0;
      if (chat.endTime && chat.startTime) {
        duration = Math.round((new Date(chat.endTime) - new Date(chat.startTime)) / (1000 * 60));
      } else if (chat.startTime) {
        duration = Math.round((new Date() - new Date(chat.startTime)) / (1000 * 60));
      }

      // Find earnings for this chat
      const chatEarnings = earnings.filter(e => e.chatId && e.chatId._id.toString() === chat._id.toString());
      const totalCoinsUsed = chatEarnings.reduce((sum, e) => sum + (e.coinsUsed || 0), 0);
      const chatEarningsAmount = chatEarnings.reduce((sum, e) => sum + (e.agentCommission || 0), 0);

      summary.totalMessages += totalMessages;
      summary.totalMessagesSent += messagesSent;
      summary.totalMessagesReceived += messagesReceived;
      summary.totalChatTime += duration;

      if (chat.status === 'assigned') {
        summary.activeChats++;
      } else if (chat.status === 'closed') {
        summary.completedChats++;
      }

      chatDetails.push({
        _id: chat._id,
        customer: chat.customer?.username || 'Unknown',
        customerName: chat.customer?.username || 'Unknown',
        escort: chat.escort?.name || 'Unknown',
        escortName: chat.escort?.name || 'Unknown',
        status: chat.status,
        messagesSent,
        messagesReceived,
        duration,
        coinsUsed: totalCoinsUsed,
        earnings: chatEarningsAmount,
        createdAt: chat.createdAt
      });
    }

    // Calculate averages
    if (summary.totalChats > 0) {
      summary.averageChatTime = Math.round(summary.totalChatTime / summary.totalChats);
    }

    res.json({
      summary,
      chatDetails,
      earnings: earningsWithCoins,
      period: { dateRange, startDate, endDate }
    });
  } catch (error) {
    console.error('Error fetching agent chat statistics:', error);
    res.status(500).json({
      message: 'Failed to fetch chat statistics',
      error: error.message
    });
  }
});

// Export agent chat statistics as CSV
router.get('/chats/export-stats', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { dateRange, startDate, endDate } = req.query;

    // Use same date filtering logic as above
    let dateFilter = {};
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z')
        }
      };
    } else if (dateRange) {
      switch (dateRange) {
        case 'today':
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          dateFilter = { createdAt: { $gte: startOfDay } };
          break;
        case 'last7days':
          const last7Days = new Date(now);
          last7Days.setDate(last7Days.getDate() - 7);
          dateFilter = { createdAt: { $gte: last7Days } };
          break;
        case 'last30days':
          const last30Days = new Date(now);
          last30Days.setDate(last30Days.getDate() - 30);
          dateFilter = { createdAt: { $gte: last30Days } };
          break;
      }
    }

    const chats = await Chat.find({
      assignedAgent: agentId,
      ...dateFilter
    }).populate('customer', 'username')
      .populate('escort', 'name')
      .sort({ createdAt: -1 });

    // Generate CSV content
    const csvHeaders = [
      'Chat ID',
      'Customer',
      'Escort', 
      'Status',
      'Messages Sent',
      'Messages Received',
      'Duration (minutes)',
      'Earnings ($)',
      'Created Date',
      'Start Time',
      'End Time'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    for (const chat of chats) {
      const messagesSent = chat.messages ? chat.messages.filter(m => m.senderType === 'agent').length : 0;
      const messagesReceived = chat.messages ? chat.messages.filter(m => m.senderType === 'user').length : 0;
      
      let duration = 0;
      if (chat.endTime && chat.startTime) {
        duration = Math.round((new Date(chat.endTime) - new Date(chat.startTime)) / (1000 * 60));
      } else if (chat.startTime) {
        duration = Math.round((new Date() - new Date(chat.startTime)) / (1000 * 60));
      }

      const earnings = messagesSent * 0.5;

      const row = [
        chat._id,
        `"${chat.customer?.username || 'Unknown'}"`,
        `"${chat.escort?.name || 'Unknown'}"`,
        chat.status,
        messagesSent,
        messagesReceived,
        duration,
        earnings.toFixed(2),
        chat.createdAt.toISOString().split('T')[0],
        chat.startTime ? chat.startTime.toISOString() : '',
        chat.endTime ? chat.endTime.toISOString() : ''
      ];

      csvContent += row.join(',') + '\n';
    }

    // Set headers for file download
    const filename = `agent-chat-stats-${dateRange || 'custom'}-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting agent chat statistics:', error);
    res.status(500).json({ 
      message: 'Failed to export chat statistics',
      error: error.message 
    });
  }
});

// Update chat info
router.patch('/chats/:chatId/info', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const updates = req.body;
    
    // Validate chatId
    if (!chatId) {
      return res.status(400).json({ message: 'Chat ID is required' });
    }

    // Find and update the chat
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      success: true,
      message: 'Chat info updated successfully',
      chat: {
        _id: chat._id,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating chat info:', error);
    res.status(500).json({ 
      message: 'Failed to update chat info',
      error: error.message 
    });
  }
});

// Assign agent to chat
router.post('/chats/:chatId/assign', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const agentId = req.agent._id;
    
    // Validate chatId
    if (!chatId) {
      return res.status(400).json({ message: 'Chat ID is required' });
    }

    // Find and update the chat to assign the current agent
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { 
        agentId: agentId,
        status: 'assigned',
        $push: {
          assignedHistory: {
            agentId: agentId,
            assignedAt: new Date()
          }
        }
      },
      { new: true, runValidators: true }
    ).populate('agentId', 'name agentId');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      success: true,
      message: 'Agent assigned to chat successfully',
      chat: {
        _id: chat._id,
        agentId: chat.agentId,
        status: chat.status,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    console.error('Error assigning agent to chat:', error);
    res.status(500).json({ 
      message: 'Failed to assign agent to chat',
      error: error.message 
    });
  }
});

// Get chats for live queue - ULTRA OPTIMIZED VERSION 2.0
router.get('/chats/live-queue', agentAuth, async (req, res) => {
  const startTime = Date.now();
  const agentId = req.agent?._id;
  
  try {
    // Use global cache key with version for optimized endpoint
    const cacheKey = `live_queue:global:v2`;
    
    // Check fallback cache first - reduced TTL for fresher data
    if (liveQueueCache.has(cacheKey)) {
      const cachedData = liveQueueCache.get(cacheKey);
      console.log(`🚀 OPTIMIZED Cache HIT: global live-queue (${Date.now() - startTime}ms)`);
      return res.json(cachedData);
    }
    
    // Check main cache as backup
    const cached = cache.get && cache.get(cacheKey);
    if (cached) {
      console.log(`🚀 Main Cache HIT: optimized live-queue (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }
    
    console.log(`🔍 Cache MISS: generating optimized live-queue data`);

    // STEP 1: Ultra-efficient pre-filter using compound indexes
    const baseQuery = {
      $or: [
        // Active chats (uses status index)
        { status: { $in: ['new', 'assigned', 'active'] } },
        // Panic room chats (uses isInPanicRoom index)  
        { isInPanicRoom: true },
        // Recent chats only (time-bounded for performance)
        { 
          updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
          status: { $ne: 'completed' }
        }
      ]
    };

    // STEP 2: Streamlined aggregation pipeline
    const chats = await Chat.aggregate([
      {
        // Stage 1: Fast initial filter using compound indexes
        $match: baseQuery
      },
      {
        // Stage 2: Add minimal computed fields for speed
        $addFields: {
          lastMessages: { $slice: ["$messages", -10] }, // Only last 10 for speed
          lastMessage: { $arrayElemAt: ["$messages", -1] }
        }
      },
      {
        // Stage 3: Calculate unread count efficiently
        $addFields: {
          unreadCount: {
            $size: {
              $filter: {
                input: "$lastMessages",
                as: "msg", 
                cond: {
                  $and: [
                    { $eq: ["$$msg.sender", "customer"] },
                    { $eq: ["$$msg.readByAgent", false] }
                  ]
                }
              }
            }
          },
          // Simplified priority
          priority: {
            $cond: [
              { $eq: ["$isInPanicRoom", true] }, 5,
              {
                $cond: [
                  { $gte: [{ $size: { $ifNull: ["$lastMessages", []] } }, 5] }, 3, 2
                ]
              }
            ]
          }
        }
      },
      {
        // Stage 4: Filter relevant chats only
        $match: {
          $or: [
            { isInPanicRoom: true },
            { unreadCount: { $gt: 0 } },
            { status: { $in: ['new', 'assigned'] } },
            { $and: [{ reminderActive: true }, { reminderHandled: { $ne: true } }] }
          ]
        }
      },
      {
        // Stage 5: Essential lookups with minimal projections
        $lookup: {
          from: 'users',
          localField: 'customerId', 
          foreignField: '_id',
          as: 'customer',
          pipeline: [{ $project: { username: 1, _id: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'escortprofiles',
          localField: 'escortId',
          foreignField: '_id', 
          as: 'escort',
          pipeline: [{ $project: { firstName: 1, _id: 1 } }]
        }
      },
      {
        // Stage 6: Final projection - essential data only
        $project: {
          _id: 1,
          customerId: { $arrayElemAt: ['$customer', 0] },
          escortId: { $arrayElemAt: ['$escort', 0] },
          agentId: 1,
          status: 1,
          customerName: 1,
          isInPanicRoom: 1,
          createdAt: 1,
          updatedAt: 1,
          unreadCount: 1,
          priority: 1,
          reminderActive: 1,
          reminderHandled: 1,
          chatType: {
            $cond: [
              { $eq: ['$isInPanicRoom', true] }, 'panic',
              { $cond: [{ $gt: ['$unreadCount', 0] }, 'queue', 'idle'] }
            ]
          },
          lastMessage: {
            message: {
              $cond: [
                { $eq: ['$lastMessage.messageType', 'image'] },
                '📷 Image',
                { $substr: [{ $ifNull: ['$lastMessage.message', ''] }, 0, 50] }
              ]
            },
            messageType: '$lastMessage.messageType',
            sender: '$lastMessage.sender', 
            timestamp: '$lastMessage.timestamp',
            readByAgent: '$lastMessage.readByAgent'
          },
          hasNewMessages: { $gt: ['$unreadCount', 0] }
        }
      },
      {
        // Stage 7: Efficient sort
        $sort: { priority: -1, updatedAt: -1 }
      },
      {
        // Stage 8: Performance limit
        $limit: 25
      }
    ]);

    // STEP 3: Optimized caching with shorter TTL
    liveQueueCache.set(cacheKey, chats);
    console.log(`💾 OPTIMIZED cache set for global live-queue`);
    
    // Clear cache after 20 seconds (shorter for fresher data)
    if (cacheTimers.has(cacheKey)) {
      clearTimeout(cacheTimers.get(cacheKey));
    }
    const timer = setTimeout(() => {
      liveQueueCache.delete(cacheKey);
      cacheTimers.delete(cacheKey);
      console.log(`🗑️ OPTIMIZED cache expired for global live-queue`);
    }, 20000); // 20 second cache
    cacheTimers.set(cacheKey, timer);
    
    // Also set main cache
    try {
      if (cache.set) {
        cache.set(cacheKey, chats, 30 * 1000); // 30 seconds
        console.log(`🗄️ Main cache also set for optimized live-queue`);
      }
    } catch (cacheError) {
      console.log(`⚠️ Main cache failed, but fallback cache is working`);
    }

    const responseTime = Date.now() - startTime;
    
    if (responseTime > 1000) {
      console.log(`🐌 STILL SLOW: optimized live-queue took ${responseTime}ms`);
    } else if (responseTime > 500) {
      console.log(`⚠️ Moderate: optimized live-queue took ${responseTime}ms`);  
    } else {
      console.log(`⚡ FAST: optimized live-queue took ${responseTime}ms`);
    }
    
    console.log(`🚀 OPTIMIZED Global live queue: ${chats.length} chats in ${responseTime}ms`);
    res.json(chats);
    
  } catch (error) {
    console.error('Error in optimized live queue:', error);
    console.log(`❌ OPTIMIZED live queue failed in ${Date.now() - startTime}ms`);
    res.status(500).json({ 
      message: 'Failed to fetch optimized live queue chats',
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

// Get chats for a specific escort profile - OPTIMIZED
router.get('/chats/live-queue/:escortId', agentAuth, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const agentId = req.agent._id;
    const { escortId } = req.params;
    
    // Validate escortId
    if (!escortId || !mongoose.Types.ObjectId.isValid(escortId)) {
      return res.status(400).json({ message: 'Invalid escort ID' });
    }

    // Check cache first
    const cacheKey = `live_queue:${escortId}:${agentId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`🚀 Cache HIT: escort live-queue ${escortId} (${Date.now() - startTime}ms)`);
      return res.json(cached);
    }
    
    // First verify that the escort belongs to this agent (cached query)
    const escort = await EscortProfile.findOne({
      _id: escortId,
      $or: [
        { 'createdBy.id': agentId }, // New format
        { createdBy: agentId }       // Backward compatibility
      ]
    }).select('firstName lastName profileImage profilePicture imageUrl').lean();
    
    if (!escort) {
      return res.status(404).json({ message: 'Escort profile not found or not authorized' });
    }
    
    // Use aggregation pipeline for better performance
    const chats = await Chat.aggregate([
      // Stage 1: Match chats for this escort and agent
      {
        $match: {
          escortId: new mongoose.Types.ObjectId(escortId),
          $or: [
            { agentId: agentId },
            { status: 'new' }
          ]
        }
      },
      
      // Stage 2: Lookup customer data efficiently
      {
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
          pipeline: [
            { 
              $project: { 
                username: 1, 
                email: 1, 
                coins: 1,
                lastActiveDate: 1
              } 
            }
          ]
        }
      },
      
      // Stage 3: Lookup agent data efficiently
      {
        $lookup: {
          from: 'agents',
          localField: 'agentId',
          foreignField: '_id',
          as: 'agent',
          pipeline: [
            { 
              $project: { 
                name: 1
              } 
            }
          ]
        }
      },
      
      // Stage 4: Calculate metrics
      {
        $addFields: {
          customerId: { $arrayElemAt: ['$customer', 0] },
          agentDetails: { $arrayElemAt: ['$agent', 0] },
          unreadCount: {
            $size: {
              $filter: {
                input: '$messages',
                cond: {
                  $and: [
                    { $eq: ['$$this.sender', 'customer'] },
                    { $eq: ['$$this.readByAgent', false] }
                  ]
                }
              }
            }
          },
          lastMessage: { $arrayElemAt: ['$messages', -1] }
        }
      },
      // Stage 4.5: Exclude already-answered panic-room chats from escort-scoped queue
      {
        $match: {
          $or: [
            { isInPanicRoom: { $ne: true } },
            { $and: [ { isInPanicRoom: true }, { unreadCount: { $gt: 0 } } ] },
            { $and: [ { isInPanicRoom: true }, { 'lastMessage.sender': 'customer' } ] }
          ]
        }
      },
      
      // Stage 5: Project final structure
      {
        $project: {
          customerId: '$customerId',
          escortId: { $literal: escort },
          agentId: '$agentDetails',
          status: 1,
          messages: 1,
          customerName: 1,
          lastCustomerResponse: 1,
          lastAgentResponse: 1,
          isInPanicRoom: { $ifNull: ['$isInPanicRoom', false] },
          panicRoomEnteredAt: 1,
          panicRoomMovedAt: '$panicRoomEnteredAt',
          panicRoomReason: 1,
          panicRoomNotes: 1,
          createdAt: 1,
          updatedAt: 1,
          unreadCount: 1,
          isUserActive: { $literal: false }
        }
      },
      
      // Stage 6: Sort by most recent activity
      {
        $sort: { 
          unreadCount: -1,
          updatedAt: -1 
        }
      },
      
      // Stage 7: Limit for performance
      {
        $limit: 100
      }
    ]);

    const response = {
      success: true,
      data: chats,
      escortProfile: {
        _id: escort._id,
        firstName: escort.firstName,
        lastName: escort.lastName,
        profileImage: escort.profileImage || escort.profilePicture || escort.imageUrl
      }
    };

  // Cache the results for 30 seconds
  cache.set(cacheKey, response, 30 * 1000);
    
    const responseTime = Date.now() - startTime;
    if (responseTime > 500) {
      console.log(`⚠️ Slow escort live-queue: ${responseTime}ms`);
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching escort chats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escort chats',
      error: error.message 
    });
  }
});

// Move chat to panic room
router.post('/chats/:chatId/panic-room', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { reason, notes } = req.body;
    const agentId = req.agent._id;
    
    // First check if chat exists and get current state
    const existingChat = await Chat.findById(chatId);
    
    if (!existingChat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // Check if chat is already in panic room
    if (existingChat.isInPanicRoom) {
      return res.status(400).json({ 
        message: 'Chat is already in panic room',
        isAlreadyInPanicRoom: true 
      });
    }
    
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        isInPanicRoom: true,
        panicRoomEnteredAt: new Date(),
        panicRoomReason: reason || 'Manual isolation',
        panicRoomEnteredBy: agentId,
        $push: {
          panicRoomNotes: {
            text: notes || 'Customer moved to panic room',
            agentId: agentId,
            agentName: req.agent.name
          }
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Invalidate live-queue caches so UI reflects panic state immediately
    try {
      clearLiveQueueFallbackCache();
      if (cache && typeof cache.delete === 'function') {
        cache.delete('live_queue:global');
        cache.delete('live_queue_updates:all');
      }
    } catch (e) {
      console.warn('Live queue cache clear (panic move) warning:', e?.message || e);
    }

    res.json({
      success: true,
      message: 'Chat moved to panic room successfully',
      chat: {
        _id: chat._id,
        isInPanicRoom: chat.isInPanicRoom,
        panicRoomEnteredAt: chat.panicRoomEnteredAt,
        panicRoomReason: chat.panicRoomReason
      }
    });
  } catch (error) {
    console.error('Error moving chat to panic room:', error);
    res.status(500).json({ 
      message: 'Failed to move chat to panic room',
      error: error.message 
    });
  }
});

// Remove chat from panic room
router.post('/chats/:chatId/remove-panic-room', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { notes } = req.body;
    const agentId = req.agent._id;
    
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        isInPanicRoom: false,
        $push: {
          panicRoomNotes: {
            text: notes || 'Customer removed from panic room',
            agentId: agentId,
            agentName: req.agent.name
          }
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Invalidate live-queue caches so UI reflects removal immediately
    try {
      clearLiveQueueFallbackCache();
      if (cache && typeof cache.delete === 'function') {
        cache.delete('live_queue:global');
        cache.delete('live_queue_updates:all');
      }
    } catch (e) {
      console.warn('Live queue cache clear (panic remove) warning:', e?.message || e);
    }

    res.json({
      success: true,
      message: 'Chat removed from panic room successfully',
      chat: {
        _id: chat._id,
        isInPanicRoom: chat.isInPanicRoom
      }
    });
  } catch (error) {
    console.error('Error removing chat from panic room:', error);
    res.status(500).json({ 
      message: 'Failed to remove chat from panic room',
      error: error.message 
    });
  }
});

// Add panic room note
router.post('/chats/:chatId/panic-room/notes', agentAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;
    const agentId = req.agent._id;
    
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $push: {
          panicRoomNotes: {
            text: text,
            agentId: agentId,
            agentName: req.agent.name
          }
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json({
      success: true,
      message: 'Panic room note added successfully',
      note: chat.panicRoomNotes[chat.panicRoomNotes.length - 1]
    });
  } catch (error) {
    console.error('Error adding panic room note:', error);
    res.status(500).json({ 
      message: 'Failed to add panic room note',
      error: error.message 
    });
  }
});

// Get panic room chats
router.get('/chats/panic-room', agentAuth, async (req, res) => {
  try {
    const chats = await Chat.find({
      isInPanicRoom: true
    })
    .populate('customerId', 'username email')
    .populate('escortId', 'firstName lastName')
    .populate('agentId', 'name')
    .sort({ panicRoomEnteredAt: -1 });

    // Format chats for frontend
    const formattedChats = chats.map(chat => ({
      _id: chat._id,
      customerId: chat.customerId,
      escortId: chat.escortId,
      agentId: chat.agentId,
      status: chat.status,
      messages: chat.messages,
      customerName: chat.customerName,
      isInPanicRoom: chat.isInPanicRoom,
      panicRoomEnteredAt: chat.panicRoomEnteredAt,
      panicRoomMovedAt: chat.panicRoomEnteredAt, // Add alias for frontend consistency
      panicRoomEnteredBy: chat.panicRoomEnteredBy,
      panicRoomReason: chat.panicRoomReason,
      panicRoomNotes: chat.panicRoomNotes,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    }));

    res.json({
      success: true,
      chats: formattedChats,
      count: formattedChats.length
    });
  } catch (error) {
    console.error('Error fetching panic room chats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch panic room chats',
      error: error.message 
    });
  }
});

// Image management endpoints

// Upload bulk images for agent's escort profile
router.post('/images/upload', agentAuth, async (req, res) => {
  try {
    const { images } = req.body; // Array of {filename, imageData, mimeType, size, description, tags, escortProfileId}
    const agentId = req.agent._id;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }
    
    // Validate and process images
    const savedImages = [];
    for (const imageData of images) {
      // Validate image size (max 5MB)
      if (imageData.size > 5 * 1024 * 1024) {
        return res.status(400).json({ message: `Image ${imageData.filename} is too large (max 5MB)` });
      }
      
      // Validate mime type
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(imageData.mimeType)) {
        return res.status(400).json({ message: `Invalid image type for ${imageData.filename}` });
      }
      
      // Use provided escortProfileId or find the first escort profile for the agent
      let escortProfileId = imageData.escortProfileId;
      if (!escortProfileId) {
        const escortProfile = await EscortProfile.findOne({ 
          $or: [
            { 'createdBy.id': agentId },  // New format: { id, type }
            { 'createdBy': agentId }      // Old format: just ObjectId
          ]
        });
        if (!escortProfile) {
          return res.status(404).json({ message: 'Escort profile not found. Please create an escort profile first.' });
        }
        escortProfileId = escortProfile._id;
      } else {
        // Verify the escort profile belongs to this agent
        const escortProfile = await EscortProfile.findOne({ 
          _id: escortProfileId,
          $or: [
            { 'createdBy.id': agentId },  // New format: { id, type }
            { 'createdBy': agentId }      // Old format: just ObjectId
          ]
        });
        if (!escortProfile) {
          return res.status(403).json({ message: 'Access denied to this escort profile' });
        }
      }
      
      const newImage = new AgentImage({
        agentId,
        escortProfileId: escortProfileId,
        filename: imageData.filename,
        imageData: imageData.imageData,
        mimeType: imageData.mimeType,
        size: imageData.size,
        description: imageData.description || '',
        tags: imageData.tags || []
      });
      
      await newImage.save();
      savedImages.push(newImage);
    }
    
    res.json({
      success: true,
      message: `Successfully uploaded ${savedImages.length} images`,
      images: savedImages.map(img => ({
        _id: img._id,
        filename: img.filename,
        size: img.size,
        description: img.description,
        tags: img.tags,
        uploadedAt: img.uploadedAt
      }))
    });
  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({ 
      message: 'Failed to upload images',
      error: error.message 
    });
  }
});

// Get all images for agent's escort profile
router.get('/images', agentAuth, async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { escortProfileId } = req.query;
    
    // Build query filter
    let queryFilter = { agentId, isActive: true };
    if (escortProfileId) {
      queryFilter.escortProfileId = escortProfileId;
    }
    
    const images = await AgentImage.find(queryFilter).sort({ uploadedAt: -1 });
    
    res.json({
      success: true,
      images: images.map(img => ({
        _id: img._id,
        filename: img.filename,
        imageData: img.imageData,
        mimeType: img.mimeType,
        size: img.size,
        description: img.description,
        tags: img.tags,
        escortProfileId: img.escortProfileId,
        uploadedAt: img.uploadedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ 
      message: 'Failed to fetch images',
      error: error.message 
    });
  }
});

// Delete an image
router.delete('/images/:imageId', agentAuth, async (req, res) => {
  try {
    const { imageId } = req.params;
    const agentId = req.agent._id;
    
    const image = await AgentImage.findOne({ _id: imageId, agentId });
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    await AgentImage.findByIdAndUpdate(imageId, { isActive: false });
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ 
      message: 'Failed to delete image',
      error: error.message 
    });
  }
});

// Update image description/tags
router.put('/images/:imageId', agentAuth, async (req, res) => {
  try {
    const { imageId } = req.params;
    const { description, tags } = req.body;
    const agentId = req.agent._id;
    
    const image = await AgentImage.findOne({ _id: imageId, agentId });
    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }
    
    await AgentImage.findByIdAndUpdate(imageId, {
      description: description || image.description,
      tags: tags || image.tags
    });
    
    res.json({
      success: true,
      message: 'Image updated successfully'
    });
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({ 
      message: 'Failed to update image',
      error: error.message 
    });
  }
});

// Update escort profile
router.put('/escorts/:id', agentAuth, async (req, res) => {
  try {
    const escortId = req.params.id;
    const agentId = req.agent._id;
    
    // Check if escort profile exists and belongs to the agent
    const existingEscort = await EscortProfile.findOne({
      _id: escortId,
      'createdBy.id': agentId
    });
    
    if (!existingEscort) {
      return res.status(404).json({ 
        message: 'Escort profile not found or not authorized to update' 
      });
    }

    // Update the escort profile
    const updatedEscort = await EscortProfile.findByIdAndUpdate(
      escortId,
      {
        ...req.body,
        updatedAt: new Date()
      },
      { new: true }
    );

    // Invalidate relevant caches so all agents see the updated profile
    cache.delete(`my_escorts:${agentId}`); // Clear creator's cache
    cache.delete('all_escorts'); // Clear shared cache

    res.json(updatedEscort);
  } catch (error) {
    console.error('Error updating escort profile:', error);
    res.status(500).json({ 
      message: 'Failed to update escort profile',
      error: error.message 
    });
  }
});

// Delete escort profile (soft delete: mark inactive and deactivate images)
router.delete('/escorts/:id', agentAuth, async (req, res) => {
  try {
    const escortId = req.params.id;
    const agentId = req.agent._id;

    if (!mongoose.Types.ObjectId.isValid(escortId)) {
      return res.status(400).json({ message: 'Invalid escort ID' });
    }

    // Ensure escort belongs to this agent (support both createdBy formats and legacy)
    const escort = await EscortProfile.findOne({
      _id: escortId,
      $or: [
        { 'createdBy.id': agentId },
        { createdBy: agentId },
        { agentId: agentId }
      ]
    });

    if (!escort) {
      return res.status(404).json({ message: 'Escort profile not found or not authorized' });
    }

    // Soft delete: mark status inactive and track deletion time
    escort.status = 'inactive';
    escort.updatedAt = new Date();
    escort.deletedAt = new Date(); // may not exist in schema but acceptable in Mongo
    await escort.save();

    // Deactivate related images (best-effort)
    try {
      await AgentImage.updateMany(
        { escortProfileId: escortId, agentId },
        { $set: { isActive: false } }
      );
    } catch (imgErr) {
      console.warn('Warning: failed to deactivate related images for escort', escortId, imgErr?.message);
    }

    // Invalidate relevant caches so all agents see the profile removal
    cache.delete(`my_escorts:${agentId}`); // Clear creator's cache
    cache.delete('all_escorts'); // Clear shared cache

    return res.json({
      success: true,
      message: 'Escort profile deleted (soft-deleted) successfully',
      escortId
    });
  } catch (error) {
    console.error('Error deleting escort profile:', error);
    res.status(500).json({ 
      message: 'Failed to delete escort profile',
      error: error.message 
    });
  }
});

// Get a single escort profile by ID (agent scope)
router.get('/escorts/:id', agentAuth, async (req, res) => {
  try {
    const escortId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(escortId)) {
      return res.status(400).json({ message: 'Invalid escort ID' });
    }

    // Allow fetching if created by this agent (new format or legacy) and active
    const escort = await EscortProfile.findOne({
      _id: escortId,
      status: 'active',
      $or: [
        { 'createdBy.id': req.agent._id },
        { createdBy: req.agent._id }
      ]
    }).lean();

    if (!escort) {
      return res.status(404).json({ message: 'Escort profile not found' });
    }

    res.json(escort);
  } catch (error) {
    console.error('Error fetching escort profile:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escort profile',
      error: error.message 
    });
  }
});

// Get escort profile by id (agent scoped)
router.get('/escorts/:id', agentAuth, async (req, res) => {
  try {
    const escortId = req.params.id;
    const agentId = req.agent?._id;

    if (!mongoose.Types.ObjectId.isValid(escortId)) {
      return res.status(400).json({ message: 'Invalid escort ID' });
    }

    // Allow access if the agent created the escort (new createdBy format) or legacy agentId match
    const escort = await EscortProfile.findOne({
      _id: escortId,
      $or: [
        { 'createdBy.id': agentId },
        { createdBy: agentId },
        { agentId: agentId } // legacy field in some documents
      ]
    }).lean();

    if (!escort) {
      return res.status(404).json({ message: 'Escort profile not found' });
    }

    res.json(escort);
  } catch (error) {
    console.error('Error fetching escort profile:', error);
    res.status(500).json({ 
      message: 'Failed to fetch escort profile',
      error: error.message 
    });
  }
});

// Get customer profile with chat history
router.get('/customers/:customerId', agentAuth, async (req, res) => {
  try {
    const { customerId } = req.params;
    const agentId = req.agent._id;

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }

    // Get the customer profile
    const AgentCustomer = require('../models/AgentCustomer');
    const customerData = await AgentCustomer.findOne({ 
      customerId: mongoose.Types.ObjectId(customerId), 
      agentId 
    }).populate('customerId', 'username email profileImage lastActive isActive registrationDate');

    if (!customerData) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Get chat history for this customer with any of the agent's escorts
    const escortProfiles = await EscortProfile.find({ agentId });
    const escortIds = escortProfiles.map(profile => profile._id);

    const chatHistory = await Chat.find({
      customerId: customerData.customerId._id,
      escortId: { $in: escortIds }
    }).sort({ createdAt: -1 }).lean();

    // Format the chat history
    const formattedHistory = chatHistory.map(chat => ({
      _id: chat._id,
      escortName: escortProfiles.find(e => e._id.toString() === chat.escortId.toString())?.firstName || 'Unknown',
      messageCount: chat.messages?.length || 0,
      duration: chat.endTime && chat.startTime 
        ? Math.round((new Date(chat.endTime) - new Date(chat.startTime)) / (1000 * 60))
        : null,
      status: chat.status,
      createdAt: chat.createdAt
    }));

    // Format the customer data
    const formattedCustomer = {
      _id: customerData.customerId._id,
      username: customerData.customerId.username,
      email: customerData.customerId.email,
      profileImage: customerData.customerId.profileImage,
      registrationDate: customerData.customerId.registrationDate,
      lastActivity: customerData.customerId.lastActive,
      isActive: customerData.customerId.isActive,
      assignedAgent: agentId,
      totalSpent: customerData.totalEarnings || 0,
      totalChats: customerData.totalChats || 0
    };

    res.json({
      success: true,
      customer: formattedCustomer,
      chatHistory: formattedHistory
    });
  } catch (error) {
    console.error('Error fetching customer profile:', error);
    res.status(500).json({ 
      message: 'Failed to fetch customer profile', 
      error: error.message 
    });
  }
});

// Get assigned customers for an agent
router.get('/agent-customers/:agentId', agentAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Access control - agents can only see their own assigned customers
    if (!req.admin && req.agent._id.toString() !== agentId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const AgentCustomer = require('../models/AgentCustomer');
    
    // Find all customers assigned to this agent
    const agentCustomers = await AgentCustomer.find({ agentId })
      .populate('customerId', 'username email profileImage lastActive isActive')
      .sort({ lastActive: -1 })
      .lean();
      
    // Format the response
    const customers = agentCustomers.map(customer => {
      return {
        _id: customer._id,
        customerId: customer.customerId,
        registrationDate: customer.registrationDate,
        lastActivity: customer.customerId?.lastActive || customer.lastActivity,
        isActive: customer.customerId?.isActive || false,
        totalChats: customer.totalChats || 0,
        totalEarnings: customer.totalEarnings || 0
      };
    });

    return res.json({ success: true, customers });
  } catch (error) {
    console.error('Error fetching assigned customers:', error);
    return res.status(500).json({ message: 'Failed to fetch assigned customers', error: error.message });
  }
});

// Get any existing chats for a specific customer
router.get('/customer-chats/:customerId/:agentId', agentAuth, async (req, res) => {
  try {
    const { customerId, agentId } = req.params;
    console.log(`Looking for existing chats for customer ${customerId} and agent ${agentId}`);

    // Get all escort profiles owned by the agent
    const escortProfiles = await EscortProfile.find({ agentId });
    const escortIds = escortProfiles.map(profile => profile._id);
    
    if (!escortIds.length) {
      return res.status(404).json({ message: 'No escort profiles found for this agent' });
    }

    // Find any active chats between this customer and any of the agent's escorts
    const existingChat = await Chat.findOne({
      customerId,
      escortId: { $in: escortIds },
      status: { $ne: 'closed' }
    }).populate('escortId', 'firstName name profileImage');

    if (existingChat) {
      console.log('Existing chat found:', existingChat._id);
      return res.json({
        chat: existingChat,
        escortId: existingChat.escortId._id,
        message: 'Existing chat found'
      });
    }

    // No chat exists yet
    return res.json({
      message: 'No existing chat found',
      exists: false
    });
  } catch (error) {
    console.error('Error finding customer chat:', error);
    res.status(500).json({ message: 'Failed to find customer chat', error: error.message });
  }
});

// Create a new chat between a customer and one of the agent's escorts
router.post('/create-chat', agentAuth, async (req, res) => {
  try {
    const { customerId, agentId } = req.body;
    
    if (!customerId || !agentId) {
      return res.status(400).json({ message: 'Customer ID and Agent ID are required' });
    }

    console.log(`Creating chat for customer ${customerId} with agent ${agentId}`);

    // Get the agent's escort profiles
    const escortProfiles = await EscortProfile.find({ agentId });
    
    if (!escortProfiles.length) {
      return res.status(404).json({ message: 'No escort profiles found for this agent' });
    }

    // Use the first available escort profile (in a real system, you might want to use
    // a more sophisticated selection algorithm)
    const escortProfile = escortProfiles[0];

    // Create a new chat
    const newChat = await Chat.create({
      escortId: escortProfile._id,
      customerId: customerId,
      status: 'new',
      messages: [],
      createdAt: new Date()
    });

    // Populate escort details
    const chat = await Chat.findById(newChat._id)
      .populate('escortId', 'firstName name profileImage')
      .lean();

    console.log('New chat created:', chat._id);

    res.status(201).json({
      chat,
      escortId: escortProfile._id,
      message: 'Chat created successfully'
    });
  } catch (error) {
    console.error('Chat creation error:', error);
    res.status(500).json({ message: 'Failed to create chat', error: error.message });
  }
});

module.exports = router;
