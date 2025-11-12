const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const User = require('../models/User');
const { auth } = require('../auth');
const { formatUserProfile, resolveAssetUrl } = require('../utils/userResponseFormatter');

const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
];

const ensureUploadPath = () => {
  const uploadDirectory = path.join(__dirname, '../uploads/avatars');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  return uploadDirectory;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadDir = ensureUploadPath();
      cb(null, uploadDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const extension = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const identifier = req.user?.id || 'user';
    cb(null, `avatar-${identifier}-${suffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: AVATAR_MAX_SIZE
  }
});

const deleteFileIfExists = async (storedPath) => {
  if (!storedPath || /^https?:\/\//i.test(storedPath)) {
    return;
  }

  const normalized = storedPath.replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/avatars')) {
    return;
  }

  const absolutePath = path.join(__dirname, '..', normalized);

  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Avatar cleanup failed:', error.message);
    }
  }
};

router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: formatUserProfile(user) });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, country, city } = req.body || {};
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = user.profile || {};

    if (typeof firstName === 'string') profile.firstName = firstName.trim();
    if (typeof lastName === 'string') profile.lastName = lastName.trim();
    if (typeof phoneNumber === 'string') profile.phoneNumber = phoneNumber.trim();
    if (typeof country === 'string') profile.country = country.trim();
    if (typeof city === 'string') profile.city = city.trim();

    user.profile = profile;
    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: formatUserProfile(user)
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.post('/profile/avatar', auth, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    }

    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.profile = user.profile || {};
      const previousAvatar = user.profile.avatar;
      const relativePath = `/uploads/avatars/${req.file.filename}`;
      user.profile.avatar = relativePath;
      await user.save();

      if (previousAvatar && previousAvatar !== relativePath) {
        await deleteFileIfExists(previousAvatar);
      }

      const formattedUser = formatUserProfile(user);

      res.json({
        message: 'Profile image updated successfully',
        avatar: relativePath,
        avatarUrl: resolveAssetUrl(relativePath),
        user: formattedUser
      });
    } catch (error) {
      console.error('Avatar upload error:', error);
      res.status(500).json({ message: 'Failed to update profile image' });
    }
  });
});

module.exports = router;
