const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const User = require('./models/User');

async function testNewUserReminders() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    const usersToTest = ['qauser_y56fw4', 'qauser_yqknyt', 'qauser_ec90hg'];
    
    for (const username of usersToTest) {
      console.log(`\n🔍 TESTING ${username}...`);
      
      // Find the user
      const user = await User.findOne({ username });
      if (!user) {
        console.log(`❌ User ${username} not found`);
        continue;
      }

      // Find chat for this user
      const chat = await Chat.findOne({ customerId: user._id });
      if (!chat) {
        console.log(`❌ No chat found for ${username}`);
        continue;
      }

      console.log('Chat ID:', chat._id);
      console.log('Created:', chat.createdAt);
      console.log('Updated:', chat.updatedAt);
      console.log('Last Customer Response:', chat.lastCustomerResponse);
      console.log('Reminder Handled:', chat.reminderHandled);
      console.log('Requires Follow Up:', chat.requiresFollowUp);
      console.log('Messages count:', chat.messages.length);

      // Calculate hours manually
      const now = new Date();
      let hoursSinceLastCustomer = 0;
      
      if (chat.lastCustomerResponse) {
        hoursSinceLastCustomer = (now - chat.lastCustomerResponse) / (1000 * 60 * 60);
      } else if (chat.messages.length > 0) {
        const lastCustomerMsg = chat.messages.filter(m => m.sender === 'customer').pop();
        if (lastCustomerMsg) {
          hoursSinceLastCustomer = (now - lastCustomerMsg.timestamp) / (1000 * 60 * 60);
        } else {
          hoursSinceLastCustomer = (now - chat.updatedAt) / (1000 * 60 * 60);
        }
      } else {
        hoursSinceLastCustomer = (now - chat.updatedAt) / (1000 * 60 * 60);
      }

      const unreadCount = chat.messages.filter(m => m.sender === 'customer' && !m.readByAgent).length;
      
      console.log('Hours since last customer activity:', hoursSinceLastCustomer.toFixed(2));
      console.log('Unread count:', unreadCount);

      // Test the live queue aggregation logic for this specific chat
      const result = await Chat.aggregate([
        {
          $match: { _id: chat._id }
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
        }
      ]);

      if (result.length > 0) {
        const aggregationResult = result[0];
        console.log('\n📊 AGGREGATION RESULT:');
        console.log('chatType:', aggregationResult.chatType);
        console.log('unreadCount:', aggregationResult.unreadCount);
        console.log('hoursSinceLastCustomer:', aggregationResult.hoursSinceLastCustomer);
        
        console.log('\n🧮 LOGIC CHECK:');
        const shouldBeReminder = (
          aggregationResult.unreadCount === 0 && 
          chat.reminderHandled !== true && 
          aggregationResult.hoursSinceLastCustomer >= 6
        ) || (
          chat.requiresFollowUp === true && 
          aggregationResult.unreadCount === 0
        );
        
        console.log('Should be reminder:', shouldBeReminder);
        console.log('Actual chatType:', aggregationResult.chatType);
        
        if (shouldBeReminder !== (aggregationResult.chatType === 'reminder')) {
          console.log('🚨 MISMATCH: Logic says', shouldBeReminder, 'but chatType is', aggregationResult.chatType);
        }
        
        if (aggregationResult.chatType === 'reminder' && aggregationResult.hoursSinceLastCustomer < 6) {
          console.log('🚨 BUG: Showing as reminder but only', aggregationResult.hoursSinceLastCustomer.toFixed(2), 'hours!');
          
          // Check if requiresFollowUp is the cause
          if (chat.requiresFollowUp) {
            console.log('   CAUSE: requiresFollowUp is true');
          } else {
            console.log('   CAUSE: Unknown - this should not be a reminder!');
          }
        }
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Test complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

testNewUserReminders();
