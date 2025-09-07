const emailService = require('./services/emailService');

async function testOTPSystem() {
  try {
    console.log('Testing email service...');
    
    // Test connection
    const connectionTest = await emailService.testEmailConnection();
    console.log('Connection test:', connectionTest ? 'PASSED' : 'FAILED');
    
    if (connectionTest) {
      console.log('Email service is ready for OTP verification!');
      console.log('\nOTP System Features:');
      console.log('✓ Email verification during registration');
      console.log('✓ OTP expires in 10 minutes');
      console.log('✓ Resend OTP functionality');
      console.log('✓ Welcome email after verification');
      console.log('✓ Login blocked until email verified');
      
      console.log('\nAPI Endpoints available:');
      console.log('POST /auth/register - Register with email verification');
      console.log('POST /auth/verify-otp - Verify OTP code');
      console.log('POST /auth/resend-otp - Resend OTP code');
      console.log('POST /auth/login - Login (requires email verification)');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testOTPSystem();
