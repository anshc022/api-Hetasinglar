#!/bin/bash

echo "🔄 Quick Production Restart Script"
echo "=================================="

# Stop the service
echo "🛑 Stopping service..."
sudo systemctl stop hetasinglar-backend

# Kill any remaining node processes
sudo pkill -f "node.*server.js" 2>/dev/null || true

# Wait a moment
sleep 2

# Start the service
echo "🚀 Starting service..."
sudo systemctl start hetasinglar-backend

# Wait for startup
sleep 3

# Check status
echo "📊 Service status:"
sudo systemctl status hetasinglar-backend --no-pager -l

echo ""
echo "🧪 Quick API test:"
curl -s -m 5 http://localhost:5000/api/health || echo "❌ API not responding"

echo ""
echo "✅ Restart complete!"