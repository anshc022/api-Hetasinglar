const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');

// Force production environment to connect to production database
process.env.NODE_ENV = 'production';

// Load environment variables for production
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '.env.production')
});

const sampleDescriptions = [
  "Hi there! I'm a friendly and outgoing person who loves to chat about anything and everything. I enjoy music, movies, and meeting new people. Let's have a great conversation!",
  
  "Welcome to my profile! I'm passionate about art, travel, and good food. I love hearing about people's adventures and sharing my own experiences. Can't wait to chat with you!",
  
  "Hello! I'm here to make your day brighter with interesting conversations. I'm curious about different cultures and love learning new things. Feel free to message me anytime!",
  
  "Hey! I'm a bubbly person who enjoys life to the fullest. I love dancing, reading, and outdoor activities. Looking forward to getting to know you better through our chats!",
  
  "Hi! I'm a creative soul who loves photography, poetry, and deep conversations. I believe every person has a unique story to tell. What's yours? Let's connect!"
];

async function addDescriptionsToProductionDB() {
  try {
    console.log('🌍 Environment:', process.env.NODE_ENV);
    console.log('🔗 MongoDB URI:', process.env.MONGODB_URI);
    console.log('🔌 Connecting to Production MongoDB...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to Production MongoDB');
    
    // Get database name to confirm
    const dbName = mongoose.connection.db.databaseName;
    console.log('💾 Database Name:', dbName);

    // Find all active escort profiles
    const allEscorts = await EscortProfile.find({ status: 'active' });
    console.log(`📄 Found ${allEscorts.length} active escorts in production`);

    if (allEscorts.length === 0) {
      console.log('❌ No active escorts found in production database');
      return;
    }

    // Update each escort with a description if they don't have one
    for (let i = 0; i < allEscorts.length; i++) {
      const escort = allEscorts[i];
      
      // Skip if already has a description
      if (escort.description && escort.description.trim() !== '') {
        console.log(`⏭️  Skipping ${escort.username} - already has description`);
        continue;
      }
      
      const randomDescription = sampleDescriptions[i % sampleDescriptions.length];
      
      // Personalize the description
      let personalizedDescription = randomDescription;
      if (escort.firstName) {
        personalizedDescription = personalizedDescription.replace("Hi there!", `Hi there! I'm ${escort.firstName}.`);
        personalizedDescription = personalizedDescription.replace("Welcome to my profile!", `Welcome to my profile! I'm ${escort.firstName}.`);
        personalizedDescription = personalizedDescription.replace("Hello!", `Hello! I'm ${escort.firstName}.`);
        personalizedDescription = personalizedDescription.replace("Hey!", `Hey! I'm ${escort.firstName}.`);
        personalizedDescription = personalizedDescription.replace("Hi!", `Hi! I'm ${escort.firstName}.`);
      }
      
      if (escort.country) {
        personalizedDescription += ` I'm from ${escort.country} and love sharing about my culture!`;
      }

      await EscortProfile.findByIdAndUpdate(escort._id, {
        description: personalizedDescription
      });
      
      console.log(`✅ Updated ${escort.username} (${escort.firstName || 'N/A'}) with description`);
    }

    // Verify the updates
    const withDescriptions = await EscortProfile.countDocuments({
      description: { $exists: true, $ne: '', $ne: null },
      status: 'active'
    });
    
    console.log(`🎉 Production database now has ${withDescriptions} active escorts with descriptions!`);

  } catch (error) {
    console.error('❌ Error updating production database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 Production MongoDB connection closed');
  }
}

addDescriptionsToProductionDB();