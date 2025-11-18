const express = require('express');
const { exec } = require('child_process');
const router = express.Router();

// Get recent backend logs
router.get('/logs', async (req, res) => {
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

// Get system status
router.get('/status', async (req, res) => {
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