const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');
const Agent = require('./models/Agent');

// Load environment variables
require('dotenv').config();

// Connect to MongoDB using same connection as server
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const testEscortProfileVisibility = async () => {
  try {
    console.log('🧪 Testing Escort Profile Visibility System...\n');

    // Test 1: Check current total profiles
    const totalProfiles = await EscortProfile.countDocuments({ status: 'active' });
    console.log(`📊 Total active escort profiles: ${totalProfiles}`);

    // Test 2: Check profiles by creator
    const profilesByCreator = await EscortProfile.aggregate([
      { $match: { status: 'active' } },
      { 
        $group: { 
          _id: { 
            creatorId: '$createdBy.id', 
            creatorType: '$createdBy.type' 
          }, 
          count: { $sum: 1 }, 
          profiles: { $push: { username: '$username', firstName: '$firstName' } } 
        } 
      }
    ]);

    console.log('\n👥 Profiles by creator:');
    for (const group of profilesByCreator) {
      console.log(`Creator ${group._id.creatorId} (${group._id.creatorType}): ${group.count} profiles`);
      group.profiles.forEach(profile => {
        console.log(`  - ${profile.username} (${profile.firstName})`);
      });
    }

    // Test 3: Check which agents exist
    const agents = await Agent.find()
      .select('username _id permissions')
      .limit(5);

    console.log('\n🏢 Available Agents:');
    agents.forEach(agent => {
      console.log(`- ${agent.username || 'Unnamed'} (ID: ${agent._id})`);
      console.log(`  Can create escorts: ${agent.permissions?.canCreateEscorts || false}`);
    });

    // Test 4: Simulate the new all-escorts endpoint
    console.log('\n🌐 Simulating /agents/all-escorts endpoint:');
    const allEscortsQuery = await EscortProfile.find({ 
      status: 'active'
    })
    .select('username firstName gender region createdBy createdAt')
    .sort({ createdAt: -1 })
    .lean()
    .exec();

    console.log(`✅ Would return ${allEscortsQuery.length} profiles to ALL agents:`);
    allEscortsQuery.forEach((profile, idx) => {
      console.log(`${idx + 1}. ${profile.username} (${profile.firstName}) - ${profile.gender} - ${profile.region}`);
      console.log(`   Created by: ${profile.createdBy?.id || profile.createdBy || 'Unknown'} on ${profile.createdAt?.toLocaleDateString()}`);
    });

    // Test 5: Check if there are any issues with the data
    const profilesWithIssues = await EscortProfile.find({
      $or: [
        { status: { $exists: false } },
        { status: { $nin: ['active', 'inactive'] } },
        { username: { $exists: false } },
        { gender: { $exists: false } }
      ]
    });

    if (profilesWithIssues.length > 0) {
      console.log(`\n⚠️  Found ${profilesWithIssues.length} profiles with potential issues:`);
      profilesWithIssues.forEach(profile => {
        console.log(`- ${profile._id}: Missing ${!profile.status ? 'status' : ''} ${!profile.username ? 'username' : ''} ${!profile.gender ? 'gender' : ''}`);
      });
    } else {
      console.log('\n✅ All profiles look good - no data issues found');
    }

    console.log('\n🎯 Expected behavior after fix:');
    console.log('- ALL agents will see ALL active profiles');
    console.log('- New profiles created by any agent appear for everyone');
    console.log('- Cache is invalidated on create/update/delete');
    console.log('- No more "disappearing profiles" issue');

    console.log('\n✅ Test complete!');
  } catch (error) {
    console.error('❌ Error testing escort profiles:', error);
  } finally {
    mongoose.disconnect();
  }
};

testEscortProfileVisibility();