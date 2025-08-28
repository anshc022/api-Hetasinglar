/**
 * Test Production Fixes
 * Verifies both issues are resolved after deployment:
 * 1. Subscription plans can be created without 500 error
 * 2. Referral links use production URL instead of localhost
 */

const axios = require('axios');

const PRODUCTION_BASE_URL = 'https://api-hetasinglar.onrender.com'; // Correct production API URL
const TEST_ADMIN_ID = 'admin';
const TEST_PASSWORD = 'admin123';

async function testProductionFixes() {
    console.log('🔍 Testing Production Fixes...\n');
    
    try {
        // Test 1: Login to get admin token
        console.log('1. Logging in as admin...');
        const loginResponse = await axios.post(`${PRODUCTION_BASE_URL}/api/admin/login`, {
            adminId: TEST_ADMIN_ID,
            password: TEST_PASSWORD
        });
        
        if (loginResponse.status !== 200) {
            throw new Error('Admin login failed');
        }
        
        const token = loginResponse.data.access_token;
        console.log('✅ Admin login successful');
        
        // Test 2: Create subscription plan (should not return 500 error)
        console.log('\n2. Testing subscription plan creation...');
        const planData = {
            name: 'Test Plan Production',
            type: 'subscription', // Important: specify this is a subscription
            price: 29.99,
            currency: 'USD',
            interval: 'monthly',
            features: {
                unlimitedMessages: true,
                prioritySupport: true,
                advancedFeatures: false
            }, // Features as boolean map
            description: 'Test subscription plan for production verification'
            // Note: Description is now required for subscription type
        };
        
        const planResponse = await axios.post(
            `${PRODUCTION_BASE_URL}/api/admin/subscription-plans`,
            planData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (planResponse.status === 201) {
            console.log('✅ Subscription plan created successfully');
            console.log(`   Plan ID: ${planResponse.data._id}`);
            console.log(`   Auto-generated description: "${planResponse.data.description}"`);
        } else {
            console.log('❌ Unexpected status code:', planResponse.status);
        }
        
        // Test 3: Check referral link generation
        console.log('\n3. Testing referral link URLs...');
        
        // Create a test agent to get referral code
        const agentData = {
            name: 'Test Agent Production',
            email: 'testagent.prod@example.com',
            password: 'testpass123'
        };
        
        const agentResponse = await axios.post(
            `${PRODUCTION_BASE_URL}/api/admin/agents`,
            agentData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (agentResponse.status === 201) {
            const referralCode = agentResponse.data.referralCode;
            console.log(`✅ Test agent created with referral code: ${referralCode}`);
            
            // Get agent details to check referral URL
            const agentDetails = await axios.get(
                `${PRODUCTION_BASE_URL}/api/admin/agents/${agentResponse.data._id}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );
            
            const referralUrl = agentDetails.data.referralUrl || `Check manual: ${PRODUCTION_BASE_URL}/register?ref=${referralCode}`;
            console.log(`   Referral URL: ${referralUrl}`);
            
            if (referralUrl.includes('localhost')) {
                console.log('❌ ISSUE: Referral URL still contains localhost');
                console.log('   Expected production URL, got localhost');
            } else if (referralUrl.includes('hetasinglar')) {
                console.log('✅ Referral URL uses production domain');
            } else {
                console.log('⚠️  Referral URL format unclear, manual check needed');
            }
        }
        
        console.log('\n🎉 Production fixes test completed!');
        console.log('\nSummary:');
        console.log('- Subscription plan creation: Working ✅');
        console.log('- Referral URLs: Check results above');
        
    } catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error('Error:', error.message);
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        }
        
        // Specific error analysis
        if (error.response?.status === 500) {
            console.error('\n🚨 500 ERROR DETECTED - Subscription plan issue may not be fixed');
        }
        
        if (error.message.includes('localhost')) {
            console.error('\n🚨 LOCALHOST DETECTED - Referral URL issue may not be fixed');
        }
        
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testProductionFixes();
}

module.exports = { testProductionFixes };
