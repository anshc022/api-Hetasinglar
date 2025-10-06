#!/usr/bin/env node

/**
 * Test MongoDB Connection with New Credentials
 * Tests: HetaSinglar / HetaSinglar-0099
 */

const mongoose = require('mongoose');

// New MongoDB connection string with new credentials
const NEW_MONGODB_URI = 'mongodb+srv://HetaSinglar:HetaSinglar-0099@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority';

async function testNewDatabaseConnection() {
  console.log('\n🧪 TESTING NEW MONGODB CONNECTION');
  console.log('═'.repeat(50));
  console.log('📋 Testing credentials: HetaSinglar / HetaSinglar-0099');
  console.log('🌐 Cluster: dating.flel6.mongodb.net');
  console.log('🗄️  Database: hetasinglar');
  console.log('');

  try {
    console.log('1️⃣ Attempting connection...');
    
    await mongoose.connect(NEW_MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      connectTimeoutMS: 10000,
    });

    console.log('✅ SUCCESS: Connected to MongoDB Atlas!');
    console.log('');

    // Test basic operations
    console.log('2️⃣ Testing database operations...');
    
    // Get database info
    const db = mongoose.connection.db;
    const admin = db.admin();
    
    // List collections
    console.log('📊 Listing collections...');
    const collections = await db.listCollections().toArray();
    console.log(`   Found ${collections.length} collections:`);
    collections.forEach(col => {
      console.log(`   📁 ${col.name}`);
    });
    console.log('');

    // Test a simple query (if collections exist)
    if (collections.length > 0) {
      console.log('3️⃣ Testing sample queries...');
      
      // Try to find users collection
      const usersColl = collections.find(c => c.name === 'users');
      if (usersColl) {
        const usersCount = await db.collection('users').countDocuments();
        console.log(`   👤 Users collection: ${usersCount} documents`);
      }

      // Try to find chats collection
      const chatsColl = collections.find(c => c.name === 'chats');
      if (chatsColl) {
        const chatsCount = await db.collection('chats').countDocuments();
        console.log(`   💬 Chats collection: ${chatsCount} documents`);
      }

      // Try to find agents collection
      const agentsColl = collections.find(c => c.name === 'agents');
      if (agentsColl) {
        const agentsCount = await db.collection('agents').countDocuments();
        console.log(`   🕵️ Agents collection: ${agentsCount} documents`);
      }
    }

    console.log('');
    console.log('4️⃣ Testing write permissions...');
    
    // Test write operation
    const testCollection = db.collection('connection_test');
    const testDoc = {
      test: true,
      timestamp: new Date(),
      message: 'Connection test successful'
    };
    
    await testCollection.insertOne(testDoc);
    console.log('✅ Write test: SUCCESS');
    
    // Clean up test document
    await testCollection.deleteOne({ test: true });
    console.log('✅ Cleanup: SUCCESS');

    console.log('');
    console.log('🎉 DATABASE CONNECTION TEST COMPLETE!');
    console.log('═'.repeat(50));
    console.log('✅ Connection: WORKING');
    console.log('✅ Authentication: SUCCESSFUL'); 
    console.log('✅ Read permissions: VERIFIED');
    console.log('✅ Write permissions: VERIFIED');
    console.log('✅ Database: hetasinglar accessible');
    console.log('');
    console.log('👍 Your new MongoDB credentials are working perfectly!');

  } catch (error) {
    console.log('');
    console.log('❌ DATABASE CONNECTION FAILED!');
    console.log('═'.repeat(50));
    console.error('🚨 Error details:');
    console.error(`   Code: ${error.code || 'Unknown'}`);
    console.error(`   Name: ${error.name || 'Unknown'}`);
    console.error(`   Message: ${error.message}`);
    
    if (error.code === 8000) {
      console.log('');
      console.log('💡 TROUBLESHOOTING TIPS:');
      console.log('   - Check if username/password are correct');
      console.log('   - Verify database user has proper permissions');
      console.log('   - Ensure IP address is whitelisted in Atlas');
    }
    
    if (error.code === 'ENOTFOUND') {
      console.log('');
      console.log('💡 TROUBLESHOOTING TIPS:');
      console.log('   - Check internet connection');
      console.log('   - Verify cluster hostname is correct');
      console.log('   - Check if cluster is running');
    }

    console.log('');
    console.log('🔧 SUGGESTED ACTIONS:');
    console.log('1. Verify credentials in MongoDB Atlas');
    console.log('2. Check network access settings');
    console.log('3. Ensure cluster is active and running');
    
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the test
testNewDatabaseConnection().catch(console.error);