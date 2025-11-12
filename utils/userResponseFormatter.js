const normalizeBaseUrl = (url) => {
  if (!url) {
    return null;
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

const isAbsoluteUrl = (value = '') => /^https?:\/\//i.test(value);

const getAssetBaseUrl = () => {
  const candidates = [
    process.env.ASSET_BASE_URL,
    process.env.PUBLIC_ASSET_URL,
    process.env.PUBLIC_FILES_URL,
    process.env.PUBLIC_API_URL,
    process.env.API_PUBLIC_BASE_URL,
    process.env.API_BASE_URL
  ].filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  return normalizeBaseUrl(candidates[0]);
};

const resolveAssetUrl = (relativePath) => {
  if (!relativePath) {
    return null;
  }

  if (isAbsoluteUrl(relativePath)) {
    return relativePath;
  }

  const baseUrl = getAssetBaseUrl();
  if (!baseUrl) {
    return relativePath;
  }

  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${baseUrl}${normalizedPath}`;
};

const formatUserProfile = (userDoc) => {
  if (!userDoc) {
    return null;
  }

  const profile = userDoc.profile || {};

  return {
    _id: userDoc._id,
    username: userDoc.username,
    email: userDoc.email,
    full_name: userDoc.full_name || '',
    dateOfBirth: userDoc.dateOfBirth,
    sex: userDoc.sex,
    emailVerified: userDoc.emailVerified !== false,
    coins: {
      balance: userDoc.coins?.balance || 0
    },
    profile: {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phoneNumber: profile.phoneNumber || '',
      country: profile.country || '',
      city: profile.city || '',
      avatar: profile.avatar || null,
      avatarUrl: profile.avatar ? resolveAssetUrl(profile.avatar) : null
    }
  };
};

module.exports = {
  formatUserProfile,
  resolveAssetUrl
};
