const moderatorsByChat = new Map();

function normalizeChatId(chatId) {
  if (!chatId) {
    return null;
  }
  if (typeof chatId === 'string') {
    return chatId;
  }
  if (chatId.toString) {
    return chatId.toString();
  }
  return String(chatId);
}

function sanitizeModeratorPayload(moderator) {
  if (!moderator) {
    return null;
  }
  return {
    agentId: moderator.agentId || null,
    agentCode: moderator.agentCode || null,
    name: moderator.name || 'Agent',
    joinedAt: moderator.joinedAt || new Date().toISOString()
  };
}

function setModeratorForConnection(connectionId, chatId, moderatorData = {}) {
  if (!connectionId) {
    return;
  }

  // Remove existing mapping for this connection before reassigning
  removeModeratorByConnection(connectionId);

  const normalizedChatId = normalizeChatId(chatId);
  if (!normalizedChatId) {
    return;
  }

  const sanitized = sanitizeModeratorPayload({
    ...moderatorData,
    joinedAt: moderatorData.joinedAt || new Date().toISOString()
  });
  if (!sanitized) {
    return;
  }

  if (!moderatorsByChat.has(normalizedChatId)) {
    moderatorsByChat.set(normalizedChatId, new Map());
  }

  moderatorsByChat.get(normalizedChatId).set(connectionId, sanitized);
}

function removeModeratorByConnection(connectionId) {
  if (!connectionId) {
    return;
  }

  for (const [chatId, moderatorMap] of moderatorsByChat.entries()) {
    if (moderatorMap.delete(connectionId) && moderatorMap.size === 0) {
      moderatorsByChat.delete(chatId);
    }
  }
}

function getModerators(chatId) {
  const normalizedChatId = normalizeChatId(chatId);
  if (!normalizedChatId) {
    return [];
  }

  const moderatorMap = moderatorsByChat.get(normalizedChatId);
  if (!moderatorMap) {
    return [];
  }

  return Array.from(moderatorMap.values()).map((entry) => ({ ...entry }));
}

function clearModeratorsForChat(chatId) {
  const normalizedChatId = normalizeChatId(chatId);
  if (!normalizedChatId) {
    return;
  }
  moderatorsByChat.delete(normalizedChatId);
}

function clearAllModerators() {
  moderatorsByChat.clear();
}

module.exports = {
  setModeratorForConnection,
  removeModeratorByConnection,
  getModerators,
  clearModeratorsForChat,
  clearAllModerators
};
