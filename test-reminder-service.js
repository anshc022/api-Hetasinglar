// Test script for the reminder service
const reminderService = require('./services/reminderService');
const mongoose = require('mongoose');
const Chat = require('./models/Chat');

async function testReminderService() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get reminder statistics
    console.log('\n=== Reminder Statistics ===');
    const stats = await reminderService.getStats();
    console.log('Stats:', stats);

    // Test reminder creation logic
    console.log('\n=== Testing Reminder Creation ===');
    await reminderService.checkAndCreateReminders();

    // Test follow-up handling
    console.log('\n=== Testing Follow-up Handling ===');
    const sampleChat = await Chat.findOne().limit(1);
    if (sampleChat) {
      console.log('Testing follow-up for chat:', sampleChat._id);
      await reminderService.handleFollowUpAction(sampleChat._id.toString());
      console.log('Follow-up handled successfully');
    }

    // Test customer response handling
    console.log('\n=== Testing Customer Response Handling ===');
    if (sampleChat) {
      console.log('Testing customer response for chat:', sampleChat._id);
      await reminderService.handleCustomerResponse(sampleChat._id.toString());
      console.log('Customer response handled successfully');
    }

    console.log('\n=== Test completed successfully! ===');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the test
testReminderService();
