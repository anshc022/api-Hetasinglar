const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');
const Agent = require('./models/Agent');

async function fixEscortDataFinal() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB connected successfully');
    console.log('Final fix for escort createdBy fields...\n');

    // Get default agent
    const agents = await Agent.find({}, '_id').limit(1);
    const defaultAgentId = agents.length > 0 ? agents[0]._id : null;

    if (!defaultAgentId) {
      console.error('No agents found! Cannot proceed.');
      process.exit(1);
    }

    console.log(`Using default agent ID: ${defaultAgentId}\n`);

    // Use direct MongoDB operations to avoid Mongoose casting issues
    const db = mongoose.connection.db;
    const collection = db.collection('escortprofiles');

    // Find all escorts
    const escorts = await collection.find({}).toArray();
    console.log(`Found ${escorts.length} escort profiles`);

    let fixedCount = 0;

    for (const escort of escorts) {
      let needsUpdate = false;
      let newCreatedBy;

      console.log(`Processing escort ${escort._id}:`);
      console.log(`  Current createdBy: ${JSON.stringify(escort.createdBy)}`);

      // Check the format and fix accordingly
      if (!escort.createdBy) {
        // No createdBy field
        newCreatedBy = {
          id: new mongoose.Types.ObjectId(defaultAgentId),
          type: 'Agent'
        };
        needsUpdate = true;
        console.log('  → Adding missing createdBy field');
      }
      else if (typeof escort.createdBy === 'string' || mongoose.Types.ObjectId.isValid(escort.createdBy)) {
        // Old format: just an ObjectId (string or ObjectId)
        newCreatedBy = {
          id: new mongoose.Types.ObjectId(escort.createdBy),
          type: 'Agent'
        };
        needsUpdate = true;
        console.log('  → Converting ObjectId to {id, type} format');
      }
      else if (escort.createdBy && typeof escort.createdBy === 'object') {
        // Object format - check if it needs fixing
        if (escort.createdBy.id && escort.createdBy.type === 'Agent') {
          console.log('  → Already in correct format');
          // Already correct format
        }
        else if (escort.createdBy.id) {
          // Has id but missing type
          newCreatedBy = {
            id: new mongoose.Types.ObjectId(escort.createdBy.id),
            type: 'Agent'
          };
          needsUpdate = true;
          console.log('  → Adding missing type field');
        }
        else {
          // Invalid object format
          newCreatedBy = {
            id: new mongoose.Types.ObjectId(defaultAgentId),
            type: 'Agent'
          };
          needsUpdate = true;
          console.log('  → Fixing invalid object format');
        }
      }
      else {
        // Unknown format
        newCreatedBy = {
          id: new mongoose.Types.ObjectId(defaultAgentId),
          type: 'Agent'
        };
        needsUpdate = true;
        console.log('  → Fixing unknown format');
      }

      if (needsUpdate) {
        await collection.updateOne(
          { _id: escort._id },
          { $set: { createdBy: newCreatedBy } }
        );
        fixedCount++;
        console.log(`  ✓ Updated`);
      }
      console.log('');
    }

    console.log(`\nFixed ${fixedCount} escort profiles\n`);

    // Verify the results
    console.log('Verification:');
    const verifyEscorts = await collection.find({}, { projection: { _id: 1, name: 1, createdBy: 1 } }).toArray();
    
    for (const escort of verifyEscorts) {
      if (escort.createdBy && escort.createdBy.id && escort.createdBy.type) {
        console.log(`✓ ${escort.name || 'unnamed'}: createdBy = { id: ${escort.createdBy.id}, type: '${escort.createdBy.type}' }`);
      } else {
        console.log(`❌ ${escort.name || 'unnamed'}: INVALID createdBy = ${JSON.stringify(escort.createdBy)}`);
      }
    }

    await mongoose.connection.close();
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

fixEscortDataFinal();
