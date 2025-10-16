const mongoose = require('mongoose');
const AgentImage = require('./models/AgentImage');
const Agent = require('./models/Agent');
const EscortProfile = require('./models/EscortProfile');

// Load environment variables
require('dotenv').config();

// Connect to MongoDB using same connection as server
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const debugAgentImages = async () => {
  try {
    console.log('🔍 Debugging Agent Images...\n');

    // Check total agent images
    const totalImages = await AgentImage.countDocuments();
    console.log(`📊 Total AgentImage records: ${totalImages}`);

    // Check agents with images
    const agentsWithImages = await AgentImage.distinct('agentId');
    console.log(`👥 Agents with images: ${agentsWithImages.length}`);

    // Check escort profiles with images
    const escortProfilesWithImages = await AgentImage.distinct('escortProfileId');
    console.log(`💃 Escort profiles with images: ${escortProfilesWithImages.length}`);

    // Get sample images
    const sampleImages = await AgentImage.find()
      .populate('agentId', 'username')
      .populate('escortProfileId', 'firstName lastName')
      .limit(5)
      .select('filename mimeType size agentId escortProfileId uploadedAt isActive')
      .lean();

    console.log('\n📸 Sample Images:');
    sampleImages.forEach((img, idx) => {
      console.log(`${idx + 1}. ${img.filename} (${img.mimeType}, ${Math.round(img.size / 1024)}KB)`);
      console.log(`   Agent: ${img.agentId?.username || 'Unknown'}`);
      console.log(`   Escort: ${img.escortProfileId?.firstName || 'Unknown'} ${img.escortProfileId?.lastName || ''}`);
      console.log(`   Active: ${img.isActive}, Uploaded: ${img.uploadedAt}`);
      console.log('');
    });

    // Check for agents and escort profiles
    const totalAgents = await Agent.countDocuments();
    const totalEscorts = await EscortProfile.countDocuments();
    console.log(`\n🏢 Total Agents: ${totalAgents}`);
    console.log(`💼 Total Escort Profiles: ${totalEscorts}`);

    // Check if any agents have escort profiles
    const allAgents = await Agent.find()
      .select('username _id')
      .limit(5);

    console.log('\n� Sample Agents:');
    allAgents.forEach(agent => {
      console.log(`- ${agent.username} (ID: ${agent._id})`);
    });

    // Check specific agent images with their actual agentId values
    const imagesByAgent = await AgentImage.aggregate([
      { $group: { _id: '$agentId', count: { $sum: 1 }, filenames: { $push: '$filename' } } },
      { $limit: 5 }
    ]);

    console.log('\n📊 Images by Agent ID:');
    imagesByAgent.forEach(group => {
      console.log(`Agent ID: ${group._id} - ${group.count} images`);
      console.log(`Files: ${group.filenames.join(', ')}`);
    });

    console.log('\n✅ Debug complete!');
  } catch (error) {
    console.error('❌ Error debugging agent images:', error);
  } finally {
    mongoose.disconnect();
  }
};

debugAgentImages();