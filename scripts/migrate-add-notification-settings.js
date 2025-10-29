/**
 * Migration: Add granular notification settings to User.preferences
 * - Sets preferences.notificationSettings.email.messages.enabled = true
 * - Sets preferences.notificationSettings.email.messages.onlyWhenOfflineMinutes = 10
 * - Leaves perEscort empty
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set in environment');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const db = mongoose.connection;
  const users = db.collection('users');

  // Only touch users missing the new structure
  const filter = {
    $or: [
      { 'preferences.notificationSettings': { $exists: false } },
      { 'preferences.notificationSettings.email': { $exists: false } },
      { 'preferences.notificationSettings.email.messages': { $exists: false } },
    ],
  };

  const update = {
    $set: {
      'preferences.notificationSettings.email.messages.enabled': true,
      'preferences.notificationSettings.email.messages.onlyWhenOfflineMinutes': 10,
      'preferences.notificationSettings.email.messages.perEscort': [],
    },
  };

  const result = await users.updateMany(filter, update);
  console.log(`Migration complete. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
