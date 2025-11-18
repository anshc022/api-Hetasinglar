const path = require('path');
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, '.env.production')
    : path.join(__dirname, '.env')
});
const { notifyNewCustomerRegistration, notifyPanicRoomStatus } = require('./services/discordNotificationService');

// Mock user data for testing
const testUser = {
  username: 'test_user_123',
  email: 'testuser@example.com',
  full_name: 'Test User McTest',
  profile: {
    firstName: 'Test',
    lastName: 'User',
    region: 'Stockholm',
    description: 'This is a test user created to verify Discord webhook integration works properly.',
    avatar: '/uploads/avatars/test-avatar.jpg'
  },
  referral: {
    affiliateCode: 'TEST123'
  }
};

const testPanicChat = {
  _id: '000000000000000000000000',
  customerId: '000000000000000000000111',
  customerName: 'Test Customer',
  escortId: '000000000000000000000222',
  isInPanicRoom: true,
  panicRoomReason: 'QA webhook test',
  panicRoomEnteredAt: new Date().toISOString()
};

const testPanicCustomer = {
  _id: '000000000000000000000111',
  username: 'panic_user',
  email: 'panic@example.com',
  profile: {
    firstName: 'Panic',
    lastName: 'Tester'
  }
};

(async () => {
  console.log('🚀 Testing Discord webhook notifications...');

  try {
    console.log('➡️  Sending new customer registration alert...');
    const registrationResult = await notifyNewCustomerRegistration(testUser);
    console.log('   Result:', registrationResult);

    console.log('➡️  Sending panic room entry alert...');
    const panicEntryResult = await notifyPanicRoomStatus(testPanicChat, {
      event: 'entered',
      customer: testPanicCustomer,
      triggeredBy: { name: 'Agent Automation' },
      notes: 'Manual webhook verification via test script.'
    });
    console.log('   Result:', panicEntryResult);

    console.log('➡️  Sending panic room message alert...');
    const panicMessageResult = await notifyPanicRoomStatus(testPanicChat, {
      event: 'message',
      customer: testPanicCustomer,
      message: 'Customer just sent a panic room message while you were away.',
      reason: testPanicChat.panicRoomReason
    });
    console.log('   Result:', panicMessageResult);

    console.log('➡️  Sending panic room removal alert...');
    const panicRemovalResult = await notifyPanicRoomStatus(testPanicChat, {
      event: 'removed',
      customer: testPanicCustomer,
      triggeredBy: { name: 'Agent Automation' },
      notes: 'Agent cleared panic room after resolving the issue.'
    });
    console.log('   Result:', panicRemovalResult);

    console.log('🎉 Discord webhook smoke test completed.');
  } catch (error) {
    console.error('💥 Test script error:', error);
  } finally {
    console.log('📋 Test finished. Check your Discord channel for all notifications.');
    process.exit(0);
  }
})();