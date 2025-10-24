#!/bin/bash

echo "🚀 HetaSinglar Complete Production Deployment"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please don't run this as root. Run as ec2-user."
    exit 1
fi

# 1. Navigate to the correct directory
log_info "Step 1: Locating server directory..."
if [ -f "server.js" ]; then
    log_info "Found server.js in current directory"
elif [ -f "/home/ec2-user/hetasinglar-backend/server.js" ]; then
    cd /home/ec2-user/hetasinglar-backend/
    log_info "Changed to /home/ec2-user/hetasinglar-backend/"
elif [ -f "/home/ec2-user/api-Hetasinglar/server.js" ]; then
    cd /home/ec2-user/api-Hetasinglar/
    log_info "Changed to /home/ec2-user/api-Hetasinglar/"
else
    log_error "Cannot find server.js. Please run from the server directory."
    echo "Searching for server files..."
    find /home -name "server.js" -type f 2>/dev/null | head -5
    exit 1
fi

SERVER_DIR=$(pwd)
log_info "Server directory: $SERVER_DIR"

# 2. Stop existing services
log_info "Step 2: Stopping existing services..."
sudo systemctl stop hetasinglar-backend 2>/dev/null || true
sudo pkill -f "node.*server.js" 2>/dev/null || true
sleep 2

# 3. Backup existing config
log_info "Step 3: Backing up existing configuration..."
if [ -f ".env.production" ]; then
    cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)
    log_info "Backed up existing .env.production"
fi

# 4. Create production environment file
log_info "Step 4: Creating production environment..."
cat > .env.production << 'EOF'
PORT=5000

# Production MongoDB Connection (CORRECT CLUSTER)
MONGODB_URI=mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.ca0z4d.mongodb.net/hetasinglar?retryWrites=true&w=majority

JWT_SECRET=hetasinglar-prod-jwt-secret-2025

# Production Environment Settings
NODE_ENV=production
FRONTEND_URL=http://hotsingles.se
ALLOWED_ORIGINS=http://hotsingles.se,http://www.hotsingles.se,http://13.48.194.178

# Production Security Settings
SESSION_SECRET=hetasinglar-prod-session-secret-2025
EOF

# 5. Set proper permissions
chmod 600 .env.production
log_info "Set secure permissions on .env.production"

# 6. Test MongoDB connection
log_info "Step 5: Testing MongoDB connection..."
node -e "
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.production' });

console.log('🔌 Connecting to MongoDB Atlas...');
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000
}).then(async () => {
  console.log('✅ MongoDB connection successful');
  
  // Test agent collection
  const Agent = require('./models/Agent');
  const agentCount = await Agent.countDocuments();
  console.log('✅ Found ' + agentCount + ' agents in database');
  
  // Test specific agent
  const testAgent = await Agent.findOne({ agentId: 'Dio123' });
  console.log('✅ Test agent Dio123:', testAgent ? 'Found' : 'Not found');
  
  process.exit(0);
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  if (err.message.includes('Authentication failed')) {
    console.error('💡 MongoDB credentials are incorrect');
  } else if (err.message.includes('ENOTFOUND')) {
    console.error('💡 MongoDB cluster URL is incorrect or unreachable');
  } else if (err.message.includes('timed out')) {
    console.error('💡 Network connectivity issue to MongoDB Atlas');
  }
  process.exit(1);
});
"

if [ $? -ne 0 ]; then
    log_error "MongoDB connection test failed!"
    log_warn "Please check:"
    log_warn "1. MongoDB Atlas credentials"
    log_warn "2. Network access settings in MongoDB Atlas"
    log_warn "3. Server internet connectivity"
    exit 1
fi

# 7. Install/update Node.js dependencies
log_info "Step 6: Installing dependencies..."
if command -v npm >/dev/null 2>&1; then
    npm install --production --no-optional 2>/dev/null || log_warn "npm install had warnings"
else
    log_warn "npm not found, skipping dependency installation"
fi

# 8. Create systemd service
log_info "Step 7: Creating systemd service..."
sudo tee /etc/systemd/system/hetasinglar-backend.service > /dev/null << EOF
[Unit]
Description=HetaSinglar Backend API Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$SERVER_DIR
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StartLimitBurst=3
StartLimitInterval=60
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hetasinglar-backend

# Resource limits
LimitNOFILE=65536
MemoryLimit=512M

[Install]
WantedBy=multi-user.target
EOF

# 9. Enable and start the service
log_info "Step 8: Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable hetasinglar-backend
sudo systemctl start hetasinglar-backend

# 10. Wait for startup and check status
log_info "Step 9: Checking service startup..."
sleep 5

if sudo systemctl is-active --quiet hetasinglar-backend; then
    log_info "Service is running!"
else
    log_error "Service failed to start!"
    echo "Service status:"
    sudo systemctl status hetasinglar-backend --no-pager -l
    echo ""
    echo "Recent logs:"
    sudo journalctl -u hetasinglar-backend -n 20 --no-pager
    exit 1
fi

# 11. Test API endpoints
log_info "Step 10: Testing API endpoints..."
sleep 3

echo "Testing health endpoint..."
health_response=$(curl -s -m 10 http://localhost:5000/api/health 2>/dev/null)
if echo "$health_response" | grep -q "OK"; then
    log_info "Health endpoint working"
    echo "Database status: $(echo "$health_response" | grep -o '"database":"[^"]*"' | cut -d'"' -f4)"
else
    log_error "Health endpoint failed"
    echo "Response: $health_response"
fi

echo ""
echo "Testing agent login..."
login_response=$(curl -s -m 10 -X POST http://localhost:5000/api/agents/login \
    -H "Content-Type: application/json" \
    -d '{"agentId":"Dio123","password":"Dio123!"}' 2>/dev/null)

if echo "$login_response" | grep -q "access_token"; then
    log_info "Agent login working"
else
    log_error "Agent login failed"
    echo "Response: $login_response"
fi

# 12. Final status
echo ""
echo "=============================================="
log_info "🎉 Deployment Complete!"
echo "=============================================="
echo ""
echo "📊 Service Status:"
sudo systemctl status hetasinglar-backend --no-pager -l
echo ""
echo "🌐 API Endpoints:"
echo "   Health: https://apihetasinglar.duckdns.org/api/health"
echo "   Login:  https://apihetasinglar.duckdns.org/api/agents/login"
echo ""
echo "📋 Useful Commands:"
echo "   Check logs:    sudo journalctl -u hetasinglar-backend -f"
echo "   Restart:       sudo systemctl restart hetasinglar-backend"
echo "   Stop:          sudo systemctl stop hetasinglar-backend"
echo "   Status:        sudo systemctl status hetasinglar-backend"
echo ""
echo "🔧 Test Credentials:"
echo "   AgentId: Dio123"
echo "   Password: Dio123!"