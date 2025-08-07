const mongoose = require('mongoose');
const Agent = require('./models/Agent');

async function listAgents() {
  try {
    await mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB connected successfully');
    console.log('Listing all agents...\n');

    const agents = await Agent.find({}, 'agentId name email permissions');
    console.log(`Found ${agents.length} agents:`);
    
    for (const agent of agents) {
      console.log(`- Agent ID: ${agent.agentId}`);
      console.log(`  Name: ${agent.name}`);
      console.log(`  Email: ${agent.email}`);
      console.log(`  Can Create Escorts: ${agent.permissions?.canCreateEscorts}`);
      console.log(`  MongoDB ID: ${agent._id}`);
      console.log('');
    }

    await mongoose.connection.close();
    
  } catch (error) {
    console.error('Failed:', error);
  }
}

listAgents();
