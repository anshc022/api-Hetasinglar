const Admin = require('./models/Admin');

const createDefaultAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ adminId: 'admin' });
    
    if (!adminExists) {
      const defaultAdmin = new Admin({
        adminId: 'admin',
        password: 'admin123',
        name: 'Super Admin',
        role: 'super_admin'
      });
      
      await defaultAdmin.save();
      console.log('Default admin account created:');
      console.log('Admin ID: admin');
      console.log('Password: admin123');
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
};

module.exports = createDefaultAdmin;
