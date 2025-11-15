const fs = require('fs');
const path = require('path');

const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const DATA_URL_REGEX = /^data:(.*?);base64,(.*)$/;
const DEFAULT_MAX_SIZE = 2 * 1024 * 1024; // 2MB

const ensureAvatarUploadPath = () => {
  const uploadDirectory = path.join(__dirname, '..', 'uploads', 'avatars');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  return uploadDirectory;
};

const decodeBase64Payload = (input) => {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid image payload');
  }

  const trimmed = input.trim();
  const match = trimmed.match(DATA_URL_REGEX);
  if (match) {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  }

  // If no data URL prefix provided, assume JPEG by default
  const buffer = Buffer.from(trimmed, 'base64');
  return { mime: 'image/jpeg', buffer };
};

const saveBase64Image = async (base64String, options = {}) => {
  const { prefix = 'avatar', maxSize = DEFAULT_MAX_SIZE } = options;

  const { mime, buffer } = decodeBase64Payload(base64String);

  if (!ALLOWED_MIME_TYPES[mime]) {
    throw new Error('Unsupported image format. Allowed: JPG, PNG, WEBP, GIF');
  }

  if (!buffer || !buffer.length) {
    throw new Error('Empty image data received');
  }

  if (buffer.length > maxSize) {
    throw new Error('Image exceeds maximum size of 2MB');
  }

  const uploadDir = ensureAvatarUploadPath();
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ALLOWED_MIME_TYPES[mime]}`;
  const destination = path.join(uploadDir, filename);

  await fs.promises.writeFile(destination, buffer, { encoding: 'binary' });

  return `/uploads/avatars/${filename}`;
};

module.exports = {
  saveBase64Image
};
