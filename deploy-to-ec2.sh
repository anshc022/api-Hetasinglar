#!/bin/bash

echo "📦 Complete HetaSinglar Backend Deployment to EC2"
echo "================================================="

# Configuration
EC2_HOST="13.48.194.178"
EC2_USER="ec2-user"
KEY_FILE="hetasinglar-key.pem"
REMOTE_DIR="/home/ec2-user/api-Hetasinglar"

echo "🏗️  Preparing deployment package..."

# Create a temporary directory for deployment
TEMP_DIR=$(mktemp -d)
echo "📁 Using temporary directory: $TEMP_DIR"

# Copy all necessary files
echo "📋 Copying backend files..."

# Essential files and directories
cp -r models/ "$TEMP_DIR/" 2>/dev/null || echo "⚠️  models/ directory not found"
cp -r routes/ "$TEMP_DIR/" 2>/dev/null || echo "⚠️  routes/ directory not found"
cp -r services/ "$TEMP_DIR/" 2>/dev/null || echo "⚠️  services/ directory not found" 
cp -r constants/ "$TEMP_DIR/" 2>/dev/null || echo "⚠️  constants/ directory not found"
cp -r config/ "$TEMP_DIR/" 2>/dev/null || echo "⚠️  config/ directory not found"

# Core files
cp server.js "$TEMP_DIR/" 2>/dev/null || echo "❌ server.js not found!"
cp auth.js "$TEMP_DIR/" 2>/dev/null || echo "⚠️  auth.js not found"
cp package.json "$TEMP_DIR/" 2>/dev/null || echo "❌ package.json not found!"
cp package-lock.json "$TEMP_DIR/" 2>/dev/null || echo "⚠️  package-lock.json not found"

# Admin initialization files
cp initAdmin.js "$TEMP_DIR/" 2>/dev/null || echo "⚠️  initAdmin.js not found"
cp initCommissionSystem.js "$TEMP_DIR/" 2>/dev/null || echo "⚠️  initCommissionSystem.js not found"

# Environment and deployment files
cp .env.production "$TEMP_DIR/"
cp deploy-production.sh "$TEMP_DIR/"
cp *.sh "$TEMP_DIR/" 2>/dev/null

echo "📤 Uploading files to EC2..."

# Stop the service first
echo "🛑 Stopping remote service..."
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_HOST" "sudo systemctl stop hetasinglar-backend 2>/dev/null || true"

# Create backup of current deployment
echo "💾 Creating backup..."
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_HOST" "
if [ -d '$REMOTE_DIR' ]; then
    sudo mv '$REMOTE_DIR' '${REMOTE_DIR}.backup.$(date +%Y%m%d_%H%M%S)' 2>/dev/null || true
fi
mkdir -p '$REMOTE_DIR'
"

# Upload all files
echo "⬆️  Uploading complete backend..."
scp -i "$KEY_FILE" -r "$TEMP_DIR"/* "$EC2_USER@$EC2_HOST:$REMOTE_DIR/"

# Set correct permissions
echo "🔒 Setting permissions..."
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_HOST" "
cd '$REMOTE_DIR'
chmod +x *.sh 2>/dev/null || true
chmod 600 .env.production 2>/dev/null || true
"

# Install dependencies
echo "📦 Installing Node.js dependencies..."
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_HOST" "
cd '$REMOTE_DIR'
npm install --production 2>/dev/null || echo '⚠️  npm install had issues'
"

# Run deployment script
echo "🚀 Running deployment script..."
ssh -i "$KEY_FILE" "$EC2_USER@$EC2_HOST" "
cd '$REMOTE_DIR'
./deploy-production.sh
"

# Cleanup
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Testing endpoints..."
sleep 5

# Test the deployment
echo "Testing health endpoint:"
curl -s -m 10 "https://apihetasinglar.duckdns.org/api/health" | head -200

echo ""
echo "Testing login endpoint:"
curl -s -m 10 -X POST "https://apihetasinglar.duckdns.org/api/agents/login" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"Dio123","password":"Dio123!"}' | head -200

echo ""
echo ""
echo "🎉 Deployment finished!"
echo "📊 Check status with: ssh -i $KEY_FILE $EC2_USER@$EC2_HOST './monitor-production.sh'"