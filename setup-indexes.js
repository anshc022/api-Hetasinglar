require('dotenv').config();
const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const EscortProfile = require('./models/EscortProfile');
const User = require('./models/User');

async function setupIndexes() {
  try {
    console.log('Setting up database indexes for performance...');
    
  // Chat indexes for live queue and user-chat performance
  await Chat.collection.createIndex({ escortId: 1, status: 1, updatedAt: -1 });
  await Chat.collection.createIndex({ agentId: 1, status: 1, updatedAt: -1 });
  await Chat.collection.createIndex({ escortId: 1, agentId: 1, updatedAt: -1 });
  await Chat.collection.createIndex({ customerId: 1, updatedAt: -1 }); // for /chats/user sorted by updatedAt
  await Chat.collection.createIndex({ status: 1, pushBackUntil: 1, updatedAt: -1 });
    
  // EscortProfile indexes
  await EscortProfile.collection.createIndex({ status: 1, createdAt: -1 }); // for public /escorts
  await EscortProfile.collection.createIndex({ 'createdBy.id': 1, status: 1, createdAt: -1 });
  await EscortProfile.collection.createIndex({ 'createdBy': 1, status: 1, createdAt: -1 }); // Backward compatibility
    
    // User indexes for coin operations
    await User.collection.createIndex({ 'coins.balance': 1 });
    await User.collection.createIndex({ affiliateAgent: 1 });
    
    console.log('✅ Database indexes created successfully!');
    console.log('Performance should be significantly improved for:');
    console.log('  - Live queue queries');
    console.log('  - Escort profile lookups');
    console.log('  - Message sending operations');
    console.log('  - Agent dashboard queries');
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  }
}

module.exports = { setupIndexes };

// If run directly
if (require.main === module) {
  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/hetasinglar';
  console.log('Connecting to MongoDB for index setup...');
  
  mongoose.connect(mongoUrl)
    .then(() => {
      console.log('Connected to MongoDB');
      return setupIndexes();
    })
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Database connection error:', error);
      process.exit(1);
    });
}
