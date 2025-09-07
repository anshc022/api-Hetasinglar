const Chat = require('../models/Chat');
const { differenceInHours } = require('date-fns');

class ReminderService {
  constructor() {
    // Reminder thresholds in hours
    this.REMINDER_BASE_INTERVAL = 6;  // Base interval for counting reminders
    this.PRIORITY_THRESHOLDS = {
      NEW: 6,      // 6-24h
      MEDIUM: 24,  // 24-36h
      HIGH: 36,    // 36-56h
      CRITICAL: 56 // 56h+
    };
    this.isRunning = false;
  }

  /**
   * Get priority level based on hours since last message
   * @param {number} hours - Hours since last message
   * @returns {string} Priority level (NEW, MEDIUM, HIGH, CRITICAL)
   */
  getPriorityLevel(hours) {
    if (hours >= this.PRIORITY_THRESHOLDS.CRITICAL) return 'CRITICAL';
    if (hours >= this.PRIORITY_THRESHOLDS.HIGH) return 'HIGH';
    if (hours >= this.PRIORITY_THRESHOLDS.MEDIUM) return 'MEDIUM';
    if (hours >= this.PRIORITY_THRESHOLDS.NEW) return 'NEW';
    return null;
  }

  /**
   * Get reminder count based on 6-hour intervals
   * @param {number} hours - Hours since last message
   * @returns {number} Number of 6-hour intervals
   */
  getReminderCount(hours) {
    return Math.floor(hours / this.REMINDER_BASE_INTERVAL);
  }

