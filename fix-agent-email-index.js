const mongoose = require('mongoose');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://wevogih251:hI236eYIa3sfyYCq@dating.flel6.mongodb.net/hetasinglar?retryWrites=true&w=majority');
    console.log('Connected to MongoDB');

    const collection = mongoose.connection.db.collection('agents');

    console.log('Current indexes:');
    const before = await collection.listIndexes().toArray();
    before.forEach(i => console.log(`- ${i.name}:`, i.key));

    // Drop old email_1 index (non-sparse unique on nulls)
    const emailIdx = before.find(i => i.name === 'email_1');
    if (emailIdx) {
      console.log('Dropping old email_1 index...');
      await collection.dropIndex('email_1');
      console.log('Dropped email_1');
    } else {
      console.log('No email_1 index to drop');
    }

    // Create sparse unique index for email (allows multiple docs without email)
    console.log('Creating sparse unique index on email...');
    await collection.createIndex(
      { email: 1 },
      { name: 'email_1', unique: true, sparse: true }
    );
    console.log('Created sparse unique index email_1');

    console.log('Indexes after:');
    const after = await collection.listIndexes().toArray();
    after.forEach(i => console.log(`- ${i.name}:`, i.key));
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();
