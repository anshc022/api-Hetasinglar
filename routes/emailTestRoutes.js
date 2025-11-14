const express = require('express');
const router = express.Router();
const { testEmailConnection, sendOTPEmail, generateOTP, sendMessageNotification } = require('../services/emailService');

// Test email connection
router.get('/verify', async (req, res) => {
  try {
    console.log('Testing email connection...');
    const isReady = await testEmailConnection();
    
    if (isReady) {
      res.status(200).json({
        success: true,
        message: 'Email service is configured correctly and ready to send emails',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Email service configuration failed',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email service verification failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test sending actual OTP email
router.post('/test-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    console.log('Testing OTP email send to:', email);
    const otp = generateOTP();
    const success = await sendOTPEmail(email, otp, 'Test User');
    
    if (success) {
      res.status(200).json({
        success: true,
        message: 'Test OTP email sent successfully',
        otp: otp, // In production, don't return the OTP
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test OTP email',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Test OTP email error:', error);
    res.status(500).json({
      success: false,
      message: 'Test OTP email failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test message notification email
router.post('/test-message-notification', async (req, res) => {
  try {
    const { email, username, fromName, message } = req.body;
    
    if (!email || !username) {
      return res.status(400).json({
        success: false,
        message: 'Email and username are required'
      });
    }

    console.log('Testing message notification email to:', email);
    const success = await sendMessageNotification(
      email,
      username,
      fromName || 'Test Escort',
      message || 'This is a test message notification from Hetasinglar',
      process.env.FRONTEND_URL || 'https://hetasinglar.se'
    );
    
    if (success) {
      res.status(200).json({
        success: true,
        message: 'Test message notification email sent successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test message notification email',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Test message notification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Test message notification email failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get email configuration info (for debugging)
router.get('/config', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      config: {
        host: process.env.SMTP_HOST || 'Not configured',
        port: process.env.SMTP_PORT || 'Not configured',
        user: process.env.EMAIL_USER || 'Not configured',
        hasPassword: !!process.env.EMAIL_PASS,
        frontendUrl: process.env.FRONTEND_URL || 'Not configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Email config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get email configuration',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;