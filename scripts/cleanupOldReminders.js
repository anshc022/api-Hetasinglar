// Complete cleanup script to remove ALL old reminder and followUp data
// Usage: node scripts/cleanupOldReminders.js

const mongoose = require('mongoose');
const Chat = require('../models/Chat');

(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority';
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // Remove ALL reminder-related fields from all chats
    const result = await Chat.updateMany({}, {
      $unset: { 
        // Old reminder system fields
        reminders: 1,
        requiresFollowUp: 1,
        followUpDue: 1,
        reminderHandled: 1,
        reminderHandledAt: 1,
        reminderSnoozedUntil: 1,
        reminderPriority: 1,
        reminderCount: 1,
        // Any other reminder debris
        reminderHistory: 1,
        followUpHistory: 1
      }
    });

    console.log(`✅ Completely cleaned reminder system from ${result.modifiedCount || result.nModified} chats`);
    console.log('All old reminder/followUp logic removed. Fresh start!');
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
})();
