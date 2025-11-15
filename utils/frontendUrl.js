const DEFAULT_PROD_URL = 'https://hetasinglar.se';
const DEFAULT_DEV_URL = 'http://localhost:8000';

const trimTrailingSlash = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  return value.replace(/\/$/, '');
};

const getEnvFrontendUrl = () => {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.APP_FRONTEND_URL,
    process.env.REACT_APP_FRONTEND_URL
  ];

  for (const candidate of candidates) {
    const sanitized = trimTrailingSlash(candidate);
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
};

const resolveFrontendUrl = (req) => {
  const envUrl = getEnvFrontendUrl();
  if (envUrl) {
    return envUrl;
  }

  if (req) {
    const origin = trimTrailingSlash(req.get?.('origin'));
    if (origin) {
      return origin;
    }

    const refererHeader = req.get?.('referer') || req.get?.('referrer');
    if (refererHeader) {
      try {
        const refererUrl = new URL(refererHeader);
        return trimTrailingSlash(refererUrl.origin);
      } catch (error) {
        // Ignore malformed referer values and fall through to fallback
      }
    }
  }

  const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production'
    || (process.env.APP_ENV || '').toLowerCase() === 'production';

  return isProduction ? DEFAULT_PROD_URL : DEFAULT_DEV_URL;
};

module.exports = {
  resolveFrontendUrl,
  DEFAULT_PROD_URL,
  DEFAULT_DEV_URL
};
