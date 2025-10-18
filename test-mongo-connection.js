const mongoose = require('mongoose');

// Test MongoDB connection with different URIs
const TEST_URIS = [
  // Current production URI
  'mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.ca0z4d.mongodb.net/hetasinglar?retryWrites=true&w=majority',
  // Backup/alternative URIs (if any)
  // Add any other MongoDB URIs you might have
];

async function testMongoConnection() {
  for (const [index, uri] of TEST_URIS.entries()) {
    console.log(`\n🔍 Testing URI ${index + 1}:`);
    console.log('URI:', uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')); // Hide credentials in logs
    
    try {
      console.log('🔌 Connecting...');
      await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxIdleTimeMS: 30000,
        family: 4
      });
      
      console.log('✅ Connection successful!');
      
      // Test database operations
      const dbName = mongoose.connection.db.databaseName;
      console.log('💾 Database:', dbName);
      
      // List collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('📂 Collections found:', collections.length);
      
      await mongoose.disconnect();
      console.log('🔒 Disconnected');
      
      // If successful, we found a working URI
      console.log('\n🎉 SUCCESS: This URI works!');
      return;
      
    } catch (error) {
      console.log('❌ Connection failed:', error.message);
      
      if (error.message.includes('Authentication failed')) {
        console.log('💡 This is an authentication error - check username/password');
      } else if (error.message.includes('ENOTFOUND')) {
        console.log('💡 This is a network error - check cluster URL');
      } else if (error.message.includes('timed out')) {
        console.log('💡 This is a timeout error - check network access');
      }
      
      // Ensure disconnection
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  }
  
  console.log('\n❌ All URIs failed - check MongoDB Atlas configuration');
}

testMongoConnection().catch(console.error);