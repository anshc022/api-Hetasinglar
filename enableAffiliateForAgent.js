const mongoose = require('mongoose');
const Agent = require('./models/Agent');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function enableAffiliateForAgent() {
  try {
    console.log('Fetching all agents...');
    const agents = await Agent.find({});
    
    console.log(`Found ${agents.length} agents:`);
    agents.forEach((agent, index) => {
      console.log(`${index + 1}. ID: ${agent._id}, AgentID: ${agent.agentId}, Name: ${agent.name}, Type: ${agent.agentType}, IsAffiliate: ${agent.affiliateData.isAffiliate}`);
    });

    if (agents.length === 0) {
      console.log('No agents found!');
      return;
    }

    // Enable affiliate for the first agent (or modify this to target specific agent)
    const agentToUpdate = agents[0]; // You can change this to target a specific agent
    
    console.log(`\nEnabling affiliate capabilities for agent: ${agentToUpdate.agentId} (${agentToUpdate.name})`);
    
    // Update the agent
    agentToUpdate.affiliateData.isAffiliate = true;
    agentToUpdate.agentType = 'both'; // Enable both chat and affiliate capabilities
    
    await agentToUpdate.save();
    
    console.log('Agent updated successfully!');
    console.log('Updated agent data:', {
      agentId: agentToUpdate.agentId,
      name: agentToUpdate.name,
      agentType: agentToUpdate.agentType,
      isAffiliate: agentToUpdate.affiliateData.isAffiliate,
      affiliateCode: agentToUpdate.affiliateData.affiliateCode
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

enableAffiliateForAgent();
