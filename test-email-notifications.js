const emailService = require('./services/emailService');
const User = require('./models/User');
const mongoose = require('mongoose');

// Load environment variables
require('dotenv').config();

// Connect to database
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testEmailNotifications() {
  try {
    console.log('🔧 Testing Email Configuration...');
    
    // Test email connection
    const connectionTest = await emailService.testEmailConnection();
    console.log('Connection test result:', connectionTest);
    
    if (!connectionTest) {
      console.error('❌ Email connection failed!');
      console.log('Email configuration:');
      console.log('- SMTP_HOST:', process.env.SMTP_HOST);
      console.log('- SMTP_PORT:', process.env.SMTP_PORT);
      console.log('- EMAIL_USER:', process.env.EMAIL_USER);
      console.log('- EMAIL_PASS:', process.env.EMAIL_PASS ? '[CONFIGURED]' : '[MISSING]');
      return;
    }
    
    console.log('✅ Email connection successful!');
    
    // Test message notification
    console.log('📧 Testing message notification...');
    const testResult = await emailService.sendMessageNotification(
      'test@example.com',
      'TestUser',
      'TestEscort',
      'This is a test message notification',
      'https://hetasinglar.se'
    );
    
    console.log('Message notification test result:', testResult);
    
    // Check a real user's notification settings
    const sampleUser = await User.findOne({ email: { $exists: true, $ne: null } })
      .select('email username preferences notificationSettings')
      .lean();
    
    if (sampleUser) {
      console.log('\n👤 Sample user notification settings:');
      console.log('Email:', sampleUser.email);
      console.log('Username:', sampleUser.username);
      console.log('Email updates enabled:', sampleUser.preferences?.emailUpdates);
      console.log('Notifications enabled:', sampleUser.preferences?.notifications);
      console.log('Granular settings:', JSON.stringify(sampleUser.preferences?.notificationSettings, null, 2));
    } else {
      console.log('⚠️ No users found with email addresses');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

testEmailNotifications();