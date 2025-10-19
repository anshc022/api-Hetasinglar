#!/bin/bash

# AWS Production Deployment Script for Hetasinglar API
set -euo pipefail

echo "🚀 Starting AWS Production Deployment..."
echo "📅 Deployment Time: $(date)"

# Set production environment
export NODE_ENV=production
echo "🌍 Environment set to: $NODE_ENV"

# Resolve script directory
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

# Function to verify environment files
verify_env_files() {
    echo "🔍 Verifying environment configuration..."
    
    if [ ! -f .env.production ]; then
        echo "❌ .env.production file not found!"
        echo "📝 Creating .env.production with production settings..."
        cat > .env.production << 'EOF'
PORT=5000

# Production MongoDB Connection with New Credentials (CORRECT CLUSTER)
MONGODB_URI=mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.ca0z4d.mongodb.net/hetasinglar?retryWrites=true&w=majority

JWT_SECRET=your-production-secret-key-here

# Production Environment Settings
NODE_ENV=production
FRONTEND_URL=http://hotsingles.se
ALLOWED_ORIGINS=http://hotsingles.se,http://www.hotsingles.se,http://16.171.8.139

# Production Security Settings
SESSION_SECRET=your-production-session-secret
EOF
    else
        echo "✅ .env.production file exists"
    fi
    
    # Verify the production environment has the correct database
    if grep -q "hetasinglar.ca0z4d.mongodb.net" .env.production; then
        echo "✅ Production environment configured with NEW database"
    else
        echo "⚠️  Warning: Production environment may not have the correct database!"
    fi
}

# Function to start application in production mode
start_app() {
    echo "🔄 Starting application in production mode..."
    
    # Ensure NODE_ENV is set for the application
    export NODE_ENV=production
    
    if command -v pm2 >/dev/null 2>&1; then
        pm2 start server.js --name "hetasinglar-api" \
            --max-memory-restart 1G \
            --env NODE_ENV=production \
            --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
            --merge-logs
        pm2 save
        echo "✅ Application started with PM2"
    else
        echo "⚠️  PM2 not found, starting with nohup..."
        NODE_ENV=production nohup node server.js > app.log 2>&1 &
        echo "Started with PID: $!"
    fi
}

# Function to verify deployment
verify_deployment() {
    echo "🔍 Verifying production deployment..."
    
    for i in {1..15}; do
        if check_app; then
            echo "✅ Application is responding!"
            
            # Get health check info
            HEALTH_INFO=$(curl -s http://localhost:5000/api/health || echo "Failed to get health info")
            echo "📊 Health Check Response:"
            echo "$HEALTH_INFO" | head -10
            
            # Check if we're using the correct database
            if echo "$HEALTH_INFO" | grep -q "connected"; then
                echo "✅ Database connection established"
            else
                echo "⚠️  Database connection status unclear"
            fi
            
            return 0
        else
            echo "Attempt $i/15: Waiting for application..."
            sleep 4
        fi
    done
    
    echo "❌ Application failed to start properly"
    echo "📋 Checking logs..."
    
    if command -v pm2 >/dev/null 2>&1; then
        pm2 logs hetasinglar-api --lines 20
    else
        tail -20 app.log || echo "No log file found"
    fi
    
    return 1
}

# Main deployment process
echo "🔧 Starting deployment process..."

# Stop existing processes
stop_processes

# Verify environment configuration
verify_env_files

# Install dependencies
echo "📦 Installing production dependencies..."
if command -v npm >/dev/null 2>&1; then
    npm ci --only=production --silent || {
        echo "⚠️  npm ci failed, falling back to npm install..."
        npm install --production --silent
    }
else
    echo "❌ npm is not installed or not in PATH" >&2
    exit 1
fi

# Start application
start_app

# Verify deployment
if verify_deployment; then
    echo "🎉 AWS Production Deployment completed successfully!"
    echo "🔗 API Health Check: http://localhost:5000/api/health"
    echo "📊 Application Status: RUNNING"
    echo "🗄️  Database: NEW Production Database (hetasinglar.ca0z4d.mongodb.net)"
else
    echo "❌ Deployment verification failed!"
    exit 1
fi

echo "✨ Deployment finished at: $(date)"
