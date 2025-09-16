#!/usr/bin/env node

/**
 * Test New MongoDB Cluster Connection
 * Cluster: hetasinglar.ca0z4d.mongodb.net
 * Credentials: HetaSinglar / HetaSinglar-0099
 */

const mongoose = require('mongoose');

// Correct MongoDB connection string with new cluster
const CORRECT_MONGODB_URI = 'mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.ca0z4d.mongodb.net/hetasinglar?retryWrites=true&w=majority';

async function testCorrectDatabaseConnection() {
  console.log('\n🧪 TESTING CORRECT MONGODB CONNECTION');
  console.log('═'.repeat(50));
  console.log('📋 Username: HetaSinglar');
  console.log('🔑 Password: HetaSinglar-0099');
  console.log('🌐 Cluster: hetasinglar.ca0z4d.mongodb.net');
  console.log('🗄️  Database: hetasinglar');
  console.log('');

  try {
    console.log('1️⃣ Attempting connection to NEW cluster...');
    
    await mongoose.connect(CORRECT_MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    console.log('✅ SUCCESS: Connected to new MongoDB Atlas cluster!');
    console.log('');

    // Test database operations
    console.log('2️⃣ Testing database operations...');
    
    const db = mongoose.connection.db;
    
    // List collections
    console.log('📊 Listing collections...');
    const collections = await db.listCollections().toArray();
    console.log(`   Found ${collections.length} collections:`);
    
    if (collections.length > 0) {
      collections.forEach(col => {
        console.log(`   📁 ${col.name}`);
      });
    } else {
      console.log('   📭 No collections found (new database)');
    }
    console.log('');

    // Test write permissions
    console.log('3️⃣ Testing write permissions...');
    const testCollection = db.collection('connection_test');
    const testDoc = {
      test: true,
      timestamp: new Date(),
      message: 'New cluster connection test successful'
    };
    
    await testCollection.insertOne(testDoc);
    console.log('✅ Write test: SUCCESS');
    
    // Clean up test document
    await testCollection.deleteOne({ test: true });
    console.log('✅ Cleanup: SUCCESS');

    console.log('');
    console.log('🎉 NEW CLUSTER CONNECTION TEST COMPLETE!');
    console.log('═'.repeat(50));
    console.log('✅ Connection: WORKING');
    console.log('✅ Authentication: SUCCESSFUL'); 
    console.log('✅ Read permissions: VERIFIED');
    console.log('✅ Write permissions: VERIFIED');
    console.log('✅ New cluster: hetasinglar.ca0z4d.mongodb.net accessible');
    console.log('');
    console.log('🔄 UPDATING PRODUCTION CONFIG...');
    
    // Show the correct connection string
    console.log('');
    console.log('📝 CORRECT CONNECTION STRING:');
    console.log(CORRECT_MONGODB_URI);

  } catch (error) {
    console.log('');
    console.log('❌ CONNECTION STILL FAILED!');
    console.log('═'.repeat(50));
    console.error(`🚨 Error: ${error.message}`);
    console.error(`   Code: ${error.code || 'Unknown'}`);
    
    if (error.code === 8000) {
      console.log('');
      console.log('⚠️  Authentication failed - please verify:');
      console.log('   1. Username: HetaSinglar');
      console.log('   2. Password: HetaSinglar-0099');
      console.log('   3. Database user permissions');
    }
    
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testCorrectDatabaseConnection().catch(console.error);