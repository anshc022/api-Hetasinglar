#!/bin/bash

echo "🚀 Quick HetaSinglar Production Fix Script"
echo "=========================================="

# Find the server directory
SERVER_DIR=""
if [ -f "/home/ec2-user/api-Hetasinglar/server.js" ]; then
    SERVER_DIR="/home/ec2-user/api-Hetasinglar"
elif [ -f "/home/ec2-user/backend/api-Hetasinglar/server.js" ]; then
    SERVER_DIR="/home/ec2-user/backend/api-Hetasinglar"
elif [ -f "/home/ec2-user/Hetasinglar/backend/api-Hetasinglar/server.js" ]; then
    SERVER_DIR="/home/ec2-user/Hetasinglar/backend/api-Hetasinglar"
else
    echo "🔍 Searching for server.js..."
    SERVER_DIR=$(find /home -name "server.js" -path "*/api-Hetasinglar/*" 2>/dev/null | head -1 | xargs dirname)
fi

if [ -z "$SERVER_DIR" ] || [ ! -f "$SERVER_DIR/server.js" ]; then
    echo "❌ Could not find server.js file. Please upload your backend code first."
    echo "Available directories:"
    ls -la /home/ec2-user/
    exit 1
fi

echo "✅ Found server directory: $SERVER_DIR"
cd "$SERVER_DIR"

# 1. Stop existing processes
echo "1. 🛑 Stopping existing Node.js processes..."
sudo pkill -f "node.*server.js" 2>/dev/null || true
sudo systemctl stop hetasinglar-backend 2>/dev/null || true
sleep 2

# 2. Create production environment file
echo "2. 📝 Creating production environment..."
cat > .env.production << 'EOF'
PORT=5000

# Production MongoDB Connection (Updated for correct cluster)
MONGODB_URI=mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.ca0z4d.mongodb.net/hetasinglar?retryWrites=true&w=majority

JWT_SECRET=your-production-secret-key-here-hetasinglar-2024

# Production Environment Settings
NODE_ENV=production
FRONTEND_URL=https://hetasinglar.se
ALLOWED_ORIGINS=https://hetasinglar.se,https://www.hetasinglar.se,http://13.48.194.178:5000,https://apihetasinglar.duckdns.org

# Production Security Settings
SESSION_SECRET=your-production-session-secret-hetasinglar-2024

# Email/SMTP Configuration for OTP
EMAIL_USER=contact@hetasinglar.se
EMAIL_PASS=be3SnVqktRu9
SMTP_HOST=mailcluster.loopia.se
SMTP_PORT=465
EOF

echo "✅ Environment file created"

# 3. Install Node.js and dependencies if needed
echo "3. 📦 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
fi

echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install dependencies
echo "Installing/updating dependencies..."
npm install --production

# 4. Test MongoDB connection
echo "4. 🧪 Testing MongoDB connection..."
node -e "
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.production' });

console.log('Testing MongoDB connection...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 15000
}).then(() => {
  console.log('✅ MongoDB connection successful');
  return mongoose.connection.db.admin().ping();
}).then(() => {
  console.log('✅ MongoDB ping successful');
  process.exit(0);
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});
" || {
    echo "⚠️  MongoDB connection test failed but continuing..."
}

# 5. Create systemd service
echo "5. 🔧 Creating systemd service..."
sudo tee /etc/systemd/system/hetasinglar-backend.service > /dev/null << EOF
[Unit]
Description=HetaSinglar Backend API Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$SERVER_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hetasinglar-backend

[Install]
WantedBy=multi-user.target
EOF

# 6. Start the service
echo "6. 🚀 Starting HetaSinglar backend service..."
sudo systemctl daemon-reload
sudo systemctl enable hetasinglar-backend
sudo systemctl start hetasinglar-backend

# Wait for service to start
sleep 5

# 7. Check service status
echo "7. ✅ Service Status:"
sudo systemctl status hetasinglar-backend --no-pager -l

# 8. Test API endpoints
echo "8. 🧪 Testing API endpoints..."
echo "Testing health endpoint (local):"
curl -s -m 10 http://localhost:5000/api/health || echo "❌ Local health check failed"

echo ""
echo "Testing external access:"
curl -s -m 10 http://13.48.194.178:5000/api/health || echo "❌ External health check failed"

# 9. Check what's running on port 5000
echo ""
echo "9. 🔌 Port 5000 status:"
netstat -tlnp | grep :5000

# 10. Show logs
echo ""
echo "10. 📜 Recent logs:"
sudo journalctl -u hetasinglar-backend -n 10 --no-pager

echo ""
echo "🏁 Quick fix script complete!"
echo ""
echo "🌐 Your API endpoints should be:"
echo "   - Health: http://13.48.194.178:5000/api/health"
echo "   - Health: https://apihetasinglar.duckdns.org/api/health"
echo "   - Login: http://13.48.194.178:5000/api/agents/login"
echo ""
echo "📋 To monitor logs in real-time:"
echo "   sudo journalctl -u hetasinglar-backend -f"
echo ""
echo "🔄 To restart service:"
echo "   sudo systemctl restart hetasinglar-backend"
echo ""
echo "🛑 To stop service:"
echo "   sudo systemctl stop hetasinglar-backend"