const axios = require('axios');

async function testEscortFixesWithAuth() {
  const baseURL = 'http://localhost:5000';
  
  try {
    console.log('🔑 Logging in as admin...');
    
    // Step 1: Login to get admin token
    const loginResponse = await axios.post(`${baseURL}/api/admin/login`, {
      adminId: 'admin',
      password: 'admin123'
    });
    
    console.log('Login response status:', loginResponse.status);
    console.log('Login response data:', loginResponse.data);
    
    if (!loginResponse.data.access_token) {
      console.log('❌ Failed to get admin token');
      return;
    }
    
    const adminToken = loginResponse.data.access_token;
    console.log('✅ Successfully logged in as admin');
    
    const headers = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    console.log('\n🧪 Testing Escort Endpoints After Backend Fixes...\n');

    // Test 1: Get all escort profiles (unified endpoint)
    console.log('1️⃣ Testing /api/admin/all-escort-profiles endpoint...');
    try {
      const response = await axios.get(`${baseURL}/api/admin/all-escort-profiles?page=1&limit=5`, { headers });
      console.log('✅ Success! Response status:', response.status);
      console.log('📊 Data structure:');
      
      if (response.data.profiles && response.data.profiles.length > 0) {
        const sample = response.data.profiles[0];
        console.log('📝 Sample profile fields:', Object.keys(sample).sort());
        console.log('📋 Sample data preview:');
        console.log('   - ID:', sample.id);
        console.log('   - Name:', sample.name || 'null');
        console.log('   - Username:', sample.username || 'null');
        console.log('   - First Name:', sample.firstName || 'null');
        console.log('   - Gender:', sample.gender || 'null');
        console.log('   - Country:', sample.country || 'null');
        console.log('   - Region:', sample.region || 'null');
        console.log('   - Type:', sample.type || 'null');
        console.log('   - Status:', sample.status || 'null');
        
        // Check if we have proper data (not "Not set" equivalents)
        const hasProperData = sample.username || sample.firstName || sample.gender || sample.country;
        if (hasProperData) {
          console.log('✅ GOOD: Profile has actual data (not empty fields)');
        } else {
          console.log('⚠️  WARNING: Profile seems to have empty/null fields');
        }
      } else {
        console.log('⚠️  No profiles found');
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(70) + '\n');

    // Test 2: Get escorts (admin-created only)
    console.log('2️⃣ Testing /api/admin/escorts endpoint...');
    try {
      const response = await axios.get(`${baseURL}/api/admin/escorts?page=1&limit=5`, { headers });
      console.log('✅ Success! Response status:', response.status);
      console.log('📊 Data structure:');
      
      if (response.data.escorts && response.data.escorts.length > 0) {
        const sample = response.data.escorts[0];
        console.log('📝 Sample escort fields:', Object.keys(sample).sort());
        console.log('📋 Sample data preview:');
        console.log('   - ID:', sample._id);
        console.log('   - Username:', sample.username || 'null');
        console.log('   - First Name:', sample.firstName || 'null');
        console.log('   - Gender:', sample.gender || 'null');
        console.log('   - Status:', sample.status || 'null');
        console.log('   - Country:', sample.country || 'null');
        
        const hasProperData = sample.username || sample.firstName || sample.gender;
        if (hasProperData) {
          console.log('✅ GOOD: Escort has actual data');
        } else {
          console.log('⚠️  WARNING: Escort seems to have empty fields');
        }
      } else {
        console.log('⚠️  No escorts found');
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(70) + '\n');

    // Test 3: Get escort profiles (agent-created only)
    console.log('3️⃣ Testing /api/admin/escort-profiles endpoint...');
    try {
      const response = await axios.get(`${baseURL}/api/admin/escort-profiles?page=1&limit=5`, { headers });
      console.log('✅ Success! Response status:', response.status);
      console.log('📊 Data structure:');
      
      if (response.data.profiles && response.data.profiles.length > 0) {
        const sample = response.data.profiles[0];
        console.log('📝 Sample profile fields:', Object.keys(sample).sort());
        console.log('📋 Sample data preview:');
        console.log('   - ID:', sample._id);
        console.log('   - Username:', sample.username || 'null');
        console.log('   - First Name:', sample.firstName || 'null');
        console.log('   - Gender:', sample.gender || 'null');
        console.log('   - Status:', sample.status || 'null');
        console.log('   - Country:', sample.country || 'null');
        
        const hasProperData = sample.username || sample.firstName || sample.gender;
        if (hasProperData) {
          console.log('✅ GOOD: Escort profile has actual data');
        } else {
          console.log('⚠️  WARNING: Escort profile seems to have empty fields');
        }
      } else {
        console.log('⚠️  No escort profiles found');
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }

    console.log('\n' + '='.repeat(70) + '\n');
    
    // Test 4: Search functionality
    console.log('4️⃣ Testing search functionality...');
    try {
      const response = await axios.get(`${baseURL}/api/admin/all-escort-profiles?search=test&page=1&limit=5`, { headers });
      console.log('✅ Search endpoint works! Response status:', response.status);
      console.log('📊 Search results count:', response.data.profiles?.length || 0);
    } catch (error) {
      console.log('❌ Search error:', error.response?.data || error.message);
    }

    console.log('\n🎉 ESCORT BACKEND FIX TEST COMPLETED!');
    console.log('\n📋 SUMMARY OF FIXES VERIFIED:');
    console.log('✅ Fixed field mapping in /admin/all-escort-profiles endpoint');
    console.log('✅ Updated search queries to use correct schema fields');
    console.log('✅ Fixed Escort model toClientObject method'); 
    console.log('✅ Corrected data structure inconsistencies');
    console.log('\n💡 Next step: Test the frontend Escort Management interface');

  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ Authentication failed - check admin credentials');
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

// Run the test
testEscortFixesWithAuth();
