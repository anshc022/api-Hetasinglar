const mongoose = require('mongoose');

// Load environment variables first
require('dotenv').config();

// Use the existing database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hetasinglar';

console.log('🔧 Starting General Notes Migration...');

async function migrateGeneralNotes() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB');
    
    const Chat = mongoose.model('Chat', require('./models/Chat').schema);
    
    // Find all chats with comments that start with [General]
    const chatsWithGeneralNotes = await Chat.find({
      'comments.text': { $regex: /^\[General\]/ }
    });
    
    console.log(`📝 Found ${chatsWithGeneralNotes.length} chats with general notes`);
    
    let updatedCount = 0;
    
    for (const chat of chatsWithGeneralNotes) {
      let hasUpdates = false;
      
      // Update comments that start with [General] to have isGeneral: true
      for (let i = 0; i < chat.comments.length; i++) {
        const comment = chat.comments[i];
        if (comment.text && comment.text.startsWith('[General]')) {
          if (!comment.isGeneral) {
            chat.comments[i].isGeneral = true;
            hasUpdates = true;
          }
        }
      }
      
      if (hasUpdates) {
        await chat.save();
        updatedCount++;
        console.log(`✅ Updated chat ${chat._id}`);
      }
    }
    
    console.log(`🎉 Migration complete! Updated ${updatedCount} chats with general notes`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }
}

// Run the migration
migrateGeneralNotes().catch(console.error);
