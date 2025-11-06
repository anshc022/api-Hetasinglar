const express = require('express');
const router = express.Router();
const { testEmailConnection, sendOTPEmail, generateOTP } = require('../services/emailService');

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

module.exports = router;