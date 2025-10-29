/**
 * Test email notification functionality
 * Tests the sendMessageNotification function with different scenarios
 */
require('dotenv').config();
const emailService = require('./services/emailService');

async function testEmailNotifications() {
  console.log('🧪 Testing email notification system...\n');

  // Test 1: Basic notification
  console.log('📧 Test 1: Basic message notification');
  try {
    const success = await emailService.sendMessageNotification(
      'anshc022@gmail.com',
      'TestUser',
      'Anna',
      'Hello! How are you today?',
      'https://hetasinglar.se'
    );
    console.log(success ? '✅ Email sent successfully' : '❌ Email failed to send');
  } catch (error) {
    console.log('❌ Email error:', error.message);
  }

  // Test 2: Image message notification
  console.log('\n📸 Test 2: Image message notification');
  try {
    const success = await emailService.sendMessageNotification(
      'anshc022@gmail.com',
      'TestUser',
      'Maria',
      '📷 Image message',
      'https://hetasinglar.se'
    );
    console.log(success ? '✅ Image notification sent' : '❌ Image notification failed');
  } catch (error) {
    console.log('❌ Image notification error:', error.message);
  }

  // Test 3: Long message (should be truncated)
  console.log('\n📝 Test 3: Long message truncation');
  const longMessage = 'This is a very long message that should be truncated because it exceeds the maximum length that we want to show in email notifications. '.repeat(5);
  try {
    const success = await emailService.sendMessageNotification(
      'anshc022@gmail.com',
      'TestUser',
      'Sofia',
      longMessage,
      'https://hetasinglar.se'
    );
    console.log(success ? '✅ Long message notification sent (truncated)' : '❌ Long message notification failed');
  } catch (error) {
    console.log('❌ Long message error:', error.message);
  }

  console.log('\n� Note: These are test emails sent to anshc022@gmail.com');
  console.log('Check your Gmail inbox for the notification emails!');
  console.log('\n✅ Email notification tests complete!');
}

testEmailNotifications().catch(console.error);