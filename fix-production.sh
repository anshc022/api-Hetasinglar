#!/bin/bash

echo "🔧 HetaSinglar Production Fix Script"
echo "==================================="

# Ensure we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Please run this from the server directory"
    exit 1
fi

# Set environment
export NODE_ENV=production

# 1. Stop existing processes
echo "1. 🛑 Stopping existing processes..."
sudo pkill -f "node.*server.js" 2>/dev/null || true
sudo systemctl stop hetasinglar-backend 2>/dev/null || true
sleep 2

# 2. Update environment file
echo "2. 📝 Creating/updating .env.production..."
cat > .env.production << 'EOF'
PORT=5000

# Production MongoDB Connection
MONGODB_URI=mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.ca0z4d.mongodb.net/hetasinglar?retryWrites=true&w=majority

JWT_SECRET=your-production-secret-key-here

# Production Environment Settings
NODE_ENV=production
FRONTEND_URL=http://hotsingles.se
ALLOWED_ORIGINS=http://hotsingles.se,http://www.hotsingles.se,http://16.171.8.139

# Production Security Settings
SESSION_SECRET=your-production-session-secret
EOF

echo "✅ Environment file updated"

# 3. Test MongoDB connection
echo "3. 🧪 Testing MongoDB connection..."
node -e "
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.production' });

console.log('Testing connection to MongoDB Atlas...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000
}).then(async () => {
  console.log('✅ MongoDB connection successful');
  const Agent = require('./models/Agent');
  const agentCount = await Agent.countDocuments();
  console.log('✅ Found', agentCount, 'agents in database');
  process.exit(0);
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});
"

if [ $? -ne 0 ]; then
    echo "❌ MongoDB connection test failed. Please check credentials."
    exit 1
fi

# 4. Install/update dependencies
echo "4. 📦 Installing dependencies..."
npm install --production 2>/dev/null || {
    echo "⚠️  npm install failed, continuing..."
}

# 5. Create systemd service file
echo "5. 🔧 Creating systemd service..."
sudo tee /etc/systemd/system/hetasinglar-backend.service > /dev/null << EOF
[Unit]
Description=HetaSinglar Backend API
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=hetasinglar-backend

[Install]
WantedBy=multi-user.target
EOF

# 6. Reload systemd and start service
echo "6. 🚀 Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable hetasinglar-backend
sudo systemctl start hetasinglar-backend

# 7. Wait and check status
sleep 3
echo "7. ✅ Service status:"
sudo systemctl status hetasinglar-backend --no-pager

# 8. Test the API
echo "8. 🧪 Testing API endpoints..."
sleep 2

echo "Testing health endpoint:"
curl -s -m 5 http://localhost:5000/api/health | head -200

echo ""
echo "Testing login endpoint:"
curl -s -m 5 -X POST http://localhost:5000/api/agents/login \
  -H "Content-Type: application/json" \
  -d '{"agentId":"Dio123","password":"Dio123!"}' | head -200

echo ""
echo ""
echo "🏁 Fix script complete!"
echo ""
echo "🌐 Your API should now be available at:"
echo "   - Health: https://apihetasinglar.duckdns.org/api/health"
echo "   - Login: https://apihetasinglar.duckdns.org/api/agents/login"
echo ""
echo "📋 To check logs:"
echo "   sudo journalctl -u hetasinglar-backend -f"