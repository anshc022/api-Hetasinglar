const mongoose = require('mongoose');
const Agent = require('./models/Agent');

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const updateAgentPermissions = async () => {
  try {
    await connectDB();
    
    console.log('Updating agent permissions...');
    
    // Update all agents to have canCreateEscorts permission
    const result = await Agent.updateMany(
      { 'permissions.canCreateEscorts': { $ne: true } },
      { 
        $set: { 
          'permissions.canCreateEscorts': true 
        } 
      }
    );
    
    console.log(`Updated ${result.modifiedCount} agents with canCreateEscorts permission`);
    
    // List all agents with their permissions
    const agents = await Agent.find({}, 'agentId name permissions.canCreateEscorts');
    console.log('\nCurrent agent permissions:');
    agents.forEach(agent => {
      console.log(`- ${agent.agentId} (${agent.name || 'No name'}): canCreateEscorts = ${agent.permissions?.canCreateEscorts}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error updating permissions:', error);
    process.exit(1);
  }
};

updateAgentPermissions();
