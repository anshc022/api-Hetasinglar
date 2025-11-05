const { normalizeSwedishRegion, isValidSwedishRegion } = require('./constants/swedishRegions');

console.log('🧪 Testing Halland region fix on production:');
console.log('');
console.log('Input: "Halland"');
console.log('Normalized:', normalizeSwedishRegion('Halland'));
console.log('Is valid:', isValidSwedishRegion('Halland'));
console.log('');
console.log('✅ Production fix verification complete!');