  /**
   * Start the reminder service with periodic checks
   * @param {number} intervalMinutes - How often to check for reminders (default: 30 minutes)
   */
  start(intervalMinutes = 30) {
    if (this.isRunning) {
      console.log('Reminder service is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting reminder service with ${intervalMinutes} minute intervals`);

    // Run initial check
    this.checkAndCreateReminders();

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.checkAndCreateReminders();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the reminder service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Reminder service stopped');
  }

  /**
   * Check all chats and create new reminders if needed
   */
  async checkAndCreateReminders() {
    try {
      console.log('Checking for customer messages that need agent response...');

      // Find chats where:
      // 1. Last message was from customer
      // 2. Agent hasn't replied for 6+ hours (new threshold)
      // 3. Reminder isn't currently snoozed
      const chats = await Chat.aggregate([
        {
          $match: {
            messages: { $exists: true, $ne: [] },
            $or: [
              { reminderSnoozedUntil: { $exists: false } },
              { reminderSnoozedUntil: { $lt: new Date() } }
            ],
            // Exclude chats already marked with an active reminder (reminderHandled = false)
            $or: [
              { reminderHandled: { $exists: false } },
              { reminderHandled: true }
            ]
          }
        },
        {
          $addFields: {
            lastMessage: { $arrayElemAt: ['$messages', -1] },
            now: new Date()
          }
        },
        {
          $match: {
            'lastMessage.sender': 'customer',
            // Only consider if agent hasn't seen the last customer message
            'lastMessage.readByAgent': false
          }
        },
        {
          $addFields: {
            hoursSinceLastMessage: {
              $divide: [
                { $subtract: ['$now', '$lastMessage.timestamp'] },
                1000 * 60 * 60 // Convert to hours
              ]
            }
          }
        },
        {
          $match: {
            hoursSinceLastMessage: { $gte: this.PRIORITY_THRESHOLDS.NEW } // 6+ hours
          }
        }
      ]);

      let remindersCreated = 0;
      let remindersByPriority = {
        NEW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0
      };

      for (const chatData of chats) {
        const shouldCreateReminder = await this.shouldCreateNewReminder(chatData);
        
        if (shouldCreateReminder) {
          const priority = this.getPriorityLevel(chatData.hoursSinceLastMessage);
          await this.createNewReminder(chatData._id, priority);
          remindersCreated++;
          remindersByPriority[priority]++;
        }
      }

      if (remindersCreated > 0) {
        console.log(`Created ${remindersCreated} new reminders for unanswered customer messages`);
        console.log('Reminders by priority:', remindersByPriority);
      }

    } catch (error) {
      console.error('Error checking for reminders:', error);
    }
  }

  /**
   * Determine if a new reminder should be created for a chat
   * @param {Object} chatData - Chat data from aggregation
   * @returns {boolean}
   */
  async shouldCreateNewReminder(chatData) {
    try {
      // If chat is snoozed, don't create reminder
      if (chatData.reminderSnoozedUntil && new Date(chatData.reminderSnoozedUntil) > new Date()) {
        return false;
      }

      // If last message is from agent, don't create reminder
      if (chatData.lastMessage.sender === 'agent') {
        return false;
      }

      // Require that the last customer message has not been seen by the agent
      if (chatData.lastMessage.readByAgent === true) {
        return false;
      }

      // If customer message hasn't been waiting long enough, don't create reminder
      const hoursSinceLastMessage = differenceInHours(new Date(), new Date(chatData.lastMessage.timestamp));
      if (hoursSinceLastMessage < this.PRIORITY_THRESHOLDS.NEW) { // At least 6 hours
        return false;
      }

      // Create reminder for unanswered customer message
      return true;

    } catch (error) {
      console.error('Error determining if reminder should be created:', error);
      return false;
    }
  }

  /**
   * Create a new reminder for a chat
   * @param {string} chatId - Chat ID
   * @param {string} priority - Priority level (NEW, MEDIUM, HIGH, CRITICAL)
   */
  async createNewReminder(chatId, priority) {
    try {
      const chat = await Chat.findById(chatId);
      const hoursSinceLastMessage = differenceInHours(new Date(), new Date(chat.messages[chat.messages.length - 1].timestamp));
      const reminderCount = this.getReminderCount(hoursSinceLastMessage);

      await Chat.findByIdAndUpdate(chatId, {
        $unset: { reminderSnoozedUntil: 1 },
        $set: {
          // Mark as needing attention now (UI can highlight)
          reminderHandled: false,
          reminderHandledAt: undefined,
          reminderPriority: priority,
          reminderCount,
          updatedAt: new Date()
        }
      }, { new: true });

      console.log(`Created new ${priority} priority reminder for chat ${chatId} (${reminderCount} intervals)`);
    } catch (error) {
      console.error(`Error creating reminder for chat ${chatId}:`, error);
    }
  }

  /**
   * Handle follow-up action - mark reminder as handled
   * @param {string} chatId - Chat ID
   */
  async handleFollowUpAction(chatId) {
    try {
      await Chat.findByIdAndUpdate(chatId, {
        reminderHandled: true,
        reminderHandledAt: new Date(),
        $unset: { reminderSnoozedUntil: 1 }
      });

      console.log(`Marked reminder as handled for chat ${chatId}`);
    } catch (error) {
      console.error(`Error handling follow-up for chat ${chatId}:`, error);
    }
  }

  /**
   * Handle customer response - reset reminder flags
   * @param {string} chatId - Chat ID
   */
  async handleCustomerResponse(chatId) {
    try {
      await Chat.findByIdAndUpdate(chatId, {
        $set: {
          reminderHandled: false,
          reminderHandledAt: undefined,
        },
        $unset: {
          reminderSnoozedUntil: 1
        }
      });

      console.log(`Reset reminder flags for chat ${chatId} - new customer message`);
    } catch (error) {
      console.error(`Error handling customer response for chat ${chatId}:`, error);
    }
  }

  /**
   * Get reminder statistics
   */
  async getStats() {
    try {
      const stats = await Chat.aggregate([
        {
          $match: {
            messages: { $exists: true, $ne: [] }
          }
        },
        {
          $addFields: {
            lastMessage: { $arrayElemAt: ['$messages', -1] },
            now: new Date()
          }
        },
        {
          $addFields: {
            hoursSinceLastMessage: {
              $divide: [
                { $subtract: ['$now', '$lastMessage.timestamp'] },
                1000 * 60 * 60
              ]
            },
            needsReminder: {
              $and: [
                { $eq: ['$lastMessage.sender', 'customer'] },
                {
                  $gte: [
                    { $divide: [{ $subtract: ['$now', '$lastMessage.timestamp'] }, 1000 * 60 * 60] },
                    this.PRIORITY_THRESHOLDS.NEW
                  ]
                },
                {
                  $or: [
                    { $eq: ['$reminderHandled', false] },
                    { $not: { $ifNull: ['$reminderHandled', false] } }
                  ]
                }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            totalChats: { $sum: 1 },
            chatsNeedingReminders: { $sum: { $cond: ['$needsReminder', 1, 0] } },
            handledReminders: { $sum: { $cond: [{ $ifNull: ['$reminderHandled', false] }, 1, 0] } },
            snoozedReminders: { 
              $sum: { 
                $cond: [
                  { $and: [{ $ifNull: ['$reminderSnoozedUntil', false] }, { $gt: ['$reminderSnoozedUntil', '$now'] }] }, 
                  1, 
                  0
                ] 
              } 
            },
            newPriorityReminders: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      '$needsReminder',
                      { $gte: ['$hoursSinceLastMessage', this.PRIORITY_THRESHOLDS.NEW] },
                      { $lt: ['$hoursSinceLastMessage', this.PRIORITY_THRESHOLDS.MEDIUM] }
                    ]
                  },
                  1, 0
                ]
              }
            },
            mediumPriorityReminders: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      '$needsReminder',
                      { $gte: ['$hoursSinceLastMessage', this.PRIORITY_THRESHOLDS.MEDIUM] },
                      { $lt: ['$hoursSinceLastMessage', this.PRIORITY_THRESHOLDS.HIGH] }
                    ]
                  },
                  1, 0
                ]
              }
            },
            highPriorityReminders: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      '$needsReminder',
                      { $gte: ['$hoursSinceLastMessage', this.PRIORITY_THRESHOLDS.HIGH] },
                      { $lt: ['$hoursSinceLastMessage', this.PRIORITY_THRESHOLDS.CRITICAL] }
                    ]
                  },
                  1, 0
                ]
              }
            },
            criticalPriorityReminders: {
              $sum: {
                $cond: [
                  { 
                    $and: [
                      '$needsReminder',
                      { $gte: ['$hoursSinceLastMessage', this.PRIORITY_THRESHOLDS.CRITICAL] }
                    ]
                  },
                  1, 0
                ]
              }
            }
          }
        }
      ]);

      return stats.length > 0 ? stats[0] : {
        totalChats: 0,
        chatsNeedingReminders: 0,
        handledReminders: 0,
        snoozedReminders: 0,
        newPriorityReminders: 0,
        mediumPriorityReminders: 0,
        highPriorityReminders: 0,
        criticalPriorityReminders: 0
      };
    } catch (error) {
      console.error('Error getting reminder stats:', error);
      return null;
    }
  }
}

// Create singleton instance
const reminderService = new ReminderService();

module.exports = reminderService;
