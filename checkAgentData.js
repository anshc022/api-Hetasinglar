const { MongoClient } = require('mongodb');

async function checkAgentData() {
  try {
    const client = new MongoClient('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority');
    await client.connect();
    
    const db = client.db('hetasinglar');
    
    // Get all agents
    const agents = await db.collection('agents').find({}).toArray();
    console.log('Total agents:', agents.length);
    
    agents.forEach(agent => {
      console.log(`Agent: ${agent.username}, ID: ${agent._id}, Type: ${agent.agentType}, IsAffiliate: ${agent.affiliateData?.isAffiliate}`);
    });
    
    // Get affiliate links and match with agents
    const affiliateLinks = await db.collection('affiliatelinks').find({}).toArray();
    console.log('\nAffiliate links:');
    affiliateLinks.forEach(link => {
      const agent = agents.find(a => a._id.toString() === link.agentId.toString());
      console.log(`Link: ${link.affiliateCode}, Agent: ${agent ? agent.username : 'Unknown'}, AgentId: ${link.agentId}, Active: ${link.isActive}`);
    });
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAgentData();
