const mongoose = require('mongoose');
const path = require('path');

// Test function for database connection
async function testDatabaseConnection(envFile, connectionName) {
  console.log(`\n🔍 Testing ${connectionName} database connection...`);
  
  // Load the appropriate environment file
  require('dotenv').config({
    path: path.join(__dirname, envFile)
  });
  
  if (!process.env.MONGODB_URI) {
    console.error(`❌ MONGODB_URI not found in ${envFile}`);
    return false;
  }
  
  console.log(`📁 Using: ${envFile}`);
  console.log(`🔗 Connection string: ${process.env.MONGODB_URI.replace(/\/\/.*:.*@/, '//***:***@')}`);
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
    });
    
    console.log(`✅ ${connectionName} database connected successfully!`);
    
    // Test basic operations
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`📊 Available collections: ${collections.map(c => c.name).join(', ')}`);
    
    // Check if we can perform a simple query
    const stats = await mongoose.connection.db.stats();
    console.log(`📈 Database stats: ${stats.collections} collections, ${stats.documents} documents`);
    
    await mongoose.disconnect();
    console.log(`✅ ${connectionName} database connection test completed successfully`);
    return true;
    
  } catch (error) {
    console.error(`❌ ${connectionName} database connection failed:`, error.message);
    await mongoose.disconnect();
    return false;
  }
}

// Main test function
async function main() {
  console.log('🚀 Starting database connection tests...\n');
  
  // Test local database
  const localResult = await testDatabaseConnection('.env', 'LOCAL');
  
  // Test production database
  const prodResult = await testDatabaseConnection('.env.production', 'PRODUCTION');
  
  console.log('\n📋 Test Results Summary:');
  console.log(`Local Database: ${localResult ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`Production Database: ${prodResult ? '✅ WORKING' : '❌ FAILED'}`);
  
  if (localResult && prodResult) {
    console.log('\n🎉 All database connections are working correctly!');
  } else {
    console.log('\n⚠️  Some database connections failed. Please check the details above.');
  }
}

main().catch(console.error);