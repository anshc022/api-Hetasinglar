// Map to store active users and their last activity timestamp
const activeUsers = new Map();

const ActiveUsersService = {
  // Add or update a user's active status
  setUserActive(userId) {
    activeUsers.set(userId, new Date());
  },

  // Remove a user's active status
  removeUser(userId) {
    activeUsers.delete(userId);
  },

  // Check if a user is active
  isUserActive(userId) {
    return activeUsers.has(userId);
  },

  // Get all active users
  getActiveUsers() {
    return activeUsers; // Map<userId, lastSeenDate>
  },

  // For compatibility: return a Set of active user IDs
  getAllActiveUsers() {
    return new Set(Array.from(activeUsers.keys()));
  },

  // Clean up inactive users
  cleanupInactiveUsers() {
    const now = new Date();
    for (const [userId, lastActivity] of activeUsers.entries()) {
      // If user hasn't sent activity update in 2 minutes, consider them offline
      if (now - lastActivity > 120000) {
        activeUsers.delete(userId);
      }
    }
  }
};

module.exports = ActiveUsersService;