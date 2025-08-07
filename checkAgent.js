const mongoose = require('mongoose');
const Agent = require('./models/Agent');
const bcrypt = require('bcryptjs');

async function checkAgent() {
  try {
    await mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB connected successfully');
    
    const agent = await Agent.findOne({ agentId: 'agent1' });
    if (agent) {
      console.log('Agent found:');
      console.log(`- Name: ${agent.name}`);
      console.log(`- Has password: ${agent.password ? 'Yes' : 'No'}`);
      console.log(`- Password hash: ${agent.password}`);
      
      // Test common passwords
      const testPasswords = ['password123', 'admin', 'agent1', '123456', 'password'];
      
      for (const testPass of testPasswords) {
        if (agent.password) {
          try {
            const isValid = await bcrypt.compare(testPass, agent.password);
            console.log(`- Testing '${testPass}': ${isValid ? '✓ MATCH' : '✗ No match'}`);
          } catch (error) {
            console.log(`- Testing '${testPass}': Error - ${error.message}`);
          }
        }
      }
    } else {
      console.log('No agent found with agentId: agent1');
    }

    await mongoose.connection.close();
    
  } catch (error) {
    console.error('Failed:', error);
  }
}

checkAgent();
