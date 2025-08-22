#!/bin/bash

# EC2 Instance Setup Script for Hetasinglar Backend
# This script prepares a t2.micro EC2 instance for deployment

set -e

echo "🚀 Setting up EC2 instance for Hetasinglar Backend..."

# Update system
echo "📦 Updating system packages..."
sudo yum update -y

# Install Node.js 18
echo "📥 Installing Node.js 18..."
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify Node.js installation
node_version=$(node --version)
npm_version=$(npm --version)
echo "✅ Node.js installed: $node_version"
echo "✅ npm installed: $npm_version"

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install AWS CLI
echo "📥 Installing AWS CLI..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /home/ec2-user/hetasinglar-backend
sudo chown ec2-user:ec2-user /home/ec2-user/hetasinglar-backend

# Install Git
echo "📦 Installing Git..."
sudo yum install -y git

# Configure firewall (if needed)
echo "🛡️ Configuring firewall..."
sudo yum install -y firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload

# Install Nginx for reverse proxy
echo "🌐 Installing Nginx..."
sudo amazon-linux-extras install -y nginx1
sudo systemctl start nginx
sudo systemctl enable nginx

# Create Nginx configuration for Hetasinglar
echo "⚙️ Configuring Nginx..."
sudo tee /etc/nginx/conf.d/hetasinglar.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API proxy
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:5000/api/health;
        access_log off;
    }

    # Default location
    location / {
        return 301 /api/health;
    }
}
EOF

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Create environment file template
echo "📝 Creating environment template..."
cat > /home/ec2-user/.env.production << 'EOF'
# Production Environment Variables for Hetasinglar Backend
# Copy this file and update with your actual values

NODE_ENV=production
PORT=5000

# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hetasinglar

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key-min-32-chars

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# AWS Configuration (if needed)
AWS_REGION=us-east-1
S3_BUCKET=your-s3-bucket-name

# Monitoring (optional)
HEALTH_CHECK_INTERVAL=30000
LOG_LEVEL=info
EOF

# Set up PM2 startup script
echo "🔄 Configuring PM2 startup..."
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Create PM2 ecosystem file
cat > /home/ec2-user/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'hetasinglar-api',
    script: './server.js',
    cwd: '/home/ec2-user/hetasinglar-backend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/home/ec2-user/logs/err.log',
    out_file: '/home/ec2-user/logs/out.log',
    log_file: '/home/ec2-user/logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Create logs directory
mkdir -p /home/ec2-user/logs

# Create deployment script
cat > /home/ec2-user/deploy.sh << 'EOF'
#!/bin/bash

# Deployment script for Hetasinglar Backend
echo "🚀 Starting deployment..."

cd /home/ec2-user

# Download latest deployment package
if [ -f "hetasinglar-backend.tar.gz" ]; then
    echo "📦 Deployment package found"
else
    echo "❌ No deployment package found"
    exit 1
fi

# Backup current version
if [ -d "hetasinglar-backend" ]; then
    echo "💾 Backing up current version..."
    mv hetasinglar-backend hetasinglar-backend-backup-$(date +%Y%m%d-%H%M%S)
fi

# Extract new version
echo "📂 Extracting new version..."
mkdir hetasinglar-backend
tar -xzf hetasinglar-backend.tar.gz -C hetasinglar-backend

cd hetasinglar-backend

# Install dependencies
echo "📥 Installing dependencies..."
npm ci --only=production

# Copy environment variables
if [ -f "/home/ec2-user/.env.production" ]; then
    cp /home/ec2-user/.env.production .env
    echo "✅ Environment variables copied"
else
    echo "⚠️ Warning: No .env.production file found"
fi

# Restart application with PM2
echo "🔄 Restarting application..."
pm2 restart hetasinglar-api || pm2 start /home/ec2-user/ecosystem.config.js

# Wait for startup
echo "⏳ Waiting for application to start..."
sleep 10

# Health check
echo "🔍 Performing health check..."
if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "✅ Deployment successful! Application is healthy."
    pm2 save
else
    echo "❌ Health check failed! Rolling back..."
    pm2 stop hetasinglar-api
    
    # Restore backup if available
    latest_backup=$(ls -t /home/ec2-user/hetasinglar-backend-backup-* 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
        echo "🔄 Restoring backup: $latest_backup"
        rm -rf hetasinglar-backend
        mv "$latest_backup" hetasinglar-backend
        cd hetasinglar-backend
        pm2 start /home/ec2-user/ecosystem.config.js
    fi
    exit 1
fi

echo "🎉 Deployment completed successfully!"
EOF

chmod +x /home/ec2-user/deploy.sh

# Create monitoring script
cat > /home/ec2-user/monitor.sh << 'EOF'
#!/bin/bash

# Simple monitoring script for Hetasinglar Backend
echo "📊 Hetasinglar Backend Monitoring"
echo "=================================="

echo "🔄 PM2 Status:"
pm2 status

echo ""
echo "🌐 Nginx Status:"
sudo systemctl status nginx --no-pager -l

echo ""
echo "💾 Disk Usage:"
df -h /

echo ""
echo "🧠 Memory Usage:"
free -h

echo ""
echo "🔍 Health Check:"
if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "✅ Application is healthy"
else
    echo "❌ Application health check failed"
fi

echo ""
echo "📋 Recent Logs (last 10 lines):"
tail -10 /home/ec2-user/logs/combined.log 2>/dev/null || echo "No logs found"
EOF

chmod +x /home/ec2-user/monitor.sh

echo ""
echo "✅ EC2 setup completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "1. Update /home/ec2-user/.env.production with your actual environment variables"
echo "2. Configure your GitHub repository secrets:"
echo "   - AWS_ACCESS_KEY_ID"
echo "   - AWS_SECRET_ACCESS_KEY"
echo "   - AWS_REGION"
echo "   - EC2_HOST (this instance's public IP)"
echo "   - EC2_SSH_KEY (private key content)"
echo "   - S3_BUCKET (for deployment packages)"
echo "3. Push to main branch to trigger automatic deployment"
echo ""
echo "🔧 Useful Commands:"
echo "   Monitor: ./monitor.sh"
echo "   Deploy manually: ./deploy.sh"
echo "   PM2 status: pm2 status"
echo "   Nginx status: sudo systemctl status nginx"
echo "   View logs: pm2 logs hetasinglar-api"
echo ""
echo "🌐 Access your API at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):80/api/health"
EOF
