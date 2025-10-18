const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

// Load production environment
require('dotenv').config({
  path: path.join(__dirname, '.env.production')
});

async function debugLogin() {
  try {
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    console.log('🔗 MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
    console.log('🔑 JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');
    
    // Test MongoDB connection
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 30000,
      family: 4
    });
    console.log('✅ MongoDB connected');

    // Load Agent model
    const Agent = require('./models/Agent');
    
    // Test login flow
    const agentId = 'Dio123';
    const password = 'Dio123!';
    
    console.log('\n🔍 Finding agent:', agentId);
    const agent = await Agent.findOne({ agentId });
    
    if (!agent) {
      console.log('❌ Agent not found');
      return;
    }
    
    console.log('✅ Agent found:', agent.agentId);
    
    console.log('🔐 Validating password...');
    const isValid = await bcrypt.compare(password, agent.password);
    console.log('   Password valid:', isValid);
    
    if (!isValid) {
      console.log('❌ Invalid password');
      return;
    }
    
    console.log('🎫 Generating JWT token...');
    const token = jwt.sign(
      { agentId: agent._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login successful!');
    console.log('   Token length:', token.length);
    console.log('   Agent data:', {
      id: agent._id,
      agentId: agent.agentId,
      name: agent.name,
      role: agent.role
    });
    
  } catch (error) {
    console.error('❌ Login error:', error.message);
    console.error('   Name:', error.name);
    console.error('   Stack:', error.stack);
    
    if (error.message?.includes('buffering timed out')) {
      console.error('💡 This is a MongoDB connection timeout');
    }
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔒 Connection closed');
    }
  }
}

debugLogin();