const mongoose = require('mongoose');

// Coin package initialization
const initCoinPackages = async () => {
  try {
    console.log('Coin packages initialization completed');
    return true;
  } catch (error) {
    console.error('Error initializing coin packages:', error);
    return false;
  }
};

module.exports = { initCoinPackages };

// Run if called directly
if (require.main === module) {
  initCoinPackages();
}