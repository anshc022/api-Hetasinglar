const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');
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

const fixEscortCreatedByField = async () => {
  try {
    await connectDB();
    
    console.log('Fixing escort createdBy field structure...');
    
    // Get all escort profiles
    const escorts = await EscortProfile.find({});
    console.log(`Found ${escorts.length} escort profiles`);
    
    let fixedCount = 0;
    
    for (const escort of escorts) {
      let needsUpdate = false;
      let newCreatedBy = escort.createdBy;
      
      // Case 1: createdBy is a direct ObjectId (old format)
      if (mongoose.Types.ObjectId.isValid(escort.createdBy) && typeof escort.createdBy === 'object' && !escort.createdBy.id) {
        newCreatedBy = {
          id: escort.createdBy,
          type: 'Agent'
        };
        needsUpdate = true;
        console.log(`- Fixing ${escort.firstName}: ObjectId -> {id, type}`);
      }
      
      // Case 2: createdBy has type but no id
      else if (escort.createdBy && escort.createdBy.type && !escort.createdBy.id) {
        // Try to find the agent that created this escort
        // This is more complex, we might need to guess or set a default
        console.log(`- Escort ${escort.firstName} has type but no id - needs manual review`);
        
        // For now, let's try to find the first agent as a fallback
        const firstAgent = await Agent.findOne({});
        if (firstAgent) {
          newCreatedBy = {
            id: firstAgent._id,
            type: 'Agent'
          };
          needsUpdate = true;
          console.log(`  -> Assigning to agent: ${firstAgent.agentId}`);
        }
      }
      
      // Case 3: createdBy is properly structured
      else if (escort.createdBy && escort.createdBy.id && escort.createdBy.type) {
        console.log(`- ${escort.firstName}: Already correct format`);
      }
      
      // Case 4: createdBy is null or undefined
      else if (!escort.createdBy) {
        const firstAgent = await Agent.findOne({});
        if (firstAgent) {
          newCreatedBy = {
            id: firstAgent._id,
            type: 'Agent'
          };
          needsUpdate = true;
          console.log(`- ${escort.firstName}: No createdBy -> assigning to ${firstAgent.agentId}`);
        }
      }
      
      if (needsUpdate) {
        await EscortProfile.updateOne(
          { _id: escort._id },
          { $set: { createdBy: newCreatedBy } }
        );
        fixedCount++;
      }
    }
    
    console.log(`\\nFixed ${fixedCount} escort profiles`);
    
    // Verify the fix
    console.log('\\nVerifying results:');
    const updatedEscorts = await EscortProfile.find({});
    updatedEscorts.forEach(escort => {
      console.log(`- ${escort.firstName}: createdBy =`, escort.createdBy);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error fixing escort data:', error);
    process.exit(1);
  }
};

fixEscortCreatedByField();
