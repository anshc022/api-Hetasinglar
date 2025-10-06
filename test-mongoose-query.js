const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');

// Use development MongoDB URI for testing
const MONGODB_URI = 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar';

async function testMongooseQuery() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test the exact same query as the API
    const filter = { status: 'active' };
    const profiles = await EscortProfile.find(filter)
      .select('username firstName gender profileImage profilePicture imageUrl country region status createdAt relationshipStatus interests profession height dateOfBirth serialNumber description')
      .sort({ createdAt: -1 })
      .lean()
      .limit(2);

    console.log(`\n📄 Found ${profiles.length} profiles using Mongoose:`);
    
    profiles.forEach((profile, index) => {
      console.log(`\n${index + 1}. ${profile.username} (${profile.firstName || 'N/A'})`);
      console.log(`   - Description exists: ${profile.description ? '✅ YES' : '❌ NO'}`);
      console.log(`   - Fields returned: ${Object.keys(profile).join(', ')}`);
      if (profile.description) {
        console.log(`   - Description preview: "${profile.description.substring(0, 80)}..."`);
      }
    });

    // Also test without .select() to see all fields
    console.log('\n🔍 Testing without .select() to see all fields:');
    const allFieldsProfile = await EscortProfile.findOne(filter).lean();
    if (allFieldsProfile) {
      console.log(`All fields in profile: ${Object.keys(allFieldsProfile).join(', ')}`);
      console.log(`Description field: ${allFieldsProfile.description ? 'EXISTS' : 'MISSING'}`);
    }

  } catch (error) {
    console.error('❌ Error testing Mongoose query:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔒 MongoDB connection closed');
  }
}

testMongooseQuery();