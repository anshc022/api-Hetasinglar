// Relationship Status options for escort profiles
const RELATIONSHIP_STATUSES = [
  'Single',
  'In a Relationship',
  'Married',
  'Divorced',
  'Widowed',
  'It\'s Complicated',
  'Open Relationship',
  'Separated',
  'Living Apart',
  'Mingle',
  'Prefer Not to Say'
];

// Helper function to validate if a relationship status is valid
function isValidRelationshipStatus(status) {
  return RELATIONSHIP_STATUSES.includes(status);
}

// Helper function to get all relationship statuses
function getRelationshipStatuses() {
  return [...RELATIONSHIP_STATUSES];
}

module.exports = {
  RELATIONSHIP_STATUSES,
  isValidRelationshipStatus,
  getRelationshipStatuses
};