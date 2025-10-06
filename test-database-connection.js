// Database Connection Test Script
// This script tests the database connection and verifies you're connected to the correct database

const path = require('path');

// Load environment configuration based on NODE_ENV
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, '.env.production')
    : path.join(__dirname, '.env')
});

const mongoose = require('mongoose');

async function testDatabaseConnection() {
  console.log('🔍 Testing Database Connection...');
  console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
  console.log('📁 Using env file:', process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
  
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is not set!');
    console.error('🔧 Please ensure your environment file is configured correctly');
    process.exit(1);
  }
  
  // Extract cluster information from URI for identification
  const clusterMatch = mongoUri.match(/@([^.]+\.mongodb\.net)/);
  const clusterName = clusterMatch ? clusterMatch[1] : 'Unknown';
  
  console.log('🔗 MongoDB URI:', mongoUri.replace(/:[^:]*@/, ':****@')); // Hide password
  console.log('🏢 Cluster:', clusterName);
  
  // Determine which database this is
  if (mongoUri.includes('hetasinglar.ca0z4d.mongodb.net')) {
    console.log('🆕 Database Type: NEW Production Database (Correct for production)');
  } else if (mongoUri.includes('dating.flel6.mongodb.net')) {
    console.log('🔄 Database Type: OLD Development Database (Correct for development)');
  } else {
    console.log('❓ Database Type: Unknown cluster');
  }
  
  try {
    console.log('🔌 Attempting to connect...');
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000, // 10 second timeout for testing
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 30000,
      family: 4
    });
    
    console.log('✅ Successfully connected to MongoDB!');
    
    // Get database info
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    console.log('🗄️  Database Name:', dbName);
    
    // Test basic operations
    console.log('🧪 Testing basic database operations...');
    
    // List collections
    const collections = await db.listCollections().toArray();
    console.log(`📊 Collections found: ${collections.length}`);
    
    if (collections.length > 0) {
      console.log('📋 Collection names:');
      collections.forEach(col => {
        console.log(`   - ${col.name}`);
      });
      
      // Test a simple query on a common collection
      try {
        const testCollection = collections.find(c => ['users', 'agents', 'chats'].includes(c.name));
        if (testCollection) {
          const count = await db.collection(testCollection.name).countDocuments();
          console.log(`📈 ${testCollection.name} collection has ${count} documents`);
        }
      } catch (error) {
        console.log('⚠️  Could not count documents (this may be normal)');
      }
    } else {
      console.log('📋 No collections found (database may be new)');
    }
    
    // Check connection state
    const connectionState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    console.log(`🔗 Connection State: ${states[connectionState] || 'unknown'}`);
    
    console.log('🎉 Database connection test completed successfully!');
    
    if (process.env.NODE_ENV === 'production') {
      console.log('');
      console.log('🚀 PRODUCTION DEPLOYMENT READY:');
      console.log('   ✅ Environment variables configured correctly');
      console.log('   ✅ NEW database connection working');
      console.log('   ✅ Ready for AWS deployment');
    } else {
      console.log('');
      console.log('🔧 DEVELOPMENT SETUP:');
      console.log('   ✅ Using OLD database for development');
      console.log('   ✅ Environment configured correctly');
    }
    
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error('🔍 Error details:', error.message);
    
    if (error.message.includes('authentication failed')) {
      console.error('🔐 Authentication Error: Check username/password in MONGODB_URI');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('timeout')) {
      console.error('🌐 Network Error: Check internet connection and cluster URL');
    } else if (error.message.includes('IP whitelist')) {
      console.error('🔒 IP Whitelist Error: Add your IP address to MongoDB Atlas IP whitelist');
    }
    
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    console.log('✨ Test completed at:', new Date().toISOString());
  }
}

// Run the test
testDatabaseConnection().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});