const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 5000;

const webhookCandidates = [
  'DISCORD_CUSTOMER_REGISTRATION_WEBHOOK_URL',
  'DISCORD_NEW_CUSTOMER_WEBHOOK_URL',
  'DISCORD_NOTIFICATIONS_WEBHOOK_URL',
  'DISCORD_WEBHOOK_URL'
];

const resolveWebhookUrl = () => {
  for (const key of webhookCandidates) {
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

const sendDiscordPayload = async (payload) => {
  const webhookUrl = resolveWebhookUrl();
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

const defaultMention = () => {
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

  const mention = extras.mention ?? defaultMention();
  const content = extras.content || (mention ? `${mention} 🎉 A new customer just registered!` : '🎉 A new customer just registered!');

  const embed = buildNewCustomerEmbed(user, extras.embed || {});

  return sendDiscordPayload({
    content,
    embeds: [embed]
  });
};

module.exports = {
  notifyNewCustomerRegistration
};
