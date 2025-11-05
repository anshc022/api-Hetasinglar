/**
 * Database Index Optimization Script for Escort Profiles
 * Run this script to create optimal indexes for the /api/agents/escorts/active endpoint
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hetasinglar';

async function optimizeIndexes() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('escortprofiles');

    console.log('\n🔍 Analyzing current indexes...');
    const existingIndexes = await collection.indexes();
    console.log('Current indexes:', existingIndexes.map(idx => idx.name));

    console.log('\n📊 Creating optimized compound indexes...');
    
    // Primary compound index for the most common query patterns
    const indexes = [
      {
        name: 'escort_active_primary',
        spec: { status: 1, createdAt: -1 },
        options: { 
          background: true,
          name: 'escort_active_primary'
        }
      },
      {
        name: 'escort_active_country_region',
        spec: { status: 1, country: 1, region: 1, createdAt: -1 },
        options: { 
          background: true,
          name: 'escort_active_country_region'
        }
      },
      {
        name: 'escort_active_gender',
        spec: { status: 1, gender: 1, createdAt: -1 },
        options: { 
          background: true,
          name: 'escort_active_gender'
        }
      },
      {
        name: 'escort_active_country',
        spec: { status: 1, country: 1, createdAt: -1 },
        options: { 
          background: true,
          name: 'escort_active_country'
        }
      },
      {
        name: 'escort_active_comprehensive',
        spec: { status: 1, country: 1, region: 1, gender: 1, createdAt: -1 },
        options: { 
          background: true,
          name: 'escort_active_comprehensive'
        }
      }
    ];

    for (const { name, spec, options } of indexes) {
      try {
        console.log(`Creating index: ${name}...`);
        await collection.createIndex(spec, options);
        console.log(`✅ Created index: ${name}`);
      } catch (error) {
        if (error.code === 85) {
          console.log(`ℹ️  Index ${name} already exists with different options`);
        } else {
          console.error(`❌ Failed to create index ${name}:`, error.message);
        }
      }
    }

    console.log('\n📈 Analyzing collection stats...');
    const stats = await collection.stats();
    console.log(`Collection size: ${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB`);
    console.log(`Document count: ${stats.count}`);
    console.log(`Average document size: ${Math.round(stats.avgObjSize)} bytes`);

    console.log('\n🔍 Final index list:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(idx => {
      console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n✅ Index optimization completed!');
    console.log('\n💡 Performance tips:');
    console.log('   - The primary index handles status + createdAt queries');
    console.log('   - Compound indexes support filtered queries');
    console.log('   - All indexes are created in background mode');
    console.log('   - Monitor query performance with explain() in MongoDB');
    
  } catch (error) {
    console.error('❌ Error optimizing indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the optimization
if (require.main === module) {
  optimizeIndexes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { optimizeIndexes };