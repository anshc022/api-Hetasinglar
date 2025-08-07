const mongoose = require('mongoose');
const EscortProfile = require('./models/EscortProfile');

async function inspectEscortData() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB connected successfully');
    console.log('Inspecting escort data...\n');

    // Find all escort profiles
    const allEscorts = await EscortProfile.find({}).lean();
    console.log(`Found ${allEscorts.length} escort profiles\n`);

    for (const escort of allEscorts) {
      console.log('---');
      console.log(`Name: ${escort.name || 'unnamed'}`);
      console.log(`ID: ${escort._id}`);
      console.log(`createdBy: ${JSON.stringify(escort.createdBy)}`);
      console.log(`createdBy type: ${typeof escort.createdBy}`);
      console.log(`createdBy constructor: ${escort.createdBy?.constructor?.name}`);
      
      if (escort.createdBy && typeof escort.createdBy === 'object') {
        console.log(`createdBy.id: ${JSON.stringify(escort.createdBy.id)}`);
        console.log(`createdBy.id type: ${typeof escort.createdBy.id}`);
        console.log(`createdBy.id constructor: ${escort.createdBy.id?.constructor?.name}`);
        console.log(`createdBy.type: ${escort.createdBy.type}`);
        
        if (Buffer.isBuffer(escort.createdBy.id)) {
          console.log(`createdBy.id as string: ${escort.createdBy.id.toString('hex')}`);
        }
      }
      console.log('---\n');
    }

    await mongoose.connection.close();
    console.log('Inspection completed!');
    
  } catch (error) {
    console.error('Inspection failed:', error);
    process.exit(1);
  }
}

inspectEscortData();
