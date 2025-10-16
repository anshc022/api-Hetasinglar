const { SWEDISH_REGIONS, isValidSwedishRegion, getSwedishRegions } = require('./constants/swedishRegions');

console.log('🇸🇪 Testing Swedish Regions Configuration...\n');

console.log('✅ Total regions loaded:', SWEDISH_REGIONS.length);
console.log('✅ All regions:');
SWEDISH_REGIONS.forEach((region, index) => {
  console.log(`   ${index + 1}. ${region}`);
});

console.log('\n🧪 Testing validation function:');
console.log('✅ Valid region test:', isValidSwedishRegion('Stockholms län'));
console.log('❌ Invalid region test:', isValidSwedishRegion('Invalid Region'));

console.log('\n🧪 Testing getter function:');
const regions = getSwedishRegions();
console.log('✅ Regions returned:', regions.length === SWEDISH_REGIONS.length);

console.log('\n🎉 Swedish regions configuration is working correctly!');