const mongoose = require('mongoose');
require('dotenv').config();

// Import models to ensure they're registered
const Chat = require('./models/Chat');
const Agent = require('./models/Agent');
const User = require('./models/User');
const EscortProfile = require('./models/EscortProfile');
const Earnings = require('./models/Earnings');

async function optimizeDatabase() {
  try {
    console.log('🚀 Starting Database Optimization...');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ Connected to MongoDB');

    // Create indexes for Chat collection (most accessed)
    console.log('📊 Creating Chat indexes...');
    await Chat.collection.createIndex({ agentId: 1, status: 1 });
    await Chat.collection.createIndex({ customerId: 1 });
    await Chat.collection.createIndex({ escortId: 1 });
    await Chat.collection.createIndex({ updatedAt: -1 });
    await Chat.collection.createIndex({ "messages.sender": 1, "messages.readByAgent": 1 });
    await Chat.collection.createIndex({ isInPanicRoom: 1 });
    await Chat.collection.createIndex({ requiresFollowUp: 1, followUpDue: 1 });

    // Create indexes for Agent collection
    console.log('📊 Creating Agent indexes...');
    await Agent.collection.createIndex({ agentId: 1 }, { unique: true });
    await Agent.collection.createIndex({ "stats.liveMessageCount": -1 });
    await Agent.collection.createIndex({ "stats.totalMessagesSent": -1 });

    // Create indexes for User collection
    console.log('📊 Creating User indexes...');
    await User.collection.createIndex({ username: 1 }, { unique: true });
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ affiliateAgent: 1 });

    // Create indexes for EscortProfile collection
    console.log('📊 Creating EscortProfile indexes...');
    await EscortProfile.collection.createIndex({ "createdBy.id": 1 });
    await EscortProfile.collection.createIndex({ "createdBy": 1 });
    await EscortProfile.collection.createIndex({ status: 1 });
    await EscortProfile.collection.createIndex({ createdAt: -1 });

    // Create indexes for Earnings collection
    console.log('📊 Creating Earnings indexes...');
    await Earnings.collection.createIndex({ agentId: 1, transactionDate: -1 });
    await Earnings.collection.createIndex({ userId: 1 });
    await Earnings.collection.createIndex({ affiliateAgentId: 1 });
    await Earnings.collection.createIndex({ chatId: 1 });
    await Earnings.collection.createIndex({ transactionDate: -1 });

    // Create compound indexes for common queries
    console.log('📊 Creating compound indexes...');
    await Chat.collection.createIndex({ 
      agentId: 1, 
      status: 1, 
      updatedAt: -1 
    });
    
    await Earnings.collection.createIndex({ 
      agentId: 1, 
      transactionDate: -1,
      paymentStatus: 1
    });

    console.log('✅ Database optimization completed!');
    console.log('🚀 Your queries should now be much faster!');

  } catch (error) {
    console.error('❌ Database optimization failed:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run optimization
optimizeDatabase();
