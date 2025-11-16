const mongoose = require('mongoose');
const Chat = require('../models/Chat');

/**
 * Mark all chats for a given escort as closed so they drop out of the live queue.
 * @param {string|mongoose.Types.ObjectId} escortId - Escort profile identifier.
 * @param {string} [reason='escort_deleted'] - Reason stored on the chat for auditing.
 * @returns {Promise<{matchedCount: number, modifiedCount: number}>}
 */
async function closeChatsForEscort(escortId, reason = 'escort_deleted') {
  if (!escortId) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  let normalizedId;
  try {
    normalizedId = typeof escortId === 'string'
      ? new mongoose.Types.ObjectId(escortId)
      : new mongoose.Types.ObjectId(escortId.toString());
  } catch (err) {
    console.warn('[chatCleanup] Invalid escortId supplied, skipping cascade close:', escortId);
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const now = new Date();
  const update = {
    status: 'closed',
    reminderActive: false,
    reminderHandled: true,
    reminderHandledAt: now,
    reminderSnoozedUntil: null,
    reminderPriority: null,
    reminderResolvedAt: now,
    requiresFollowUp: false,
    followUpDue: null,
    nextReminderAt: null,
    pushBackUntil: null,
    isInPanicRoom: false,
    closedAt: now,
    closedReason: reason
  };

  const result = await Chat.updateMany(
    { escortId: normalizedId, status: { $ne: 'closed' } },
    { $set: update }
  );

  return {
    matchedCount: result.matchedCount ?? result.n ?? 0,
    modifiedCount: result.modifiedCount ?? result.nModified ?? 0
  };
}

module.exports = {
  closeChatsForEscort
};
