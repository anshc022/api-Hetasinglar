const mongoose = require('mongoose');
const Chat = require('./models/Chat');

// Connect to MongoDB
mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testLiveQueueQuery() {
  try {
    console.log('=== Testing Live Queue Aggregation Query ===\n');

    // This is the same query used in agentRoutes.js
    const chats = await Chat.aggregate([
      {
        $match: {
          $or: [
            { status: 'new' },
            { status: 'assigned' },
            { status: 'active' },
            { isInPanicRoom: true },
            // Chats with unread customer messages
            { 
              messages: {
                $elemMatch: {
                  sender: 'customer',
                  readByAgent: false
                }
              }
            },
            // Chats with active reminder but currently no unread (need follow-up visibility) - only if not handled
            { 
              $and: [
                { reminderActive: true },
                { reminderHandled: { $ne: true } }
              ]
            }
          ]
        }
      },
      {
        // Lightweight calculation: compute hours since last customer response for reminder logic
        $addFields: {
          hoursSinceLastCustomer: {
            $divide: [
              { $subtract: [new Date(), { $ifNull: ['$lastCustomerResponse', '$createdAt'] }] },
              1000 * 60 * 60
            ]
          }
        }
      },
      {
        $addFields: {
          // Calculate unread count efficiently in one operation
          unreadCount: {
            $size: {
              $filter: {
                input: '$messages',
                as: 'message',
                cond: {
                  $and: [
                    { $eq: ['$$message.sender', 'customer'] },
                    { $eq: ['$$message.readByAgent', false] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          // Chat type classification (separate stage to reference calculated fields)
          chatType: {
            $switch: {
              branches: [
                { case: { $eq: ['$isInPanicRoom', true] }, then: 'panic' },
                // Unread customer messages -> queue
                { case: { $gt: ['$unreadCount', 0] }, then: 'queue' },
                // Active reminder (no unread) and not handled by agent
                { case: { 
                  $and: [ 
                    { $eq: ['$reminderActive', true] }, 
                    { $eq: ['$unreadCount', 0] },
                    { $ne: ['$reminderHandled', true] }
                  ] 
                }, then: 'reminder' }
              ],
              default: 'idle'
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          customerName: 1,
          reminderActive: 1,
          reminderHandled: 1,
          isInPanicRoom: 1,
          unreadCount: 1,
          chatType: 1,
          hoursSinceLastCustomer: 1
        }
      }
    ]);

    console.log(`Total chats returned by live queue query: ${chats.length}\n`);

    // Count by chat type
    const chatTypes = chats.reduce((acc, chat) => {
      acc[chat.chatType] = (acc[chat.chatType] || 0) + 1;
      return acc;
    }, {});

    console.log('Chat counts by type:');
    Object.entries(chatTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Show reminder chats specifically
    const reminderChats = chats.filter(chat => chat.chatType === 'reminder');
    console.log(`\nReminder chats (${reminderChats.length}):`);
    
    reminderChats.forEach((chat, index) => {
      console.log(`${index + 1}. Chat ${chat._id}:`);
      console.log(`   - customerName: ${chat.customerName || 'N/A'}`);
      console.log(`   - reminderActive: ${chat.reminderActive}`);
      console.log(`   - reminderHandled: ${chat.reminderHandled}`);
      console.log(`   - unreadCount: ${chat.unreadCount}`);
      console.log(`   - chatType: ${chat.chatType}`);
      console.log('   ---');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testLiveQueueQuery();
