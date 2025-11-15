const clampOfflineMinutes = (rawValue) => {
  if (rawValue === null || rawValue === undefined) {
    return 5;
  }

  const parsed = parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    return 5;
  }

  return Math.max(5, Math.min(10, parsed));
};

const resolveLastInteractionTimestamp = (chat) => {
  if (!chat) {
    return null;
  }

  const candidates = [
    chat.lastCustomerResponse,
    chat.reminderResolvedAt,
    chat.reminderHandledAt,
    chat.lastAgentResponse,
    chat.updatedAt,
    chat.createdAt
  ].filter(Boolean);

  if (chat.lastMessage?.timestamp) {
    candidates.unshift(chat.lastMessage.timestamp);
  }

  if (candidates.length === 0) {
    return null;
  }

  const newest = candidates
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return newest ? newest.getTime() : null;
};

const evaluateNotificationEligibility = ({
  userDoc,
  chat,
  isUserActive,
  escortId,
  messageType,
  messageText,
  now = Date.now()
}) => {
  const preferences = userDoc?.preferences || {};
  const messageSettings = preferences?.notificationSettings?.email?.messages || {};

  const emailOk = Boolean(userDoc?.email);
  const wantsEmails = !(preferences?.emailUpdates === false || preferences?.notifications === false);
  const granularEnabled = messageSettings?.enabled !== false;

  const offlineMinutes = clampOfflineMinutes(messageSettings?.onlyWhenOfflineMinutes ?? 5);
  const offlineMinMs = offlineMinutes * 60 * 1000;

  let passesOfflineRule = offlineMinutes === 0;
  let offlineStatus = 'unknown';
  let msUntilEligible = 0;

  if (offlineMinutes > 0) {
    if (isUserActive) {
      passesOfflineRule = false;
      offlineStatus = 'active';
      msUntilEligible = offlineMinMs;
    } else if (userDoc?.lastActiveDate) {
      const lastActiveDate = new Date(userDoc.lastActiveDate);
      const lastActiveMs = lastActiveDate.getTime();

      if (!Number.isNaN(lastActiveMs)) {
        const msSinceActive = now - lastActiveMs;
        passesOfflineRule = msSinceActive >= offlineMinMs;
        offlineStatus = `offline for ${Math.round(msSinceActive / 60000)}min (required: ${offlineMinutes}min)`;
        if (!passesOfflineRule) {
          msUntilEligible = Math.max(offlineMinMs - msSinceActive, 0);
        }
      } else {
        passesOfflineRule = true;
        offlineStatus = 'invalid lastActiveDate (considered offline)';
      }
    } else {
      passesOfflineRule = true;
      offlineStatus = 'no activity data (considered offline)';
    }

    if (!passesOfflineRule) {
      const lastInteractionMs = resolveLastInteractionTimestamp(chat);
      if (lastInteractionMs) {
        const msSinceInteraction = now - lastInteractionMs;
        if (msSinceInteraction >= offlineMinMs) {
          passesOfflineRule = true;
          offlineStatus = `${offlineStatus} | fallback chat inactivity ${Math.round(msSinceInteraction / 60000)}min`;
          msUntilEligible = 0;
        } else {
          msUntilEligible = Math.max(msUntilEligible, offlineMinMs - msSinceInteraction);
        }
      }
    }
  }

  const overrides = Array.isArray(messageSettings?.perEscort) ? messageSettings.perEscort : [];
  let passesPerEscort = true;
  if (overrides.length && escortId) {
    const match = overrides.find((entry) => entry?.escortId?.toString?.() === escortId.toString());
    if (match && match.enabled === false) {
      passesPerEscort = false;
    }
  }

  const snippet = messageType === 'image'
    ? '📷 Image message'
    : (messageText || '');

  const shouldSend = emailOk && wantsEmails && granularEnabled && passesOfflineRule && passesPerEscort;
  const canDefer = emailOk && wantsEmails && granularEnabled && passesPerEscort && !passesOfflineRule && msUntilEligible > 0;

  return {
    emailOk,
    wantsEmails,
    granularEnabled,
    passesPerEscort,
    passesOfflineRule,
    offlineStatus,
    msUntilEligible,
    offlineMinutes,
    offlineMinMs,
    isUserActive,
    snippet,
    shouldSend,
    canDefer
  };
};

module.exports = {
  clampOfflineMinutes,
  resolveLastInteractionTimestamp,
  evaluateNotificationEligibility
};
