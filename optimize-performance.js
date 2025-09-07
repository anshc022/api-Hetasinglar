const mongoose = require('mongoose');
require('dotenv').config();

async function optimizeDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB Atlas Production');

    const db = mongoose.connection.db;
    const chats = db.collection('chats');
    const escortprofiles = db.collection('escortprofiles');
    const agents = db.collection('agents');

    console.log('Creating performance indexes...');

    // Chat collection indexes for live-queue queries
    await chats.createIndex(
      { 
        status: 1, 
        isInPanicRoom: 1, 
        updatedAt: -1 
      },
      { 
        name: 'live_queue_status_panic_updated',
        background: true 
      }
    );

    await chats.createIndex(
      { 
        escortId: 1, 
        agentId: 1, 
        status: 1,
        updatedAt: -1 
      },
      { 
        name: 'escort_agent_status_updated',
        background: true 
      }
    );

    await chats.createIndex(
      { 
        'messages.sender': 1, 
        'messages.readByAgent': 1 
      },
      { 
        name: 'messages_sender_read',
        background: true 
      }
    );

    await chats.createIndex(
      { 
        customerId: 1,
        status: 1,
        updatedAt: -1
      },
      { 
        name: 'customer_status_updated',
        background: true 
      }
    );

    // Escort profile indexes
    await escortprofiles.createIndex(
      { 
        'createdBy.id': 1 
      },
      { 
        name: 'created_by_id',
        background: true 
      }
    );

    await escortprofiles.createIndex(
      { 
        createdBy: 1 
      },
      { 
        name: 'created_by_legacy',
        background: true 
      }
    );

    // Agent indexes
    await agents.createIndex(
      { 
        agentId: 1 
      },
      { 
        name: 'agent_id_unique',
        unique: true,
        background: true 
      }
    );

    console.log('✅ Performance indexes created successfully!');
    console.log('🚀 Database queries should now be much faster');

    // Analyze current performance
    console.log('\nAnalyzing current data...');
    
    const chatStats = await chats.aggregate([
      {
        $group: {
          _id: null,
          totalChats: { $sum: 1 },
          activeChats: { 
            $sum: { 
              $cond: [
                { $in: ['$status', ['new', 'active', 'assigned']] }, 
                1, 
                0
              ]
            }
          },
          panicRoomChats: {
            $sum: {
              $cond: [
                { $eq: ['$isInPanicRoom', true] },
                1,
                0
              ]
            }
          }
        }
      }
    ]).toArray();

    console.log('Chat statistics:', chatStats[0]);

    const escortStats = await escortprofiles.countDocuments();
    const agentStats = await agents.countDocuments();

    console.log(`Total escorts: ${escortStats}`);
    console.log(`Total agents: ${agentStats}`);

    await mongoose.disconnect();
    console.log('✅ Database optimization complete!');
    
  } catch (error) {
    console.error('❌ Error optimizing database:', error);
    process.exit(1);
  }
}

optimizeDatabase();
