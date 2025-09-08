const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const EscortLog = require('../models/EscortLog');
const UserLog = require('../models/UserLog');
const Escort = require('../models/Escort');
const User = require('../models/User');
const { isAuthenticated, isAgent, isAdmin } = require('../auth');

// Health check endpoint
router.get('/health-check', (req, res) => {
  res.json({
    timestamp: new Date(),
    service: 'logs-api',
    status: 'healthy'
  });
});

// Get logs for an escort
router.get('/escort/:escortId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { escortId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(escortId)) {
      return res.status(400).json({ success: false, message: 'Invalid escort ID format' });
    }

    const logs = await EscortLog.find({ escortId }).sort({ createdAt: -1 }).lean();
    
    // Populate agent names for logs
    const Agent = require('../models/Agent');
    for (let log of logs) {
      if (log.createdBy && log.createdBy.id) {
        try {
          const agent = await Agent.findById(log.createdBy.id).select('name agentId');
          if (agent) {
            log.createdBy.name = agent.name || agent.agentId;
          }
        } catch (err) {
          console.log('Could not find agent for log:', log._id);
        }
      }
    }
    
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error fetching escort logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add a new log for an escort
router.post('/escort/:escortId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { escortId } = req.params;
    const { category, content } = req.body;
    const agentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(escortId)) {
      return res.status(400).json({ success: false, message: 'Invalid escort ID format' });
    }

    if (!category || !content) {
      return res.status(400).json({ success: false, message: 'Category and content are required' });
    }

    // Allow log creation even if escort doesn't exist in escorts collection
    // This handles cases where escorts are deleted but still referenced in chats
    
    // Get agent information to include name
    const Agent = require('../models/Agent');
    const agent = await Agent.findById(agentId).select('name agentId');
    const agentName = agent ? (agent.name || agent.agentId) : 'Unknown Agent';
    
    const newLog = new EscortLog({
      escortId,
      category,
      content,
      createdBy: {
        id: agentId,
        type: 'Agent',
        name: agentName
      }
    });

    await newLog.save();
    
    res.status(201).json({ success: true, message: 'Log added successfully', log: newLog });
  } catch (error) {
    console.error('Error adding escort log:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Edit an escort log
router.put('/escort/:logId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { logId } = req.params;
    const { category, content } = req.body;
    const agentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
      return res.status(400).json({ success: false, message: 'Invalid log ID format' });
    }

    if (!category || !content) {
      return res.status(400).json({ success: false, message: 'Category and content are required' });
    }

    // Find the log and verify it belongs to the agent
    const log = await EscortLog.findById(logId);
    
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    // Check if the agent is the one who created the log
    if (log.createdBy.id.toString() !== agentId.toString()) {
      return res.status(403).json({ success: false, message: 'You can only edit your own logs' });
    }

    // Update the log
    log.category = category;
    log.content = content;
    log.updatedAt = new Date();
    
    await log.save();
    
    res.json({ success: true, message: 'Log updated successfully', log });
  } catch (error) {
    console.error('Error updating escort log:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get logs for a user
router.get('/user/:userId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }

    const logs = await UserLog.find({ userId }).sort({ createdAt: -1 }).lean();
    
    // Populate agent names for logs
    const Agent = require('../models/Agent');
    for (let log of logs) {
      if (log.createdBy && log.createdBy.id) {
        try {
          const agent = await Agent.findById(log.createdBy.id).select('name agentId');
          if (agent) {
            log.createdBy.name = agent.name || agent.agentId;
          }
        } catch (err) {
          console.log('Could not find agent for log:', log._id);
        }
      }
    }
    
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error fetching user logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add a new log for a user
router.post('/user/:userId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { userId } = req.params;
    const { category, content } = req.body;
    const agentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }

    if (!category || !content) {
      return res.status(400).json({ success: false, message: 'Category and content are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get agent information to include name
    const Agent = require('../models/Agent');
    const agent = await Agent.findById(agentId).select('name agentId');
    const agentName = agent ? (agent.name || agent.agentId) : 'Unknown Agent';

    const newLog = new UserLog({
      userId,
      category,
      content,
      createdBy: {
        id: agentId,
        type: 'Agent',
        name: agentName
      }
    });

    await newLog.save();
    res.status(201).json({ success: true, message: 'Log added successfully', log: newLog });
  } catch (error) {
    console.error('Error adding user log:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Edit a user log
router.put('/user/:logId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { logId } = req.params;
    const { category, content } = req.body;
    const agentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
      return res.status(400).json({ success: false, message: 'Invalid log ID format' });
    }

    if (!category || !content) {
      return res.status(400).json({ success: false, message: 'Category and content are required' });
    }

    // Find the log and verify it belongs to the agent
    const log = await UserLog.findById(logId);
    
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    // Check if the agent is the one who created the log
    if (log.createdBy.id.toString() !== agentId.toString()) {
      return res.status(403).json({ success: false, message: 'You can only edit your own logs' });
    }

    // Update the log
    log.category = category;
    log.content = content;
    log.updatedAt = new Date();
    
    await log.save();
    
    res.json({ success: true, message: 'Log updated successfully', log });
  } catch (error) {
    console.error('Error updating user log:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete an escort log
router.delete('/escort/:logId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { logId } = req.params;
    const agentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
      return res.status(400).json({ success: false, message: 'Invalid log ID format' });
    }

    // Find the log and verify it belongs to the agent
    const log = await EscortLog.findById(logId);
    
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    // Check if the agent is the one who created the log
    if (log.createdBy.id.toString() !== agentId.toString()) {
      return res.status(403).json({ success: false, message: 'You can only delete your own logs' });
    }

    await EscortLog.findByIdAndDelete(logId);
    
    res.json({ success: true, message: 'Log deleted successfully' });
  } catch (error) {
    console.error('Error deleting escort log:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete a user log
router.delete('/user/:logId', isAuthenticated, isAgent, async (req, res) => {
  try {
    const { logId } = req.params;
    const agentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
      return res.status(400).json({ success: false, message: 'Invalid log ID format' });
    }

    // Find the log and verify it belongs to the agent
    const log = await UserLog.findById(logId);
    
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    // Check if the agent is the one who created the log
    if (log.createdBy.id.toString() !== agentId.toString()) {
      return res.status(403).json({ success: false, message: 'You can only delete your own logs' });
    }

    await UserLog.findByIdAndDelete(logId);
    
    res.json({ success: true, message: 'Log deleted successfully' });
  } catch (error) {
    console.error('Error deleting user log:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
