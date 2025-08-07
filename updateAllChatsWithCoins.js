// Update all existing chats with proper coin tracking and earnings
const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const Earnings = require('./models/Earnings');
const User = require('./models/User');
const Agent = require('./models/Agent');
const EscortProfile = require('./models/EscortProfile');

async function updateAllChatsWithCoins() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Get all chats
    const chats = await Chat.find({})
      .populate('customerId', 'username')
      .populate('agentId', 'name')
      .populate('escortId', 'firstName lastName');

    console.log(`Found ${chats.length} chats to process`);

    let updatedChats = 0;
    let createdEarnings = 0;

    for (const chat of chats) {
      try {
        console.log(`\nProcessing chat ${chat._id}:`);
        console.log(`- Customer: ${chat.customerId?.username || 'Unknown'}`);
        console.log(`- Agent: ${chat.agentId?.name || 'Unknown'}`);
        console.log(`- Escort: ${chat.escortId?.firstName || 'Unknown'}`);
        console.log(`- Messages: ${chat.messages?.length || 0}`);
        console.log(`- Status: ${chat.status}`);

        // Check if this chat already has earnings
        const existingEarnings = await Earnings.find({ chatId: chat._id });
        console.log(`- Existing earnings: ${existingEarnings.length}`);

        // If no earnings exist and chat has messages, create earnings based on message count
        if (existingEarnings.length === 0 && chat.messages && chat.messages.length > 0) {
          // Count customer messages (these would use coins)
          const customerMessages = chat.messages.filter(msg => msg.sender === 'customer');
          
          if (customerMessages.length > 0) {
            // Create earnings for each customer message (1 coin per message)
            for (let i = 0; i < customerMessages.length; i++) {
              const message = customerMessages[i];
              const coinsUsed = 1; // 1 coin per message
              const coinValue = 1.0; // $1 per coin
              const totalAmount = coinsUsed * coinValue;

              const earning = new Earnings({
                transactionId: `MIGRATION-${chat._id}-${i}-${Date.now()}`,
                userId: chat.customerId._id,
                chatId: chat._id,
                agentId: chat.agentId._id,
                totalAmount,
                coinsUsed,
                coinValue,
                // Legacy fields for backward compatibility
                creditsUsed: coinsUsed,
                costPerCredit: coinValue,
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
                transactionDate: message.timestamp || chat.createdAt,
                messageType: message.messageType || 'text',
                description: `Migrated earnings for message in chat ${chat._id}`,
                paymentStatus: 'processed'
              });

              await earning.save();
              createdEarnings++;
            }
            
            console.log(`- Created ${customerMessages.length} earnings for customer messages`);
          }
        }

        // Update chat metadata if needed
        let chatUpdated = false;

        // Ensure chat has proper status
        if (!chat.status || !['new', 'assigned', 'closed', 'pushed'].includes(chat.status)) {
          chat.status = chat.messages && chat.messages.length > 0 ? 'assigned' : 'new';
          chatUpdated = true;
        }

        // Add coin usage summary to chat
        const totalEarnings = await Earnings.find({ chatId: chat._id });
        const totalCoinsUsed = totalEarnings.reduce((sum, earning) => sum + (earning.coinsUsed || 0), 0);
        const totalEarningsAmount = totalEarnings.reduce((sum, earning) => sum + (earning.chatAgentCommission?.amount || 0), 0);

        // Add metadata if it doesn't exist
        if (!chat.metadata) {
          chat.metadata = {};
          chatUpdated = true;
        }

        // Update coin tracking metadata
        if (chat.metadata.totalCoinsUsed !== totalCoinsUsed || chat.metadata.totalEarnings !== totalEarningsAmount) {
          chat.metadata.totalCoinsUsed = totalCoinsUsed;
          chat.metadata.totalEarnings = totalEarningsAmount;
          chat.metadata.lastCoinUpdate = new Date();
          chatUpdated = true;
        }

        if (chatUpdated) {
          await chat.save();
          updatedChats++;
          console.log(`- Updated chat metadata (${totalCoinsUsed} coins, $${totalEarningsAmount.toFixed(2)} earnings)`);
        }

      } catch (error) {
        console.error(`Error processing chat ${chat._id}:`, error.message);
      }
    }

    console.log('\n=== UPDATE SUMMARY ===');
    console.log(`Total chats processed: ${chats.length}`);
    console.log(`Chats updated: ${updatedChats}`);
    console.log(`New earnings created: ${createdEarnings}`);

    // Show summary of all chats with their coin data
    console.log('\n=== CHAT SUMMARY ===');
    const updatedChats2 = await Chat.find({})
      .populate('customerId', 'username')
      .populate('agentId', 'name')
      .populate('escortId', 'firstName lastName');

    for (const chat of updatedChats2) {
      const earnings = await Earnings.find({ chatId: chat._id });
      const totalCoins = earnings.reduce((sum, e) => sum + (e.coinsUsed || 0), 0);
      const totalEarnings = earnings.reduce((sum, e) => sum + (e.chatAgentCommission?.amount || 0), 0);

      console.log(`Chat ${chat._id.toString().slice(-6)}... | Customer: ${(chat.customerId?.username || 'Unknown').padEnd(15)} | Agent: ${(chat.agentId?.name || 'Unknown').padEnd(15)} | Escort: ${(chat.escortId?.firstName || 'Unknown').padEnd(15)} | Messages: ${(chat.messages?.length || 0).toString().padStart(3)} | Coins: ${totalCoins.toString().padStart(3)} | Earnings: $${totalEarnings.toFixed(2).padStart(6)}`);
    }

  } catch (error) {
    console.error('Error updating chats:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the update
updateAllChatsWithCoins().catch(console.error);
