const axios = require('axios');

const API_URL = 'http://localhost:5000/api/auth';

async function testRegistrationFlow() {
  try {
    console.log('🧪 Testing OTP Registration Flow...\n');

    // Step 1: Register with email verification
    console.log('📧 Step 1: Registering user with email verification...');
    const testEmail = 'test@example.com';
    const testUsername = 'testuser123';
    
    const registerResponse = await axios.post(`${API_URL}/register`, {
      username: testUsername,
      email: testEmail,
      password: 'testpass123',
      dateOfBirth: '1990-01-01',
      sex: 'male'
    });

    console.log('✅ Registration response:', registerResponse.data);
    
    if (registerResponse.data.requiresVerification) {
      console.log('🔐 User created, email verification required!');
      console.log('📧 OTP should be sent to:', testEmail);
      console.log('📁 Check your email for the verification code.\n');
      
      // Step 2: Try to login without verification (should fail)
      console.log('🚫 Step 2: Trying to login without verification...');
      try {
        await axios.post(`${API_URL}/login`, {
          username: testUsername,
          password: 'testpass123'
        });
        console.log('❌ Login should have failed!');
      } catch (loginError) {
        if (loginError.response && loginError.response.status === 403) {
          console.log('✅ Login correctly blocked:', loginError.response.data.message);
        } else {
          console.log('❓ Unexpected login error:', loginError.message);
        }
      }
      
      console.log('\n📝 To complete testing:');
      console.log('1. Check your email for the OTP');
      console.log('2. Use POST /auth/verify-otp with userId and otp');
      console.log('3. Then try POST /auth/login again');
      console.log('\nUserId for verification:', registerResponse.data.userId);
    }
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Registration error:', error.response.data);
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
}

// Only run if axios is available
if (require.resolve('axios')) {
  testRegistrationFlow();
} else {
  console.log('❌ axios not installed. Please run: npm install axios');
}
