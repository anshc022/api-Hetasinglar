const express = require('express');
const emailService = require('./services/emailService');
const app = express();

app.use(express.json());

// Test email notification route
app.post('/test-notification', async (req, res) => {
  try {
    console.log('Testing email notification...');
    
    const result = await emailService.sendMessageNotification({
      to: 'contact@hetasinglar.se',
      customerName: 'Test Customer',
      agentName: 'Test Agent',
      message: 'Hello, this is a test message to verify notifications work!'
    });

    console.log('Email notification result:', result);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Email notification failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`✅ Test server running on port ${PORT}`);
  console.log(`📧 Test the notification: POST http://localhost:${PORT}/test-notification`);
});