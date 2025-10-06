const mongoose = require('mongoose');
require('dotenv').config();

async function addCriticalMessageIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB Atlas Production');

    const db = mongoose.connection.db;
    const chats = db.collection('chats');

    console.log('🚀 Creating critical message-related indexes for live-queue performance...');

    // Critical compound index for unread message queries (MOST IMPORTANT)
    await chats.createIndex(
      { 
        'messages.sender': 1,
        'messages.readByAgent': 1,
        'messages.timestamp': -1
      },
      { 
        name: 'messages_unread_compound',
        background: true,
        sparse: true
      }
    );
    console.log('✅ Created messages unread compound index');

    // Status + panic room + updated compound index for initial filtering
    await chats.createIndex(
      { 
        status: 1,
        isInPanicRoom: 1,
        updatedAt: -1,
        createdAt: -1
      },
      { 
        name: 'status_panic_times_compound',
        background: true
      }
    );
    console.log('✅ Created status/panic/times compound index');

    // Escort + Agent + Status compound for escort-specific queries
    await chats.createIndex(
      { 
        escortId: 1,
        agentId: 1,
        status: 1,
        updatedAt: -1
      },
      { 
        name: 'escort_agent_status_time',
        background: true
      }
    );
    console.log('✅ Created escort/agent/status compound index');

    // Customer + Status for customer-related lookups
    await chats.createIndex(
      { 
        customerId: 1,
        status: 1,
        updatedAt: -1
      },
      { 
        name: 'customer_status_time',
        background: true
      }
    );
    console.log('✅ Created customer/status compound index');

    // Reminder-related compound index
    await chats.createIndex(
      { 
        reminderActive: 1,
        reminderHandled: 1,
        updatedAt: -1
      },
      { 
        name: 'reminder_compound',
        background: true,
        sparse: true
      }
    );
    console.log('✅ Created reminder compound index');

    // Analysis: Check index usage
    console.log('\n📊 Analyzing collection stats...');
    const stats = await chats.stats();
    console.log(`Collection size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total documents: ${stats.count}`);
    console.log(`Average document size: ${stats.avgObjSize} bytes`);

    await mongoose.disconnect();
    console.log('\n🎉 Critical indexes added successfully!');
    console.log('🚀 Live-queue queries should now be much faster!');
    
  } catch (error) {
    console.error('❌ Error adding indexes:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  addCriticalMessageIndexes();
}

module.exports = { addCriticalMessageIndexes };