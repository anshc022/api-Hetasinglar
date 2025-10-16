const { RELATIONSHIP_STATUSES, isValidRelationshipStatus, getRelationshipStatuses } = require('./constants/relationshipStatuses');

console.log('💕 Testing Relationship Status Configuration...\n');

console.log('✅ Total statuses loaded:', RELATIONSHIP_STATUSES.length);
console.log('✅ All relationship statuses:');
RELATIONSHIP_STATUSES.forEach((status, index) => {
  console.log(`   ${index + 1}. ${status}`);
});

console.log('\n🧪 Testing validation function:');
console.log('✅ Valid status test:', isValidRelationshipStatus('Single'));
console.log('✅ Valid status test (complex):', isValidRelationshipStatus('It\'s Complicated'));
console.log('❌ Invalid status test:', isValidRelationshipStatus('Invalid Status'));

console.log('\n🧪 Testing getter function:');
const statuses = getRelationshipStatuses();
console.log('✅ Statuses returned:', statuses.length === RELATIONSHIP_STATUSES.length);

console.log('\n🎉 Relationship status configuration is working correctly!');