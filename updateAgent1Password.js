// Update agent1 password
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Agent = require('./models/Agent');

async function updateAgent1Password() {
  try {
    await mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority');
    
    const hashedPassword = await bcrypt.hash('agent123', 10);
    
    const result = await Agent.updateOne(
      { agentId: 'agent1' },
      { password: hashedPassword }
    );
    
    console.log('Password update result:', result);
    console.log('Agent1 password has been set to: agent123');
    
    mongoose.disconnect();
  } catch (error) {
    console.error('Error updating password:', error);
    mongoose.disconnect();
  }
}

updateAgent1Password();
