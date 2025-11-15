// Map to store active users and their last activity timestamp
const activeUsers = new Map();
// Track when we last persisted an activity update to the database to avoid spamming writes
const lastPersistedActivity = new Map();

const ActiveUsersService = {
  // Add or update a user's active status
  setUserActive(userId, lastSeen) {
    if (!userId) {
      return;
    }

    const key = typeof userId === 'string' ? userId : userId.toString();
    if (!key) {
      return;
    }

    const seenAt = lastSeen ? new Date(lastSeen) : new Date();
    if (Number.isNaN(seenAt.getTime())) {
      // Fallback to current time if timestamp is invalid
      activeUsers.set(key, new Date());
    } else {
      activeUsers.set(key, seenAt);
    }

    // Persist last active date occasionally so dashboards do not show stale data
    const now = Date.now();
    const lastPersisted = lastPersistedActivity.get(key) || 0;
    const persistThreshold = 5 * 60 * 1000; // 5 minutes

    if (now - lastPersisted >= persistThreshold) {
      lastPersistedActivity.set(key, now);

      // Defer the database update to the event loop to avoid blocking the caller
      setImmediate(async () => {
        try {
          const User = require('../models/User');
          const updateDate = activeUsers.get(key) || new Date();
          await User.updateOne(
            { _id: key },
            {
              $set: {
                lastActiveDate: updateDate,
                status: 'active'
              }
            }
          );
        } catch (error) {
          console.error('Failed to persist user activity:', error?.message || error);
          // Allow re-attempting soon if persistence fails
          lastPersistedActivity.delete(key);
        }
      });
    }
  },

  // Remove a user's active status
  removeUser(userId) {
    if (!userId) {
      return;
    }
    const key = typeof userId === 'string' ? userId : userId.toString();
    activeUsers.delete(key);
    lastPersistedActivity.delete(key);
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
        lastPersistedActivity.delete(userId);
      }
    }
  }
};

module.exports = ActiveUsersService;