const express = require('express');
const { exec } = require('child_process');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Logs authentication credentials
const LOGS_PASSWORD = 'Hetasinglar@009';
const JWT_SECRET = process.env.JWT_SECRET || 'logs-secret-key-hetasinglar-2025';

// Middleware to verify logs authentication
const verifyLogsAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'logs-access') {
      return res.status(401).json({ error: 'Invalid token purpose.' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// Authentication endpoint for logs access
router.post('/auth-logs', (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password required.' 
      });
    }
    
    if (password !== LOGS_PASSWORD) {
      // Add small delay to prevent brute force
      setTimeout(() => {
        res.status(401).json({ 
          success: false, 
          error: 'Invalid password.' 
        });
      }, 1000);
      return;
    }
    
    // Generate JWT token valid for 24 hours
    const token = jwt.sign(
      { 
        purpose: 'logs-access',
        timestamp: Date.now() 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      success: true, 
      token: token,
      message: 'Authentication successful.' 
    });
    
  } catch (error) {
    console.error('Logs auth error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Authentication server error.' 
    });
  }
});

// Get recent backend logs (protected)
router.get('/logs', verifyLogsAuth, async (req, res) => {
  try {
    const lines = req.query.lines || '50';
    const filter = req.query.filter || '';
    
    // Get recent logs from systemd journal
    let command = `journalctl -u hetasinglar-backend -n ${lines} --no-pager --output=short-iso`;
    
    if (filter) {
      command += ` | grep -i "${filter.replace(/"/g, '\\"')}"`;
    }
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Error fetching logs:', error);
        return res.status(500).json({
          error: 'Failed to fetch logs',
          message: error.message
        });
      }
      
      // Parse logs and format them
      const logLines = stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          // Remove systemd metadata and keep the actual log message
          const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}\s+\S+\s+\S+\[\d+\]:\s*(.+)/);
          return match ? match[1] : line;
        })
        .reverse(); // Show newest first
      
      res.json({
        logs: logLines,
        count: logLines.length,
        timestamp: new Date().toISOString()
      });
    });
    
  } catch (error) {
    console.error('Logs API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get system status (protected)
router.get('/status', verifyLogsAuth, async (req, res) => {
  try {
    exec('systemctl is-active hetasinglar-backend', (error, stdout, stderr) => {
      const isActive = stdout.trim() === 'active';
      
      // Get basic system info
      exec('uptime && free -m', (error2, stdout2, stderr2) => {
        res.json({
          service: {
            status: isActive ? 'active' : 'inactive',
            name: 'hetasinglar-backend'
          },
          system: {
            uptime: stdout2.split('\n')[0] || 'Unknown',
            memory: stdout2.split('\n')[1] || 'Unknown'
          },
          timestamp: new Date().toISOString()
        });
      });
    });
    
  } catch (error) {
    console.error('Status API error:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    });
  }
});

module.exports = router;