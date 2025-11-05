const { normalizeSwedishRegion, isValidSwedishRegion, getSwedishRegions } = require('./constants/swedishRegions');

console.log('🔍 Testing Halland Region Issue\n');

// Test the specific input causing the issue
const testInput = 'Halland';
console.log(`Input: "${testInput}"`);

// Test normalization
const normalized = normalizeSwedishRegion(testInput);
console.log(`Normalized: "${normalized}"`);

// Test validation of original input
const isValidOriginal = isValidSwedishRegion(testInput);
console.log(`Is "${testInput}" valid: ${isValidOriginal}`);

// Test validation of normalized input
const isValidNormalized = normalized ? isValidSwedishRegion(normalized) : false;
console.log(`Is "${normalized}" valid: ${isValidNormalized}`);

// Show all valid regions for reference
console.log('\n📋 All Valid Regions:');
const regions = getSwedishRegions();
regions.forEach((region, index) => {
  console.log(`${index + 1}. ${region}`);
});

// Test the normalization logic step by step
console.log('\n🧪 Testing normalization logic:');
const testCases = ['Halland', 'halland', 'Hallands', 'hallands', 'Hallands län', 'hallands län'];
testCases.forEach(test => {
  const result = normalizeSwedishRegion(test);
  console.log(`"${test}" -> "${result}"`);
});

console.log('\n✅ Test complete');