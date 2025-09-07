const express = require('express');
const cors = require('cors');
const { router: authRoutes } = require('./auth');
const agentRoutes = require('./routes/agentRoutes');
const escortRoutes = require('./routes/escortRoutes');
const chatRoutes = require('./routes/chatRoutes');
const logRoutes = require('./routes/logRoutes');
const firstContactRoutes = require('./routes/firstContactRoutes');

const app = express();

app.use(cors({
  origin: 'http://localhost:8000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Mount routes - ensure paths match frontend requests
app.use('/api/auth', authRoutes); // Add auth routes
app.use('/api/agents', agentRoutes);
app.use('/api/escorts', escortRoutes);
app.use('/api/chats', chatRoutes); // Ensure this matches the frontend API call
app.use('/api/logs', logRoutes); // Add logs API routes
app.use('/api/first-contact', firstContactRoutes); // Add first contact routes

module.exports = app;