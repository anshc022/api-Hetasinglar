const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 5000;

const DEFAULT_WEBHOOK_KEYS = [
  'DISCORD_CUSTOMER_REGISTRATION_WEBHOOK_URL',
  'DISCORD_NEW_CUSTOMER_WEBHOOK_URL',
  'DISCORD_PANIC_ROOM_WEBHOOK_URL',
  'DISCORD_ESCALATIONS_WEBHOOK_URL',
  'DISCORD_NOTIFICATIONS_WEBHOOK_URL',
  'DISCORD_WEBHOOK_URL'
];

const resolveWebhookUrl = (preferredKeys = []) => {
  const order = [...preferredKeys, ...DEFAULT_WEBHOOK_KEYS];
  const seen = new Set();

  for (const key of order) {
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const value = process.env[key];
    if (value && typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const sanitizeFieldValue = (value, fallback = 'N/A', maxLength = 1024) => {
  if (value === null || value === undefined) {
    return fallback;
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return fallback;
  }

  if (stringValue.length > maxLength) {
    return `${stringValue.slice(0, maxLength - 3)}...`;
  }

  return stringValue;
};

const formatProfileName = (user) => {
  const profile = user?.profile || {};
  const nameParts = [profile.firstName, profile.lastName].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(' ');
  }
  if (user?.full_name) {
    return user.full_name;
  }
  return null;
};

const buildNewCustomerEmbed = (user, extras = {}) => {
  const embed = {
    title: extras.title || 'New customer registration',
    color: extras.color ?? 0x2ecc71,
    timestamp: new Date().toISOString(),
    fields: []
  };

  embed.fields.push({
    name: 'Username',
    value: sanitizeFieldValue(user?.username)
  });

  const profileName = formatProfileName(user);
  if (profileName) {
    embed.fields.push({
      name: 'Name',
      value: sanitizeFieldValue(profileName)
    });
  }

  embed.fields.push({
    name: 'Region',
    value: sanitizeFieldValue(user?.profile?.region)
  });

  if (user?.email) {
    embed.fields.push({
      name: 'Email',
      value: sanitizeFieldValue(user.email, 'Hidden', 256)
    });
  }

  if (user?.referral?.affiliateCode) {
    embed.fields.push({
      name: 'Referral code',
      value: sanitizeFieldValue(user.referral.affiliateCode, 'None', 256)
    });
  }

  if (user?.profile?.description) {
    embed.fields.push({
      name: 'Profile blurb',
      value: sanitizeFieldValue(user.profile.description, '—', 1024)
    });
  }

  if (extras.url) {
    embed.url = extras.url;
  }

  return embed;
};

const sendDiscordPayload = async (payload, preferredWebhookKeys = []) => {
  const webhookUrl = resolveWebhookUrl(preferredWebhookKeys);
  if (!webhookUrl) {
    return { delivered: false, reason: 'webhook_missing' };
  }

  try {
    await axios.post(webhookUrl, payload, {
      timeout: Number(process.env.DISCORD_WEBHOOK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return { delivered: true };
  } catch (error) {
    const status = error?.response?.status;
    const message = error?.response?.data || error?.message;
    console.warn('Discord webhook send failed:', status || 'no-status', message);
    return {
      delivered: false,
      reason: 'request_failed',
      status,
      error: message
    };
  }
};

const defaultNewCustomerMention = () => {
  const mentionRaw = process.env.DISCORD_NEW_CUSTOMER_MENTION;
  if (!mentionRaw) {
    return '';
  }
  const mention = mentionRaw.trim();
  if (!mention) {
    return '';
  }
  return mention;
};

const notifyNewCustomerRegistration = async (user, extras = {}) => {
  if (!user) {
    return { delivered: false, reason: 'user_missing' };
  }

  const mention = extras.mention ?? defaultNewCustomerMention();
  const content = extras.content || (mention ? `${mention} 🎉 A new customer just registered!` : '🎉 A new customer just registered!');

  const embed = buildNewCustomerEmbed(user, extras.embed || {});

  return sendDiscordPayload({
    content,
    embeds: [embed]
  }, ['DISCORD_CUSTOMER_REGISTRATION_WEBHOOK_URL', 'DISCORD_NEW_CUSTOMER_WEBHOOK_URL']);
};

const defaultPanicRoomMention = () => {
  const mentionKeys = [
    'DISCORD_PANIC_ROOM_MENTION',
    'DISCORD_ESCALATION_MENTION',
    'DISCORD_ALERT_MENTION',
    'DISCORD_NEW_CUSTOMER_MENTION'
  ];

  for (const key of mentionKeys) {
    const raw = process.env[key];
    if (raw && typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }

  return '';
};

const resolveCustomerDisplayName = (chat, customer) => {
  if (chat?.customerName) {
    return chat.customerName;
  }

  if (customer) {
    const profileName = formatProfileName(customer);
    if (profileName) {
      return profileName;
    }

    if (customer.username) {
      return customer.username;
    }
    if (customer.email) {
      return customer.email;
    }
  }

  let customerIdFallback = null;
  if (chat?.customerId) {
    if (typeof chat.customerId === 'string') {
      customerIdFallback = chat.customerId;
    } else if (typeof chat.customerId === 'object' && chat.customerId !== null) {
      if (typeof chat.customerId.toString === 'function') {
        customerIdFallback = chat.customerId.toString();
      }
      if (!customerIdFallback && chat.customerId._id) {
        customerIdFallback = chat.customerId._id.toString();
      }
    }
  }

  if (customerIdFallback) {
    const trimmed = customerIdFallback.replace(/[^a-fA-F0-9]/g, '');
    const tail = trimmed.slice(-6) || customerIdFallback.slice(-6);
    return `Customer ${tail}`;
  }

  return 'Unknown customer';
};

const resolveEscortDisplayName = (chat, escort) => {
  let primaryName = null;
  let username = null;
  let serialNumber = null;

  if (escort) {
    const profileName = formatProfileName(escort);
    if (profileName) {
      primaryName = profileName;
    }

    if (!primaryName) {
      const nameParts = [escort.firstName, escort.lastName].filter(Boolean);
      if (nameParts.length > 0) {
        primaryName = nameParts.join(' ');
      }
    }

    primaryName = primaryName || escort.name || escort.displayName || escort.stageName || null;
    username = escort.username || escort.handle || escort.slug || null;
    serialNumber = escort.serialNumber || escort.serial || null;
  }

  if (!username && escort?.profile?.username) {
    username = escort.profile.username;
  }

  if (!serialNumber && escort?.profile?.serialNumber) {
    serialNumber = escort.profile.serialNumber;
  }

  let escortIdFallback = null;
  if (escort?._id) {
    escortIdFallback = escort._id.toString();
  } else if (chat?.escortId) {
    if (typeof chat.escortId === 'string') {
      escortIdFallback = chat.escortId;
    } else if (typeof chat.escortId === 'object' && chat.escortId !== null) {
      if (typeof chat.escortId.toString === 'function') {
        escortIdFallback = chat.escortId.toString();
      }
      if (!escortIdFallback && chat.escortId._id) {
        escortIdFallback = chat.escortId._id.toString();
      }
    }
  }

  const segments = [];

  if (primaryName) {
    segments.push(primaryName.trim());
  }

  if (username) {
    const normalizedPrimary = primaryName ? primaryName.trim().toLowerCase() : null;
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedPrimary || (normalizedPrimary && normalizedPrimary !== normalizedUsername)) {
      segments.push(`@${username.trim()}`);
    }
  }

  if (serialNumber) {
    segments.push(`SN:${serialNumber}`);
  }

  if (segments.length > 0) {
    return segments.join(' • ');
  }

  if (escortIdFallback) {
    const trimmed = escortIdFallback.replace(/[^a-fA-F0-9]/g, '');
    const tail = trimmed.slice(-6) || escortIdFallback.slice(-6);
    return `Escort ${tail}`;
  }

  return 'Unknown escort';
};

const buildPanicRoomEmbed = (chat, extras = {}) => {
  const event = extras.event || 'entered';
  const title = extras.title
    || (event === 'message' ? 'Panic room message'
      : event === 'removed' ? 'Customer exited panic room'
      : 'Customer moved to panic room');

  const color = extras.color ?? (event === 'message' ? 0xf39c12 : event === 'removed' ? 0x2ecc71 : 0xe74c3c);

  const embed = {
    title,
    color,
    timestamp: new Date().toISOString(),
    fields: []
  };

  const customerName = resolveCustomerDisplayName(chat, extras.customer);
  embed.fields.push({
    name: 'Customer',
    value: sanitizeFieldValue(customerName),
    inline: true
  });

  if (chat?._id) {
    embed.fields.push({
      name: 'Chat ID',
      value: sanitizeFieldValue(chat._id.toString()),
      inline: true
    });
  }

  if (chat?.escortId || extras.escort) {
    embed.fields.push({
      name: 'Escort',
      value: sanitizeFieldValue(resolveEscortDisplayName(chat, extras.escort)),
      inline: true
    });
  }

  if (extras.triggeredBy?.name || extras.triggeredBy?.email) {
    embed.fields.push({
      name: 'Triggered by',
      value: sanitizeFieldValue(extras.triggeredBy.name || extras.triggeredBy.email),
      inline: true
    });
  }

  if (chat?.panicRoomReason || extras.reason) {
    embed.fields.push({
      name: 'Reason',
      value: sanitizeFieldValue(extras.reason || chat.panicRoomReason, 'Not provided'),
      inline: false
    });
  }

  if (extras.notes) {
    embed.fields.push({
      name: 'Notes',
      value: sanitizeFieldValue(extras.notes, 'None provided'),
      inline: false
    });
  }

  if (event === 'message' && extras.message) {
    embed.fields.push({
      name: 'Latest message',
      value: sanitizeFieldValue(extras.message, 'No content', 1024),
      inline: false
    });
  }

  if (chat?.panicRoomEnteredAt) {
    embed.fields.push({
      name: 'In panic room since',
      value: sanitizeFieldValue(new Date(chat.panicRoomEnteredAt).toISOString()),
      inline: true
    });
  }

  embed.fields.push({
    name: 'Status',
    value: sanitizeFieldValue(chat?.isInPanicRoom ? 'Active' : 'Cleared'),
    inline: true
  });

  if (extras.url) {
    embed.url = extras.url;
  }

  if (!embed.footer) {
    embed.footer = {
      text: extras.footerText || (event === 'message' ? 'Panic room update' : 'Panic room alert')
    };
  }

  return embed;
};

const notifyPanicRoomStatus = async (chat, extras = {}) => {
  if (!chat) {
    return { delivered: false, reason: 'chat_missing' };
  }

  const mention = extras.mention ?? defaultPanicRoomMention();
  const event = extras.event || 'entered';

  const contentParts = [];
  if (mention) {
    contentParts.push(mention);
  }

  if (extras.content) {
    contentParts.push(extras.content);
  } else if (event === 'message') {
    contentParts.push('✉️ New customer message in panic room.');
  } else if (event === 'removed') {
    const clearingAgent = extras.triggeredBy?.name || extras.triggeredBy?.email;
    const clearedBy = clearingAgent ? ` cleared by ${clearingAgent}` : '';
    contentParts.push(`✅ Panic room cleared${clearedBy}.`);
  } else {
    contentParts.push('🚨 Customer moved to panic room.');
  }

  const embedOverrides = extras.embed || {};
  const embedOptions = { ...extras, ...embedOverrides };
  delete embedOptions.embed;

  const embed = buildPanicRoomEmbed(chat, embedOptions);

  return sendDiscordPayload({
    content: contentParts.filter(Boolean).join(' ').trim() || undefined,
    embeds: [embed]
  }, ['DISCORD_PANIC_ROOM_WEBHOOK_URL', 'DISCORD_ESCALATIONS_WEBHOOK_URL']);
};

module.exports = {
  notifyNewCustomerRegistration,
  notifyPanicRoomStatus
};
