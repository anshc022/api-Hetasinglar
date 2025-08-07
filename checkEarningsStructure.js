const mongoose = require('mongoose');
const Earnings = require('./models/Earnings');

async function checkEarningsStructure() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority');
    console.log('Connected to MongoDB Atlas');
    
    // Get a few sample earnings records
    const samples = await Earnings.find({}).limit(3).lean();
    console.log(`Found ${samples.length} earnings records`);
    
    if (samples.length > 0) {
      console.log('\nSample earnings record structure:');
      console.log('Fields available in first record:');
      console.log(Object.keys(samples[0]));
      console.log('\nFirst sample record:');
      console.log(JSON.stringify(samples[0], null, 2));
      
      if (samples.length > 1) {
        console.log('\nSecond sample record:');
        console.log(JSON.stringify(samples[1], null, 2));
      }
    } else {
      console.log('No earnings records found in the database');
    }
    
    // Check if we have the agent we're testing with
    const agentEarnings = await Earnings.find({ agentId: new mongoose.Types.ObjectId('6801375e6ffd111f2af0456e') }).limit(2).lean();
    console.log(`\nFound ${agentEarnings.length} earnings records for agent1`);
    
    if (agentEarnings.length > 0) {
      console.log('Agent earnings sample:');
      console.log(JSON.stringify(agentEarnings[0], null, 2));
    }
    
    mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkEarningsStructure();
