const mongoose = require('mongoose');

async function fixDatabase() {
  try {
    // Connect to MongoDB (use the same connection string as the main app)
    await mongoose.connect('mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority');
    console.log('Connected to MongoDB');
    
    // Get the native MongoDB connection
    const db = mongoose.connection.db;
    const collection = db.collection('agentcustomers');
    
    // First, let's see what's in the collection
    const documents = await collection.find({}).toArray();
    console.log('Current documents in agentcustomers collection:');
    documents.forEach((doc, index) => {
      console.log(`Document ${index + 1}:`, doc);
    });
    
    // Check current indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:');
    indexes.forEach(index => {
      console.log('Index:', index.name, 'Keys:', index.key);
    });
    
    // Drop the entire collection to clean up
    console.log('Dropping agentcustomers collection...');
    await collection.drop();
    console.log('Collection dropped successfully');
    
    // Recreate the collection with proper schema
    const AgentCustomer = require('./models/AgentCustomer');
    
    // This will recreate the collection with the correct indexes
    console.log('Recreating collection with proper indexes...');
    await AgentCustomer.createIndexes();
    console.log('Collection and indexes recreated successfully');
    
    // Check the new indexes
    const newIndexes = await db.collection('agentcustomers').indexes();
    console.log('New indexes:');
    newIndexes.forEach(index => {
      console.log('Index:', index.name, 'Keys:', index.key);
    });
    
    await mongoose.disconnect();
    console.log('Database cleanup completed successfully!');
  } catch (error) {
    console.error('Error fixing database:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

fixDatabase();
