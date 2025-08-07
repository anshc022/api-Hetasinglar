const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');
const Agent = require('./models/Agent');

async function migrateAllEscortData() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB connected successfully');
    console.log('Migrating ALL escort profiles to new createdBy format...\n');

    // Find all escort profiles
    const allEscorts = await EscortProfile.find({});
    console.log(`Found ${allEscorts.length} escort profiles`);

    // Get all agents to use as fallback
    const agents = await Agent.find({}, '_id');
    const defaultAgentId = agents.length > 0 ? agents[0]._id : null;

    if (!defaultAgentId) {
      console.error('No agents found! Cannot proceed with migration.');
      process.exit(1);
    }

    let migratedCount = 0;    for (const escort of allEscorts) {
      let needsUpdate = false;
      let newCreatedBy = escort.createdBy;

      console.log(`Processing ${escort.name || 'unnamed'}: createdBy type = ${typeof escort.createdBy}, value = ${JSON.stringify(escort.createdBy)}`);

      // Handle Buffer objects
      if (Buffer.isBuffer(escort.createdBy)) {
        try {
          const objectId = new mongoose.Types.ObjectId(escort.createdBy);
          newCreatedBy = {
            id: objectId,
            type: 'Agent'
          };
          needsUpdate = true;
          console.log(`- Converting ${escort.name}: Buffer -> {id, type}`);
        } catch (error) {
          // Invalid buffer, assign to default agent
          newCreatedBy = {
            id: defaultAgentId,
            type: 'Agent'
          };
          needsUpdate = true;
          console.log(`- Fixing ${escort.name}: invalid Buffer -> default agent`);
        }
      }
      // Check if createdBy is in old format (just ObjectId)
      else if (mongoose.Types.ObjectId.isValid(escort.createdBy) && typeof escort.createdBy === 'object' && !escort.createdBy.id) {
        // Old format - convert to new format
        newCreatedBy = {
          id: escort.createdBy,
          type: 'Agent'
        };
        needsUpdate = true;
        console.log(`- Converting ${escort.name}: ObjectId -> {id, type}`);
      }
      // Check if it's a string or other invalid format
      else if (typeof escort.createdBy === 'string' || (!escort.createdBy || (!escort.createdBy.id && !mongoose.Types.ObjectId.isValid(escort.createdBy)))) {
        // Invalid format - assign to default agent
        newCreatedBy = {
          id: defaultAgentId,
          type: 'Agent'
        };
        needsUpdate = true;
        console.log(`- Fixing ${escort.name}: invalid format -> default agent`);
      }
      // Check if it has the new format but is missing type
      else if (escort.createdBy && escort.createdBy.id && !escort.createdBy.type) {
        newCreatedBy = {
          id: escort.createdBy.id,
          type: 'Agent'
        };
        needsUpdate = true;
        console.log(`- Adding type to ${escort.name}: {id} -> {id, type}`);
      }

      if (needsUpdate) {
        await EscortProfile.findByIdAndUpdate(escort._id, {
          createdBy: newCreatedBy
        });
        migratedCount++;
      }
    }

    console.log(`\nMigration completed! Updated ${migratedCount} escort profiles\n`);

    // Verify results
    console.log('Verifying migration results:');
    const verifyEscorts = await EscortProfile.find({}, 'name createdBy');
    
    for (const escort of verifyEscorts) {
      if (escort.createdBy && escort.createdBy.id) {
        console.log(`✓ ${escort.name}: createdBy = { id: ${escort.createdBy.id}, type: '${escort.createdBy.type}' }`);
      } else {
        console.log(`❌ ${escort.name}: INVALID createdBy = ${JSON.stringify(escort.createdBy)}`);
      }
    }

    await mongoose.connection.close();
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateAllEscortData();
