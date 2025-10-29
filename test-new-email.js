const { testEmailConnection, sendOTPEmail } = require('./services/emailService');
require('dotenv').config({ path: '.env.production' });

console.log('🧪 Testing New Email Configuration');
console.log('==================================');
console.log('SMTP Host:', process.env.SMTP_HOST);
console.log('SMTP Port:', process.env.SMTP_PORT);
console.log('Email User:', process.env.EMAIL_USER);
console.log('Email Pass:', process.env.EMAIL_PASS ? '***configured***' : 'NOT SET');
console.log('');

async function testNewEmailConfig() {
  try {
    // Test connection
    console.log('1. Testing SMTP connection...');
    const connectionTest = await testEmailConnection();
    
    if (connectionTest) {
      console.log('✅ SMTP connection successful!');
      
      // Test sending OTP email
      console.log('\n2. Testing OTP email send...');
      const testEmail = 'anshc022@gmail.com'; // Your test email
      const testOTP = '123456';
      const testUsername = 'Test User';
      
      const emailSent = await sendOTPEmail(testEmail, testOTP, testUsername);
      
      if (emailSent) {
        console.log('✅ OTP email sent successfully!');
        console.log(`📧 Check ${testEmail} for the test OTP email`);
      } else {
        console.log('❌ Failed to send OTP email');
      }
    } else {
      console.log('❌ SMTP connection failed');
    }
    
  } catch (error) {
    console.error('❌ Error testing email configuration:', error);
  }
}

testNewEmailConfig();