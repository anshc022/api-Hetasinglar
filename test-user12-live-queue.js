const mongoose = require('mongoose');
const Chat = require('./models/Chat');

async function testLiveQueueForUser12() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Run the EXACT same aggregation as the live queue
    console.log('\n🔍 RUNNING LIVE QUEUE AGGREGATION FOR user12...');
    
    const chats = await Chat.aggregate([
      {
        $match: {
          $or: [
            { status: 'new' },
            { status: 'assigned' },
            { status: 'active' },
            { isInPanicRoom: true },
            { requiresFollowUp: true },
            { reminderHandled: { $ne: true } },
            { reminderSnoozedUntil: { $exists: true } },
            { 'messages.0': { $exists: true } }
          ]
        }
      },
      {
        $addFields: {
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
          },
          lastMessage: { $arrayElemAt: ['$messages', -1] },
          hoursSinceLastCustomer: {
            $cond: [
              { $ne: ['$lastCustomerResponse', null] },
              {
                $divide: [
                  { $subtract: [new Date(), '$lastCustomerResponse'] },
                  1000 * 60 * 60
                ]
              },
              {
                $divide: [
                  { $subtract: [new Date(), '$updatedAt'] },
                  1000 * 60 * 60
                ]
              }
            ]
          },
          chatType: {
            $switch: {
              branches: [
                { case: { $eq: ['$isInPanicRoom', true] }, then: 'panic' },
                { case: { $gt: ['$unreadCount', 0] }, then: 'queue' },
                { 
                  case: { 
                    $and: [
                      { $eq: ['$unreadCount', 0] },
                      { $ne: ['$reminderHandled', true] },
                      { $gte: [
                        {
                          $cond: [
                            { $ne: ['$lastCustomerResponse', null] },
                            {
                              $divide: [
                                { $subtract: [new Date(), '$lastCustomerResponse'] },
                                1000 * 60 * 60
                              ]
                            },
                            {
                              $divide: [
                                { $subtract: [new Date(), '$updatedAt'] },
                                1000 * 60 * 60
                              ]
                            }
                          ]
                        },
                        6
                      ]}
                    ]
                  }, 
                  then: 'reminder' 
                },
                { case: { $and: [ { $eq: ['$requiresFollowUp', true] }, { $eq: ['$unreadCount', 0] } ] }, then: 'reminder' }
              ],
              default: 'queue'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
          pipeline: [{ $project: { username: 1 } }]
        }
      },
      {
        $match: {
          'customer.username': 'user12'
        }
      },
      {
        $project: {
          customerId: { $arrayElemAt: ['$customer', 0] },
          unreadCount: 1,
          hoursSinceLastCustomer: 1,
          chatType: 1,
          reminderHandled: 1,
          requiresFollowUp: 1,
          status: 1,
          updatedAt: 1,
          lastCustomerResponse: 1
        }
      }
    ]);

    console.log(`\n📊 LIVE QUEUE RESULTS FOR user12: ${chats.length} chats`);
    
    chats.forEach((chat, i) => {
      console.log(`\n${i + 1}. Chat ${chat._id}`);
      console.log(`   chatType: ${chat.chatType}`);
      console.log(`   unreadCount: ${chat.unreadCount}`);
      console.log(`   reminderHandled: ${chat.reminderHandled}`);
      console.log(`   hoursSinceLastCustomer: ${chat.hoursSinceLastCustomer?.toFixed(2)}`);
      console.log(`   status: ${chat.status}`);
    });

    const reminderChats = chats.filter(c => c.chatType === 'reminder');
    const queueChats = chats.filter(c => c.chatType === 'queue');
    
    console.log(`\n📈 SUMMARY FOR user12:`);
    console.log(`   Reminders: ${reminderChats.length}`);
    console.log(`   Queue: ${queueChats.length}`);
    console.log(`   Total: ${chats.length}`);

    await mongoose.disconnect();
    console.log('\n✅ Live queue test complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

testLiveQueueForUser12();
