#!/bin/bash

# Graceful deployment script for Hetasinglar API
set -euo pipefail
echo "🚀 Starting Hetasinglar API deployment..."

# Resolve script directory and use it as app root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
echo "📁 Working directory: $(pwd)"

# Function to check if application is running
check_app() {
    curl -f http://localhost:5000/api/health >/dev/null 2>&1
}

# Function to stop existing processes
stop_processes() {
    echo "⏸️  Stopping existing processes..."
    
    # Stop PM2 processes if available
    if command -v pm2 >/dev/null 2>&1; then
        pm2 stop hetasinglar-api 2>/dev/null || true
        pm2 delete hetasinglar-api 2>/dev/null || true
    fi
    
    # Find and stop Node.js processes
    PIDS=$(pgrep -f "node server.js" 2>/dev/null || true)
    if [ ! -z "$PIDS" ]; then
        echo "Stopping Node.js processes: $PIDS"
        kill -TERM $PIDS 2>/dev/null || true
        sleep 3
        # Force kill if still running
        kill -KILL $PIDS 2>/dev/null || true
    fi
    
    sleep 2
}

# Function to start application
start_app() {
    echo "🔄 Starting application..."
    
    if command -v pm2 >/dev/null 2>&1; then
        pm2 start server.js --name "hetasinglar-api" --max-memory-restart 1G
        pm2 save
    else
        nohup node server.js > app.log 2>&1 &
        echo "Started with PID: $!"
    fi
}

# Function to verify deployment
verify_deployment() {
    echo "🔍 Verifying deployment..."
    
    for i in {1..10}; do
        if check_app; then
            echo "✅ Application is responding!"
            curl -s http://localhost:5000/api/health | head -3
            return 0
        else
            echo "Attempt $i: Waiting for application..."
            sleep 3
        fi
    done
    
    echo "❌ Application failed to start properly"
    return 1
}

# Main deployment process runs from SCRIPT_DIR

# Stop existing processes
stop_processes

# Install dependencies
echo "📦 Installing dependencies..."
if command -v npm >/dev/null 2>&1; then
    if [ -f package-lock.json ]; then
        npm ci --only=production --silent || npm ci --silent || npm install --production --silent
    else
        npm install --production --silent
    fi
else
    echo "❌ npm is not installed or not in PATH" >&2
    exit 1
fi

# Use existing environment file (created by CI) if present
if [ -f .env ]; then
    echo "🔧 Using existing .env file"
else
    echo "⚠️  .env not found. Creating minimal .env from defaults."
    cat > .env << 'EOF'
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://hetasinglar.vercel.app
ALLOWED_ORIGINS=https://hetasinglar.vercel.app
EOF
fi

# Start application
start_app

# Wait for startup
sleep 5

# Verify deployment
if verify_deployment; then
    echo "🎉 Deployment successful!"
    exit 0
else
    echo "💥 Deployment failed!"
    exit 1
fi
