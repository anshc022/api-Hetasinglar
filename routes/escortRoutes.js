const express = require('express');
const router = express.Router();
const EscortProfile = require('../models/EscortProfile');
const { auth } = require('../auth');
const cache = require('../services/cache');

// Get individual escort profile for users (public route with auth)
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Cache key for individual escort profile
    const cacheKey = `escort:profile:${id}`;
    let escort = cache.get(cacheKey);
    
    if (!escort) {
      escort = await EscortProfile.findById(id)
        .select('-createdBy -__v') // Exclude sensitive fields
        .lean();
      
      if (!escort) {
        return res.status(404).json({ message: 'Escort profile not found' });
      }
      
      if (escort.status !== 'active') {
        return res.status(404).json({ message: 'Escort profile not available' });
      }
      
      // Cache for 10 minutes
      cache.set(cacheKey, escort, 10 * 60 * 1000);
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

// Get escort profile by username (alternative lookup)
router.get('/username/:username', auth, async (req, res) => {
  try {
    const { username } = req.params;
    
    const cacheKey = `escort:profile:username:${username}`;
    let escort = cache.get(cacheKey);
    
    if (!escort) {
      escort = await EscortProfile.findOne({ 
        username, 
        status: 'active' 
      })
        .select('-createdBy -__v')
        .lean();
      
      if (!escort) {
        return res.status(404).json({ message: 'Escort profile not found' });
      }
      
      // Cache for 10 minutes
      cache.set(cacheKey, escort, 10 * 60 * 1000);
    }
    
    res.json(escort);
  } catch (error) {
    console.error('Error fetching escort profile by username:', error);
    res.status(500).json({
      message: 'Failed to fetch escort profile',
      error: error.message
    });
  }
});

module.exports = router;