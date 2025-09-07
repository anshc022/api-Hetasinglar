const axios = require('axios');

// Test the complete OTP registration flow
async function testOTPRegistrationFlow() {
  const baseURL = 'http://localhost:5000';
  const testUser = {
    username: 'testuser_otp_' + Math.random().toString(36).substr(2, 9),
    email: 'anshc022@gmail.com', // Using the configured email
    password: 'TestPassword123!'
  };

  console.log('🧪 Testing OTP Registration Flow...\n');
  console.log('Test User:', testUser);

  try {
    // Step 1: Register the user (should trigger OTP email)
    console.log('\n📝 Step 1: Registering user...');
    const registerResponse = await axios.post(`${baseURL}/api/auth/register`, testUser);
    
    if (registerResponse.data.message.includes('OTP')) {
      console.log('✅ Registration successful - OTP email sent!');
      console.log('Response:', registerResponse.data.message);
      
      // Extract user ID from response if available
      const userId = registerResponse.data.userId || registerResponse.data.user?.id;
      console.log('User ID:', userId);
      
      // Step 2: Simulate OTP entry (normally user would get this from email)
      console.log('\n📧 Step 2: Check your email for the OTP code');
      console.log('⏰ You have 10 minutes to verify the OTP');
      console.log('🔗 Use the /api/auth/verify-otp endpoint to verify');
      
      // Example verification payload structure
      console.log('\nExample verification request:');
      console.log('POST /api/auth/verify-otp');
      console.log('Body:', {
        email: testUser.email,
        otp: '123456' // Replace with actual OTP from email
      });
      
    } else {
      console.log('❌ Unexpected registration response:', registerResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 400) {
      console.log('\n💡 This might be expected if user already exists');
    }
  }
}

// Test the resend OTP functionality
async function testResendOTP() {
  const baseURL = 'http://localhost:5000';
  const testEmail = 'anshc022@gmail.com';

  console.log('\n🔄 Testing Resend OTP...\n');

  try {
    const resendResponse = await axios.post(`${baseURL}/api/auth/resend-otp`, {
      email: testEmail
    });
    
    console.log('✅ Resend OTP successful!');
    console.log('Response:', resendResponse.data.message);
    
  } catch (error) {
    console.error('❌ Resend failed:', error.response?.data || error.message);
  }
}

// Run the tests
async function runTests() {
  console.log('🚀 Starting OTP System Tests...\n');
  
  await testOTPRegistrationFlow();
  
  // Wait a bit before testing resend
  setTimeout(async () => {
    await testResendOTP();
    
    console.log('\n✨ Tests completed!');
    console.log('📧 Check your email (anshc022@gmail.com) for OTP codes');
    console.log('🔗 Frontend URL: http://localhost:3000/register');
    console.log('🔗 Frontend Login URL: http://localhost:3000/login');
    
  }, 2000);
}

runTests();
