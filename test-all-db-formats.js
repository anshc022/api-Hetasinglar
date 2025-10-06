#!/usr/bin/env node

/**
 * Test Multiple MongoDB Connection Formats
 * Tests various cluster configurations for new credentials
 */

const mongoose = require('mongoose');

// Different possible connection formats
const TEST_URLS = [
  // Original cluster with new credentials
  'mongodb+srv://HetaSinglar:HetaSinglar-0099@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority',
  
  // URL-encoded password (in case special characters need encoding)
  'mongodb+srv://HetaSinglar:HetaSinglar-0099@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority',
  
  // Different database name
  'mongodb+srv://HetaSinglar:HetaSinglar-0099@dating.flel6.mongodb.net/HetaSinglar?retryWrites=true&w=majority',
  
  // Alternative cluster naming
  'mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority',
  
  // New cluster format
  'mongodb+srv://HetaSinglar:HetaSinglar-0099@cluster0.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority'
];

async function testMultipleConnections() {
  console.log('\n🔍 TESTING MULTIPLE CONNECTION FORMATS');
  console.log('═'.repeat(60));
  console.log('👤 Username: HetaSinglar');
  console.log('🔑 Password: HetaSinglar-0099');
  console.log('');

  for (let i = 0; i < TEST_URLS.length; i++) {
    const url = TEST_URLS[i];
    console.log(`${i + 1}️⃣ Testing connection format ${i + 1}:`);
    console.log(`   🌐 ${url.replace(/HetaSinglar-0099/, '***')}`);
    
    try {
      await mongoose.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 8000, // 8 second timeout
        connectTimeoutMS: 8000,
      });

      console.log('   ✅ SUCCESS: Connection established!');
      
      // Quick database test
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      console.log(`   📊 Found ${collections.length} collections`);
      
      if (collections.length > 0) {
        console.log('   📁 Collections:', collections.map(c => c.name).join(', '));
      }

      console.log('   🎉 THIS CONNECTION WORKS!');
      console.log('');
      
      await mongoose.disconnect();
      return { success: true, url, collections: collections.length };

    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
      
      if (error.code === 8000) {
        console.log('   💭 Reason: Authentication failed');
      } else if (error.code === 'ENOTFOUND') {
        console.log('   💭 Reason: Cluster not found');
      } else {
        console.log(`   💭 Reason: ${error.code || 'Unknown error'}`);
      }
      
      try {
        await mongoose.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
    
    console.log('');
  }

  console.log('❌ ALL CONNECTION ATTEMPTS FAILED');
  console.log('');
  console.log('🔧 POSSIBLE ISSUES:');
  console.log('1. ❌ Credentials are incorrect');
  console.log('2. ❌ Database user not created properly');
  console.log('3. ❌ Database user lacks permissions');
  console.log('4. ❌ IP address not whitelisted');
  console.log('5. ❌ Different cluster/database name');
  console.log('');
  console.log('💡 NEXT STEPS:');
  console.log('1. Double-check the username and password in MongoDB Atlas');
  console.log('2. Verify the database user has "Atlas Admin" or "readWrite" permissions');
  console.log('3. Check Network Access settings (IP whitelist)');
  console.log('4. Confirm the correct cluster hostname');
  
  return { success: false };
}

// Run the test
testMultipleConnections()
  .then(result => {
    if (result.success) {
      console.log('🎉 SUCCESS! Found working connection.');
    } else {
      console.log('❌ No working connections found.');
    }
    process.exit(result.success ? 0 : 1);
  })
  .catch(console.error);