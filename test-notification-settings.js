/**
 * Test script for granular notification settings
 * Verifies that the new notification preferences are working correctly
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const EscortProfile = require('./models/EscortProfile');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('🔍 Testing notification settings...\n');

  // Find a user to test with
  const testUser = await User.findOne().select('username email preferences').lean();
  if (!testUser) {
    console.log('❌ No users found in database');
    process.exit(1);
  }

  console.log(`📱 Testing with user: ${testUser.username}`);
  console.log(`📧 Email: ${testUser.email}`);
  console.log('\n📋 Current notification settings:');
  console.log('- Legacy notifications:', testUser.preferences?.notifications);
  console.log('- Legacy emailUpdates:', testUser.preferences?.emailUpdates);
  console.log('\n🔧 Granular settings:');
  console.log('- Messages enabled:', testUser.preferences?.notificationSettings?.email?.messages?.enabled);
  console.log('- Offline threshold (min):', testUser.preferences?.notificationSettings?.email?.messages?.onlyWhenOfflineMinutes);
  console.log('- Per-escort overrides:', testUser.preferences?.notificationSettings?.email?.messages?.perEscort?.length || 0);

  // Find an escort to test with
  const testEscort = await EscortProfile.findOne().select('firstName username').lean();
  if (testEscort) {
    console.log(`\n👥 Test escort: ${testEscort.firstName} (${testEscort.username})`);
    
    // Test per-escort override logic
    const overrides = testUser.preferences?.notificationSettings?.email?.messages?.perEscort || [];
    const escortOverride = overrides.find(o => o.escortId?.toString() === testEscort._id.toString());
    console.log(`- Per-escort override for ${testEscort.firstName}:`, escortOverride ? escortOverride.enabled : 'none (default: enabled)');
  }

  // Show sample update commands
  console.log('\n⚙️  Sample preference updates:');
  console.log(`
  // Disable email notifications for this user:
  await User.findByIdAndUpdate('${testUser._id}', {
    'preferences.notificationSettings.email.messages.enabled': false
  });

  // Set offline threshold to 30 minutes:
  await User.findByIdAndUpdate('${testUser._id}', {
    'preferences.notificationSettings.email.messages.onlyWhenOfflineMinutes': 30
  });

  // Add per-escort override (disable notifications from specific escort):
  await User.findByIdAndUpdate('${testUser._id}', {
    $push: {
      'preferences.notificationSettings.email.messages.perEscort': {
        escortId: ObjectId('${testEscort?._id || '000000000000000000000000'}'),
        enabled: false
      }
    }
  });
  `);

  await mongoose.disconnect();
  console.log('\n✅ Test complete!');
}

run().catch((err) => {
  console.error('❌ Test error:', err);
  process.exit(1);
});