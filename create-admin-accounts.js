/**
 * Create Multiple Admin Accounts
 * Creates 3 admin logins with different roles and access levels
 */

const mongoose = require('mongoose');
const Admin = require('./models/Admin');
require('dotenv').config();

const adminAccounts = [
  {
    adminId: 'superadmin',
    password: 'Super@Admin123',
    name: 'Super Administrator',
    role: 'super_admin'
  },
  {
    adminId: 'admin1',
    password: 'Admin@123',
    name: 'Admin Manager',
    role: 'admin'
  },
  {
    adminId: 'admin2',
    password: 'Admin@456',
    name: 'Content Admin',
    role: 'admin'
  }
];

async function createAdminAccounts() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n👥 Creating admin accounts...\n');

    for (const adminData of adminAccounts) {
      try {
        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ adminId: adminData.adminId });
        
        if (existingAdmin) {
          console.log(`⚠️  Admin '${adminData.adminId}' already exists - skipping`);
          continue;
        }

        // Create new admin
        const newAdmin = new Admin(adminData);
        await newAdmin.save();
        
        console.log(`✅ Created admin: ${adminData.adminId}`);
        console.log(`   Name: ${adminData.name}`);
        console.log(`   Role: ${adminData.role}`);
        console.log(`   Password: ${adminData.password}`);
        console.log('');
        
      } catch (error) {
        console.error(`❌ Failed to create admin '${adminData.adminId}':`, error.message);
      }
    }

    // List all admins
    console.log('\n📋 Current admin accounts:');
    const allAdmins = await Admin.find({}).select('adminId name role createdAt');
    
    allAdmins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.adminId}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Created: ${admin.createdAt.toISOString().split('T')[0]}`);
      console.log('');
    });

    console.log('🎉 Admin account creation completed!');
    console.log('\n📝 Login Credentials Summary:');
    console.log('='.repeat(50));
    
    adminAccounts.forEach((admin, index) => {
      console.log(`${index + 1}. Admin ID: ${admin.adminId}`);
      console.log(`   Password: ${admin.password}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Name: ${admin.name}`);
      console.log('-'.repeat(30));
    });

    console.log('\n🔐 How to login:');
    console.log('1. Go to your admin panel login page');
    console.log('2. Use any of the Admin ID/Password combinations above');
    console.log('3. Super Admin has full access, regular Admins have standard access');

  } catch (error) {
    console.error('\n❌ Error creating admin accounts:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Test login function
async function testAdminLogins() {
  const axios = require('axios');
  const PRODUCTION_BASE_URL = 'https://api-hetasinglar.onrender.com';
  
  console.log('\n🧪 Testing admin logins...\n');
  
  for (const admin of adminAccounts) {
    try {
      const response = await axios.post(`${PRODUCTION_BASE_URL}/api/admin/login`, {
        adminId: admin.adminId,
        password: admin.password
      });
      
      if (response.status === 200) {
        console.log(`✅ ${admin.adminId} login successful`);
      }
    } catch (error) {
      console.log(`❌ ${admin.adminId} login failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

// Run the script
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--test')) {
    testAdminLogins();
  } else {
    createAdminAccounts();
  }
}

module.exports = { createAdminAccounts, testAdminLogins, adminAccounts };
