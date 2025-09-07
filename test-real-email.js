const axios = require('axios');

const API_URL = 'http://localhost:5000/api/auth';

async function testWithRealEmail() {
  try {
    console.log('🧪 Testing with anshc022@gmail.com...\n');

    // Register with your email
    console.log('📧 Registering with real email...');
    const registerResponse = await axios.post(`${API_URL}/register`, {
      username: 'realtest123',
      email: 'anshc022@gmail.com',
      password: 'testpass123',
      dateOfBirth: '1990-01-01',
      sex: 'male'
    });

    console.log('✅ Registration response:', registerResponse.data);
    console.log('\n📧 OTP has been sent to anshc022@gmail.com');
    console.log('📁 Check your inbox for the verification email with OTP');
    console.log('\n📝 To verify:');
    console.log(`curl -X POST "${API_URL}/verify-otp" -H "Content-Type: application/json" -d '{"userId":"${registerResponse.data.userId}","otp":"YOUR_OTP_HERE"}'`);
    
  } catch (error) {
    if (error.response) {
      console.log('Response:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

testWithRealEmail();
