const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const EscortProfile = require('./models/EscortProfile');

async function fixCorruptedData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority');
    console.log('Connected to MongoDB');

    // Find all EscortProfile documents
    const profiles = await EscortProfile.find({});
    console.log(`Found ${profiles.length} escort profiles`);

    let fixedCount = 0;

    for (const profile of profiles) {
      let needsUpdate = false;
      const updates = {};

      // Check if createdBy field has issues
      if (profile.createdBy) {
        if (profile.createdBy.id && Buffer.isBuffer(profile.createdBy.id)) {
          console.log(`Fixing corrupted createdBy.id for profile ${profile._id}`);
          // Remove the corrupted createdBy field
          updates.createdBy = undefined;
          needsUpdate = true;
        }
      }

      // Update the document if needed
      if (needsUpdate) {
        await EscortProfile.findByIdAndUpdate(profile._id, { $unset: updates });
        fixedCount++;
        console.log(`Fixed profile ${profile._id}`);
      }
    }

    console.log(`Fixed ${fixedCount} corrupted records`);
    console.log('Database cleanup completed');

    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error fixing corrupted data:', error);
    process.exit(1);
  }
}

// Run the fix
fixCorruptedData();
