const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');

// Load environment variables
require('dotenv').config();

// Use development MongoDB URI for testing
const MONGODB_URI = 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar';

async function testDescriptionField() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find an active escort profile
    const escort = await EscortProfile.findOne({ status: 'active' });
    
    if (!escort) {
      console.log('❌ No active escort profiles found');
      return;
    }

    console.log(`📄 Found escort: ${escort.username} (${escort.firstName || 'N/A'})`);
    console.log(`📝 Current description: ${escort.description || 'No description'}`);

    // Update with a test description if none exists
    if (!escort.description) {
      const testDescription = `Hi! I'm ${escort.firstName || escort.username}. I'm a ${escort.gender || 'person'} from ${escort.country || 'somewhere beautiful'}. I love meeting new people and having interesting conversations. Feel free to message me!`;
      
      await EscortProfile.findByIdAndUpdate(escort._id, {
        description: testDescription
      });
      
      console.log('✅ Added test description to escort profile');
      console.log(`📝 New description: ${testDescription}`);
    }

    // Verify the description field is working
    const updatedEscort = await EscortProfile.findById(escort._id);
    console.log(`🔍 Verified description: ${updatedEscort.description ? 'Present' : 'Missing'}`);

    console.log('🎉 Description field test completed successfully!');

  } catch (error) {
    console.error('❌ Error testing description field:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 MongoDB connection closed');
  }
}

testDescriptionField();