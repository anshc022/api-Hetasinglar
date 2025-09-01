const mongoose = require('mongoose');
const Chat = require('./models/Chat');

async function testExactLiveQueueLogic() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Test one specific chat that should be a reminder
    const chatId = '68b442cf69b96038c254aa60';
    
    console.log(`\n🔍 TESTING EXACT LIVE QUEUE LOGIC FOR CHAT ${chatId}...`);
    
    // COPY THE EXACT AGGREGATION FROM THE LIVE QUEUE ROUTE
    const result = await Chat.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(chatId) }
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
          },
          // Get last message efficiently
          lastMessage: { $arrayElemAt: ['$messages', -1] },
          // Get the last agent message to determine who's handling this chat
          lastAgentMessage: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$messages',
                  as: 'msg',
                  cond: { $eq: ['$$msg.sender', 'agent'] }
                }
              },
              -1
            ]
          },
          priority: {
            $switch: {
              branches: [
                // Panic room has highest priority (5)
                { case: { $eq: ['$isInPanicRoom', true] }, then: 5 },
                // Unhandled reminders have high priority (4) - BUT ONLY after 6+ hours
                { 
                  case: { 
                    $and: [
                      // Do not treat as reminder if there are unread customer messages
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
                  then: 4 
                },
                // Follow-up required chats also high priority (4)
                // Only if there are no unread customer messages
                { case: { $and: [ { $eq: ['$requiresFollowUp', true] }, { $eq: ['$unreadCount', 0] } ] }, then: 4 },
                // Many unread messages have medium-high priority (3)
                { case: { $gt: [{ $size: { $filter: { input: '$messages', as: 'msg', cond: { $and: [{ $eq: ['$$msg.sender', 'customer'] }, { $eq: ['$$msg.readByAgent', false] }] } } } }, 5] }, then: 3 },
                // Some unread messages have medium priority (2)
                { case: { $gt: [{ $size: { $filter: { input: '$messages', as: 'msg', cond: { $and: [{ $eq: ['$$msg.sender', 'customer'] }, { $eq: ['$$msg.readByAgent', false] }] } } } }, 0] }, then: 2 }
              ],
              default: 1
            }
          },
          // Calculate hours since last customer message for reminder logic
          hoursSinceLastCustomer: {
            $cond: [
              { $ne: ['$lastCustomerResponse', null] },
              {
                $divide: [
                  { $subtract: [new Date(), '$lastCustomerResponse'] },
                  1000 * 60 * 60 // Convert to hours
                ]
              },
              {
                $divide: [
                  { $subtract: [new Date(), '$updatedAt'] },
                  1000 * 60 * 60 // Fallback to updatedAt
                ]
              }
            ]
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
                // If chat has unread messages, classify as queue (takes precedence over reminders)
                { case: { $gt: ['$unreadCount', 0] }, then: 'queue' },
                // Only show as reminder if 6+ hours have passed AND reminder not handled
                { 
                  case: { 
                    $and: [
                      { $eq: ['$unreadCount', 0] },
                      { $ne: ['$reminderHandled', true] },
                      { $gte: ['$hoursSinceLastCustomer', 6] }
                    ]
                  }, 
                  then: 'reminder' 
                },
                // Follow-up or snoozed reminders only if there are no unread customer messages
                { case: { $and: [ { $eq: ['$requiresFollowUp', true] }, { $eq: ['$unreadCount', 0] } ] }, then: 'reminder' },
                { case: { $and: [ { $ne: ['$reminderSnoozedUntil', null] }, { $eq: ['$unreadCount', 0] } ] }, then: 'reminder' }
              ],
              default: 'queue'
            }
          }
        }
      }
    ]);

    if (result.length > 0) {
      const chat = result[0];
      console.log('\n📊 EXACT LIVE QUEUE RESULT:');
      console.log('Chat ID:', chat._id);
      console.log('reminderHandled:', chat.reminderHandled);
      console.log('unreadCount:', chat.unreadCount);
      console.log('hoursSinceLastCustomer:', chat.hoursSinceLastCustomer);
      console.log('priority:', chat.priority);
      console.log('chatType:', chat.chatType);
      
      console.log('\n🧮 LOGIC CHECK:');
      console.log('Unread === 0:', chat.unreadCount === 0);
      console.log('Reminder not handled:', chat.reminderHandled !== true);
      console.log('Hours >= 6:', chat.hoursSinceLastCustomer >= 6);
      
      if (chat.unreadCount === 0 && chat.reminderHandled !== true && chat.hoursSinceLastCustomer >= 6) {
        console.log('✅ Should be reminder: TRUE');
        if (chat.chatType !== 'reminder') {
          console.log('🚨 BUG: Should be reminder but chatType is', chat.chatType);
        }
      } else {
        console.log('❌ Should be reminder: FALSE');
      }
    } else {
      console.log('❌ Chat not found');
    }

    await mongoose.disconnect();
    console.log('\n✅ Test complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

testExactLiveQueueLogic();
