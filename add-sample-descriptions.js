const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');

// Load environment variables
require('dotenv').config();

// Use development MongoDB URI for testing
const MONGODB_URI = 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar';

const sampleDescriptions = [
  "Hi there! I'm a friendly and outgoing person who loves to chat about anything and everything. I enjoy music, movies, and meeting new people. Let's have a great conversation!",
  
  "Welcome to my profile! I'm passionate about art, travel, and good food. I love hearing about people's adventures and sharing my own experiences. Can't wait to chat with you!",
  
  "Hello! I'm here to make your day brighter with interesting conversations. I'm curious about different cultures and love learning new things. Feel free to message me anytime!",
  
  "Hey! I'm a bubbly person who enjoys life to the fullest. I love dancing, reading, and outdoor activities. Looking forward to getting to know you better through our chats!",
  
  "Hi! I'm a creative soul who loves photography, poetry, and deep conversations. I believe every person has a unique story to tell. What's yours? Let's connect!"
];

async function addDescriptionsToProfiles() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all active escort profiles without descriptions
    const escortsWithoutDescription = await EscortProfile.find({ 
      status: 'active',
      $or: [
        { description: { $exists: false } },
        { description: '' },
        { description: null }
      ]
    }).limit(10);
    
    if (escortsWithoutDescription.length === 0) {
      console.log('✅ All active escorts already have descriptions!');
      return;
    }

    console.log(`📄 Found ${escortsWithoutDescription.length} escorts without descriptions`);

    for (let i = 0; i < escortsWithoutDescription.length; i++) {
      const escort = escortsWithoutDescription[i];
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
      
      console.log(`✅ Updated ${escort.username} (${escort.firstName || 'N/A'}) with personalized description`);
    }

    console.log('🎉 Successfully added descriptions to all profiles!');

  } catch (error) {
    console.error('❌ Error adding descriptions:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 MongoDB connection closed');
  }
}

addDescriptionsToProfiles();