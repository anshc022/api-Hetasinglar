#!/bin/bash

echo "Restarting backend server..."

# Kill all node processes
sudo pkill -f "node server.js" 2>/dev/null
sudo pkill node 2>/dev/null
sleep 3

# Check if port is free
PORT_CHECK=$(sudo lsof -i :5000 2>/dev/null | wc -l)
if [ $PORT_CHECK -gt 1 ]; then
    echo "Port 5000 still in use, killing processes..."
    sudo fuser -k 5000/tcp 2>/dev/null
    sleep 2
fi

# Navigate to app directory
cd /home/ec2-user/api-Hetasinglar

# Start the server
export NODE_ENV=production
nohup node server.js > api-server.log 2>&1 &

# Wait for startup
sleep 8

# Test if server started
if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "✅ Backend server started successfully"
    echo "🔍 Checking CORS configuration..."
    curl -H "Origin: https://www.hetasinglar.se" -I http://localhost:5000/api/health 2>&1 | grep -i "access-control\|origin" || echo "No CORS headers found"
else
    echo "❌ Backend server failed to start"
    echo "📋 Last 10 log lines:"
    tail -10 api-server.log
fi