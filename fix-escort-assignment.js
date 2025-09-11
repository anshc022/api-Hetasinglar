const mongoose = require('mongoose');
require('dotenv').config();

// Hardcoded database URL
const MONGODB_URI = 'mongodb://wevogih251:hI236eYIa3sfyYCq@dating-shard-00-00.flel6.mongodb.net:27017,dating-shard-00-01.flel6.mongodb.net:27017,dating-shard-00-02.flel6.mongodb.net:27017/hetasinglar?ssl=true&replicaSet=atlas-13q7g3-shard-0&authSource=admin&retryWrites=true&w=majority';

async function assignEscortToAgent() {
  try {
    console.log('🔗 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const EscortProfile = require('./models/EscortProfile');
    
    const escortId = '689bac40be47938f4778b1ab'; // StandigtVatkat
    const newAgentId = '68b1e280f48f75cefabf1cb1'; // Ansh
    
    const result = await EscortProfile.updateOne(
      { _id: escortId },
      { 
        $set: { 
          'createdBy.id': new mongoose.Types.ObjectId(newAgentId),
          'createdBy.type': 'Agent'
        } 
      }
    );
    
    console.log('Update result:', result);
    console.log('✅ Escort reassigned to current agent');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

assignEscortToAgent();
