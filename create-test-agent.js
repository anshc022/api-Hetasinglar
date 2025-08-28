/**
 * Create Test Agent for Live Queue Testing
 */

const mongoose = require('mongoose');
const Agent = require('./models/Agent');
require('dotenv').config();

async function createTestAgent() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if test agent exists
        let agent = await Agent.findOne({ agentId: 'testagent' });
        
        if (agent) {
            console.log('⚠️ Test agent already exists');
        } else {
            // Create test agent
            agent = new Agent({
                agentId: 'testagent',
                password: 'TestAgent123',
                name: 'Test Agent',
                email: 'testagent@example.com',
                stats: {
                    totalChats: 0,
                    totalEarnings: 0,
                    avgResponseTime: 0
                }
            });

            await agent.save();
            console.log('✅ Test agent created successfully');
        }

        console.log('\n👤 Test Agent Details:');
        console.log(`Agent ID: ${agent.agentId}`);
        console.log(`Password: TestAgent123`);
        console.log(`Name: ${agent.name}`);
        console.log(`ID: ${agent._id}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
    }
}

if (require.main === module) {
    createTestAgent();
}

module.exports = { createTestAgent };
