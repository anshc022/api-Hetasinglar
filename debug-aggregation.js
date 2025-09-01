const mongoose = require('mongoose');
const Chat = require('./models/Chat');

async function debugAggregationLogic() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Test one specific chat that should be a reminder
    const chatId = '68b442cf69b96038c254aa60'; // user12 chat that should be reminder
    
    console.log(`\n🔍 DEBUGGING CHAT ${chatId}...`);
    
    const result = await Chat.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(chatId) }
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
          // Test individual conditions
          isUnreadZero: { $eq: ['$unreadCount', 0] },
          isReminderNotHandled: { $ne: ['$reminderHandled', true] },
          isHoursGte6: { $gte: ['$hoursSinceLastCustomer', 6] },
          // Test the complete AND condition
          shouldBeReminder: {
            $and: [
              { $eq: ['$unreadCount', 0] },
              { $ne: ['$reminderHandled', true] },
              { $gte: ['$hoursSinceLastCustomer', 6] }
            ]
          }
        }
      },
      {
        $addFields: {
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
                      { $gte: ['$hoursSinceLastCustomer', 6] }
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
        $project: {
          _id: 1,
          reminderHandled: 1,
          requiresFollowUp: 1,
          lastCustomerResponse: 1,
          updatedAt: 1,
          unreadCount: 1,
          hoursSinceLastCustomer: 1,
          isUnreadZero: 1,
          isReminderNotHandled: 1,
          isHoursGte6: 1,
          shouldBeReminder: 1,
          chatType: 1
        }
      }
    ]);

    if (result.length > 0) {
      const chat = result[0];
      console.log('\n📊 DETAILED ANALYSIS:');
      console.log('Chat ID:', chat._id);
      console.log('reminderHandled:', chat.reminderHandled);
      console.log('lastCustomerResponse:', chat.lastCustomerResponse);
      console.log('updatedAt:', chat.updatedAt);
      console.log('unreadCount:', chat.unreadCount);
      console.log('hoursSinceLastCustomer:', chat.hoursSinceLastCustomer);
      console.log('\n🧪 CONDITION TESTS:');
      console.log('isUnreadZero:', chat.isUnreadZero);
      console.log('isReminderNotHandled:', chat.isReminderNotHandled);
      console.log('isHoursGte6:', chat.isHoursGte6);
      console.log('shouldBeReminder:', chat.shouldBeReminder);
      console.log('\n🎯 FINAL RESULT:');
      console.log('chatType:', chat.chatType);
      
      if (chat.shouldBeReminder && chat.chatType !== 'reminder') {
        console.log('\n🚨 PROBLEM: shouldBeReminder is true but chatType is not reminder!');
        console.log('This suggests an issue with the switch logic or branch order.');
      }
    } else {
      console.log('❌ Chat not found');
    }

    await mongoose.disconnect();
    console.log('\n✅ Debug complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

debugAggregationLogic();
