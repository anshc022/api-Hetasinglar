const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const User = require('./models/User');

async function investigateAllReminders() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Run the same aggregation as the live queue to see what's being classified as reminders
    console.log('\n🔍 RUNNING LIVE QUEUE AGGREGATION...');
    
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
        $project: {
          customerId: { $arrayElemAt: ['$customer', 0] },
          unreadCount: 1,
          hoursSinceLastCustomer: 1,
          chatType: 1,
          reminderHandled: 1,
          requiresFollowUp: 1,
          lastCustomerResponse: 1,
          updatedAt: 1,
          messagesCount: { $size: '$messages' }
        }
      }
    ]);

    console.log(`\n📊 FOUND ${chats.length} CHATS`);
    
    // Group by chatType
    const reminderChats = chats.filter(c => c.chatType === 'reminder');
    const queueChats = chats.filter(c => c.chatType === 'queue');
    const panicChats = chats.filter(c => c.chatType === 'panic');

    console.log(`\n📈 BREAKDOWN:`);
    console.log(`Reminders: ${reminderChats.length}`);
    console.log(`Queue: ${queueChats.length}`);
    console.log(`Panic: ${panicChats.length}`);

    if (reminderChats.length > 0) {
      console.log(`\n⏰ REMINDER CHATS (${reminderChats.length}):`);
      reminderChats.forEach((chat, i) => {
        console.log(`\n${i + 1}. ${chat.customerId?.username || 'Unknown'}`);
        console.log(`   Hours since last customer: ${chat.hoursSinceLastCustomer?.toFixed(2) || 'N/A'}`);
        console.log(`   Unread count: ${chat.unreadCount}`);
        console.log(`   Reminder handled: ${chat.reminderHandled}`);
        console.log(`   Requires follow up: ${chat.requiresFollowUp}`);
        console.log(`   Messages count: ${chat.messagesCount}`);
        console.log(`   Last customer response: ${chat.lastCustomerResponse}`);
        console.log(`   Updated at: ${chat.updatedAt}`);
        
        // Check WHY this is classified as reminder
        const hoursOk = chat.hoursSinceLastCustomer >= 6;
        const unreadZero = chat.unreadCount === 0;
        const reminderNotHandled = chat.reminderHandled !== true;
        const requiresFollowUp = chat.requiresFollowUp === true;
        
        console.log(`   ✓ Reason for reminder:`);
        console.log(`     - Unread count = 0: ${unreadZero}`);
        console.log(`     - Hours >= 6: ${hoursOk} (${chat.hoursSinceLastCustomer?.toFixed(2)}h)`);
        console.log(`     - Reminder not handled: ${reminderNotHandled}`);
        console.log(`     - Requires follow up: ${requiresFollowUp}`);
        
        if (requiresFollowUp && unreadZero) {
          console.log(`     ➜ REMINDER DUE TO: requiresFollowUp flag`);
        } else if (unreadZero && reminderNotHandled && hoursOk) {
          console.log(`     ➜ REMINDER DUE TO: 6+ hours passed`);
        } else {
          console.log(`     ➜ UNEXPECTED: Should not be reminder!`);
        }
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Investigation complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

investigateAllReminders();
