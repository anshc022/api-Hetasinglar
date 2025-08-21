const axios = require('axios');

// Test script to verify escort endpoints are working correctly after fixes
async function testEscortEndpoints() {
  const baseURL = 'http://localhost:5000/admin';
  
  // You'll need to replace this with a valid admin JWT token
  const adminToken = 'your-admin-jwt-token-here';
  
  const headers = {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🧪 Testing Escort Endpoints After Backend Fixes...\n');

    // Test 1: Get all escort profiles (unified endpoint)
    console.log('1. Testing /admin/all-escort-profiles endpoint...');
    try {
      const response = await axios.get(`${baseURL}/all-escort-profiles?page=1&limit=5`, { headers });
      console.log('✅ Success! Response status:', response.status);
      console.log('📊 Data structure:');
      
      if (response.data.profiles && response.data.profiles.length > 0) {
        const sample = response.data.profiles[0];
        console.log('Sample profile fields:', Object.keys(sample));
        console.log('Sample data preview:');
        console.log('- ID:', sample.id);
        console.log('- Name:', sample.name);
        console.log('- Username:', sample.username);
        console.log('- First Name:', sample.firstName);
        console.log('- Gender:', sample.gender);
        console.log('- Country:', sample.country);
        console.log('- Type:', sample.type);
      } else {
        console.log('⚠️  No profiles found');
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Get escorts (admin-created only)
    console.log('2. Testing /admin/escorts endpoint...');
    try {
      const response = await axios.get(`${baseURL}/escorts?page=1&limit=5`, { headers });
      console.log('✅ Success! Response status:', response.status);
      console.log('📊 Data structure:');
      
      if (response.data.escorts && response.data.escorts.length > 0) {
        const sample = response.data.escorts[0];
        console.log('Sample escort fields:', Object.keys(sample));
        console.log('Sample data preview:');
        console.log('- ID:', sample._id);
        console.log('- Username:', sample.username);
        console.log('- First Name:', sample.firstName);
        console.log('- Gender:', sample.gender);
        console.log('- Status:', sample.status);
      } else {
        console.log('⚠️  No escorts found');
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Get escort profiles (agent-created only)
    console.log('3. Testing /admin/escort-profiles endpoint...');
    try {
      const response = await axios.get(`${baseURL}/escort-profiles?page=1&limit=5`, { headers });
      console.log('✅ Success! Response status:', response.status);
      console.log('📊 Data structure:');
      
      if (response.data.profiles && response.data.profiles.length > 0) {
        const sample = response.data.profiles[0];
        console.log('Sample profile fields:', Object.keys(sample));
        console.log('Sample data preview:');
        console.log('- ID:', sample._id);
        console.log('- Username:', sample.username);
        console.log('- First Name:', sample.firstName);
        console.log('- Gender:', sample.gender);
        console.log('- Status:', sample.status);
      } else {
        console.log('⚠️  No escort profiles found');
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Instructions for running the test
console.log(`
🔧 ESCORT BACKEND FIX TEST SCRIPT
==================================

To run this test:
1. Make sure the backend server is running on port 5000
2. Get a valid admin JWT token from login
3. Replace 'your-admin-jwt-token-here' with the actual token
4. Run: node test-escort-fix.js

FIXES IMPLEMENTED:
✅ Fixed field mapping in /admin/all-escort-profiles endpoint
✅ Updated search queries to use correct schema fields  
✅ Fixed Escort model toClientObject method
✅ Corrected data structure inconsistencies

Expected Results:
- All endpoints should return data with proper field names
- No more "Not set" values due to field mismatches
- Unified data structure across admin-created and agent-created profiles
`);

// Simple test without authentication to check server connectivity
async function testServerConnectivity() {
  try {
    console.log('🔌 Testing server connectivity...');
    const response = await axios.get('http://localhost:5000/admin/test', {
      validateStatus: () => true // Accept any status code
    });
    console.log('📡 Server response status:', response.status);
    if (response.status === 401) {
      console.log('✅ Server is running - got expected 401 (authentication required)');
      return true;
    } else if (response.status === 404) {
      console.log('✅ Server is running - got 404 (endpoint not found, but server responds)');
      return true;
    } else {
      console.log('✅ Server is running - got status:', response.status);
      return true;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server is not running on port 5000');
      return false;
    } else {
      console.log('✅ Server is running - connection established');
      return true;
    }
  }
}

// Run connectivity test first
testServerConnectivity().then(isConnected => {
  if (isConnected) {
    console.log('\n📝 To test escort endpoints:');
    console.log('1. Get admin token from login');
    console.log('2. Replace "your-admin-jwt-token-here" with actual token');
    console.log('3. Uncomment the testEscortEndpoints() call below');
    console.log('\n// testEscortEndpoints();');
  }
});

// Uncomment the line below and add a valid token to run the test
// testEscortEndpoints();

module.exports = testEscortEndpoints;
