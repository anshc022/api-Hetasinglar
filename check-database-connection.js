const mongoose = require('mongoose');

// Load environment variables like the server does
const path = require('path');
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, '.env.production')
    : path.join(__dirname, '.env')
});

async function checkCurrentDatabase() {
  try {
    console.log('🌍 Current Environment:', process.env.NODE_ENV || 'development');
    console.log('📁 Using env file:', process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
    console.log('🔗 MongoDB URI:', process.env.MONGODB_URI);
    
    // Connect to the database
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log('💾 Database Name:', dbName);
    
    // Count escort profiles
    const EscortProfile = require('./models/EscortProfile');
    const escortCount = await EscortProfile.countDocuments();
    console.log('👥 Total Escort Profiles:', escortCount);
    
    // Check if any profiles have descriptions
    const withDescriptions = await EscortProfile.countDocuments({
      description: { $exists: true, $ne: '', $ne: null }
    });
    console.log('📝 Profiles with descriptions:', withDescriptions);
    
    // Show sample escort data
    const sampleEscort = await EscortProfile.findOne().select('username firstName description');
    if (sampleEscort) {
      console.log('🔍 Sample Escort:');
      console.log(`   Username: ${sampleEscort.username}`);
      console.log(`   Name: ${sampleEscort.firstName || 'N/A'}`);
      console.log(`   Description: ${sampleEscort.description ? 'Present' : 'Missing'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 Connection closed');
  }
}

checkCurrentDatabase();