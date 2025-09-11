const mongoose = require('mongoose');
require('dotenv').config();

// Use the real MongoDB URI from .env
const MONGODB_URI = process.env.MONGODB_URI;

async function debugLikes() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    console.log('URI:', MONGODB_URI ? 'Found in .env' : 'Not found');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Import models
    const Like = require('./models/Like');
    const EscortProfile = require('./models/EscortProfile');
    const Agent = require('./models/Agent');

    // Test data from the user's issue
    const agentId = '68b1e280f48f75cefabf1cb1';  // Agent 'Ansh'
    const escortId = '689bac40be47938f4778b1ab'; // StandigtVatkat
    const userId = '68bd0fdcf196377299c2660c';   // realtest123

    console.log('\n🔍 DEBUGGING LIKE SYSTEM ISSUE');
    console.log('=====================================');

    // 1. Check if the agent exists
    console.log('\n1. Checking agent...');
    const agent = await Agent.findById(agentId);
    console.log('Agent found:', agent ? `Yes - ${agent.name} (${agent.agentId})` : 'No');

    // 2. Check if the escort exists and who created it
    console.log('\n2. Checking escort...');
    const escort = await EscortProfile.findById(escortId);
    if (escort) {
      console.log('Escort found:', escort.username);
      console.log('Created by:', escort.createdBy);
      console.log('Created by ID:', escort.createdBy?.id);
      console.log('Created by type:', escort.createdBy?.type);
    } else {
      console.log('Escort not found!');
    }

    // 3. Check the like
    console.log('\n3. Checking like...');
    const like = await Like.findOne({ 
      userId: userId, 
      escortId: escortId 
    }).populate('escortId userId');
    
    if (like) {
      console.log('Like found:');
      console.log('- Like ID:', like._id);
      console.log('- Status:', like.status);
      console.log('- Created at:', like.likedAt);
      console.log('- User:', like.userId?.username);
      console.log('- Escort:', like.escortId?.username);
    } else {
      console.log('Like not found!');
    }

    // 4. Test the agent's like query
    console.log('\n4. Testing agent like query...');
    try {
      const agentLikes = await Like.getUnreadLikesForAgent(agentId);
      console.log('Agent can see likes:', agentLikes.length);
      
      if (agentLikes.length > 0) {
        agentLikes.forEach((like, index) => {
          console.log(`Like ${index + 1}:`, {
            likeId: like._id,
            user: like.user?.username,
            escort: like.escort?.username,
            escortCreatedBy: like.escort?.createdBy?.id
          });
        });
      } else {
        console.log('No likes found for this agent');
      }
    } catch (error) {
      console.error('Error getting agent likes:', error.message);
    }

    // 5. Check all escorts created by this agent
    console.log('\n5. Checking escorts created by this agent...');
    const agentEscorts = await EscortProfile.find({ 
      'createdBy.id': new mongoose.Types.ObjectId(agentId) 
    });
    console.log('Escorts created by agent:', agentEscorts.length);
    
    agentEscorts.forEach((escort, index) => {
      console.log(`Escort ${index + 1}:`, {
        id: escort._id,
        username: escort.username,
        createdBy: escort.createdBy?.id
      });
    });

    // 6. Check if the liked escort was created by any agent
    console.log('\n6. Checking if escort has ANY agent creator...');
    if (escort && escort.createdBy && escort.createdBy.id) {
      const escortCreator = await Agent.findById(escort.createdBy.id);
      console.log('Escort created by agent:', escortCreator ? `${escortCreator.name} (${escortCreator.agentId})` : 'Unknown agent');
      console.log('Is it our test agent?', escort.createdBy.id.toString() === agentId);
    } else {
      console.log('Escort has no creator or invalid creator data');
    }

    console.log('\n🎯 SOLUTION ANALYSIS');
    console.log('=====================================');
    
    if (escort && (!escort.createdBy || !escort.createdBy.id)) {
      console.log('❌ ISSUE: Escort has no createdBy field - this is why agent sees 0 likes');
      console.log('💡 SOLUTION: Need to assign escorts to agents or modify the query logic');
    } else if (escort && escort.createdBy.id.toString() !== agentId) {
      console.log('❌ ISSUE: Escort was created by a different agent');
      console.log('💡 SOLUTION: Either assign escort to current agent or show all likes');
    } else {
      console.log('✅ Configuration looks correct - need to investigate further');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

debugLikes();
