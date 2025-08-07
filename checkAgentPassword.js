const mongoose = require('mongoose');
const Agent = require('./models/Agent');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkAgent() {
  try {
    const agent = await Agent.findOne({ agentId: 'agent1' });
    if (!agent) {
      console.log('Agent not found');
      return;
    }
    
    console.log('Agent found:', {
      agentId: agent.agentId,
      name: agent.name,
      hasPassword: !!agent.password,
      passwordLength: agent.password?.length
    });
    
    // Test common passwords
    const passwords = ['password', 'password123', '123456', 'agent1'];
    
    for (const pwd of passwords) {
      try {
        const isValid = await bcrypt.compare(pwd, agent.password);
        if (isValid) {
          console.log(`✓ Correct password found: "${pwd}"`);
          return;
        }
      } catch (err) {
        console.log(`✗ Error testing password "${pwd}":`, err.message);
      }
    }
    
    console.log('None of the common passwords worked');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkAgent();
