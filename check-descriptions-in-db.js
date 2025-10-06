const mongoose = require('mongoose');

// Use development MongoDB URI for testing
const MONGODB_URI = 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar';

async function checkDescriptionsInDB() {
  try {
    console.log('🔌 Connecting to development MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Direct query to check descriptions
    const escorts = await mongoose.connection.db.collection('escortprofiles').find(
      { status: 'active' }
    ).limit(5).toArray();

    console.log(`\n📄 Found ${escorts.length} active escorts in database:`);
    
    escorts.forEach((escort, index) => {
      console.log(`\n${index + 1}. ${escort.username} (${escort.firstName || 'N/A'})`);
      console.log(`   - Description exists: ${escort.description ? '✅ YES' : '❌ NO'}`);
      if (escort.description) {
        console.log(`   - Description preview: "${escort.description.substring(0, 80)}..."`);
      }
      console.log(`   - All fields: ${Object.keys(escort).join(', ')}`);
    });

  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔒 MongoDB connection closed');
  }
}

checkDescriptionsInDB();