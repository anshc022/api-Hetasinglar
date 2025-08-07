// Update all existing earnings to use proper coin system
const mongoose = require('mongoose');
const Earnings = require('./models/Earnings');
const Chat = require('./models/Chat');
const User = require('./models/User');

async function updateCoinsInEarnings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');
    
    // Update existing earnings that have creditsUsed but no coinsUsed
    const earningsToUpdate = await Earnings.find({
      $and: [
        // Ensure required fields exist
        { userId: { $exists: true } },
        { chatId: { $exists: true } },
        { agentId: { $exists: true } },
        { transactionId: { $exists: true } },
        // And need coin updates
        {
          $or: [
            { coinsUsed: { $exists: false } },
            { coinsUsed: 0 },
            { coinValue: { $exists: false } },
            { coinValue: 0 }
          ]
        }
      ]
    });

    console.log(`Found ${earningsToUpdate.length} earnings records to update`);

    for (const earning of earningsToUpdate) {
      try {
        let coinsUsed = earning.coinsUsed || earning.creditsUsed || 5; // Default to 5 coins if none
        let coinValue = earning.coinValue || earning.costPerCredit || 1.0; // $1 per coin
        
        // Calculate total amount based on coins if not set properly
        let totalAmount = earning.totalAmount;
        if (!totalAmount || totalAmount === 0) {
          totalAmount = coinsUsed * coinValue;
        }

        // Update the earning
        earning.coinsUsed = coinsUsed;
        earning.coinValue = coinValue;
        earning.totalAmount = totalAmount;

        // Ensure commission breakdown is correct
        if (!earning.adminCommission || !earning.adminCommission.amount || 
            !earning.chatAgentCommission || !earning.chatAgentCommission.amount || 
            !earning.affiliateCommission || !earning.affiliateCommission.amount) {
          
          const adminPerc = earning.adminCommission?.percentage || 50;
          const chatAgentPerc = earning.chatAgentCommission?.percentage || 30;
          const affiliatePerc = earning.affiliateCommission?.percentage || 20;

          if (!earning.adminCommission) earning.adminCommission = {};
          if (!earning.chatAgentCommission) earning.chatAgentCommission = {};
          if (!earning.affiliateCommission) earning.affiliateCommission = {};

          earning.adminCommission.percentage = adminPerc;
          earning.adminCommission.amount = (totalAmount * adminPerc) / 100;
          earning.chatAgentCommission.percentage = chatAgentPerc;
          earning.chatAgentCommission.amount = (totalAmount * chatAgentPerc) / 100;
          earning.affiliateCommission.percentage = affiliatePerc;
          earning.affiliateCommission.amount = (totalAmount * affiliatePerc) / 100;
        }

        await earning.save();
        console.log(`Updated earning ${earning._id}: ${coinsUsed} coins = $${totalAmount}`);
      } catch (error) {
        console.error(`Error updating earning ${earning._id}:`, error.message);
      }
    }

    // Check if there are chats without earnings and create sample earnings for them
    const chatsWithoutEarnings = await Chat.aggregate([
      {
        $lookup: {
          from: 'earnings',
          localField: '_id',
          foreignField: 'chatId',
          as: 'earnings'
        }
      },
      {
        $match: {
          'earnings.0': { $exists: false }, // Chats with no earnings
          status: { $in: ['assigned', 'closed'] } // Only active or completed chats
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $lookup: {
          from: 'agents',
          localField: 'agentId',
          foreignField: '_id',
          as: 'agent'
        }
      },
      {
        $match: {
          'customer.0': { $exists: true },
          'agent.0': { $exists: true }
        }
      }
    ]);

    console.log(`Found ${chatsWithoutEarnings.length} chats without earnings`);

    for (const chatData of chatsWithoutEarnings) {
      const chat = chatData;
      const customer = chatData.customer[0];
      const agent = chatData.agent[0];
      
      // Calculate coins used based on messages in the chat
      const messageCount = chat.messages ? chat.messages.length : 0;
      const customerMessages = chat.messages ? chat.messages.filter(m => m.sender === 'customer').length : 0;
      
      // Assume 1 coin per customer message (minimum 1 coin for having a chat)
      const coinsUsed = Math.max(1, customerMessages);
      const coinValue = 1.0; // $1 per coin
      const totalAmount = coinsUsed * coinValue;

      // Create earnings for this chat
      const earning = new Earnings({
        transactionId: `TXN-BACKFILL-${Date.now()}-${chat._id}`,
        userId: customer._id,
        chatId: chat._id,
        agentId: agent._id,
        totalAmount,
        coinsUsed,
        coinValue,
        adminCommission: {
          percentage: 50,
          amount: totalAmount * 0.5
        },
        chatAgentCommission: {
          percentage: 30,
          amount: totalAmount * 0.3
        },
        affiliateCommission: {
          percentage: 20,
          amount: totalAmount * 0.2
        },
        transactionDate: chat.createdAt || new Date(),
        messageType: 'text',
        description: `Backfilled earnings for existing chat`,
        paymentStatus: 'processed' // Mark as processed since it's historical
      });

      await earning.save();
      console.log(`Created earnings for chat ${chat._id}: ${coinsUsed} coins = $${totalAmount}`);
    }

    // Update all users to ensure they have coin balance
    const usersWithoutCoins = await User.find({
      $or: [
        { 'coins.balance': { $exists: false } },
        { 'coins.balance': { $lt: 10 } } // Give users with less than 10 coins some more
      ]
    });

    console.log(`Found ${usersWithoutCoins.length} users to update with coins`);

    for (const user of usersWithoutCoins) {
      if (!user.coins) {
        user.coins = {};
      }
      
      // Give users a starting balance of 50 coins for testing
      user.coins.balance = Math.max(50, user.coins.balance || 0);
      user.coins.totalPurchased = (user.coins.totalPurchased || 0) + 50;
      user.coins.lastPurchaseDate = new Date();

      await user.save();
      console.log(`Updated user ${user.username} with ${user.coins.balance} coins`);
    }

    console.log('Coin system update completed successfully!');
    
    // Show summary
    const totalEarnings = await Earnings.countDocuments();
    const totalCoinsEarnings = await Earnings.countDocuments({ coinsUsed: { $gt: 0 } });
    const totalChats = await Chat.countDocuments();
    const chatsWithEarnings = await Chat.aggregate([
      {
        $lookup: {
          from: 'earnings',
          localField: '_id',
          foreignField: 'chatId',
          as: 'earnings'
        }
      },
      {
        $match: {
          'earnings.0': { $exists: true }
        }
      },
      { $count: 'count' }
    ]);

    console.log('\n=== SUMMARY ===');
    console.log(`Total earnings records: ${totalEarnings}`);
    console.log(`Earnings with coins: ${totalCoinsEarnings}`);
    console.log(`Total chats: ${totalChats}`);
    console.log(`Chats with earnings: ${chatsWithEarnings.length > 0 ? chatsWithEarnings[0].count : 0}`);

  } catch (error) {
    console.error('Error updating coin system:', error);
  } finally {
    await mongoose.disconnect();
  }
}

updateCoinsInEarnings();
