#!/bin/bash

# Script to fix nginx CORS configuration on EC2 instance
# Run this script on the EC2 server to fix CORS issues

echo "🔧 Fixing nginx CORS configuration..."

# Backup existing nginx config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)

# Create new nginx configuration without CORS headers
sudo tee /etc/nginx/sites-available/default > /dev/null <<'EOF'
server {
    listen 80;
    server_name apihetasinglar.duckdns.org;

    # Remove any default CORS headers that might conflict
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Credentials; 
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Allow-Headers;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Don't add any CORS headers - let Express handle them
        proxy_pass_header Access-Control-Allow-Origin;
        proxy_pass_header Access-Control-Allow-Credentials;
        proxy_pass_header Access-Control-Allow-Methods;
        proxy_pass_header Access-Control-Allow-Headers;
    }
}

# HTTPS configuration (if SSL is enabled)
server {
    listen 443 ssl;
    server_name apihetasinglar.duckdns.org;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/apihetasinglar.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/apihetasinglar.duckdns.org/privkey.pem;

    # Remove any default CORS headers that might conflict
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Credentials;
    proxy_hide_header Access-Control-Allow-Methods; 
    proxy_hide_header Access-Control-Allow-Headers;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Don't add any CORS headers - let Express handle them
        proxy_pass_header Access-Control-Allow-Origin;
        proxy_pass_header Access-Control-Allow-Credentials;
        proxy_pass_header Access-Control-Allow-Methods;
        proxy_pass_header Access-Control-Allow-Headers;
    }
}
EOF

echo "✅ Updated nginx configuration"

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    
    if [ $? -eq 0 ]; then
        echo "✅ Nginx reloaded successfully"
        echo "🎉 CORS fix applied! Test your application now."
    else
        echo "❌ Failed to reload nginx"
        exit 1
    fi
else
    echo "❌ Nginx configuration is invalid"
    echo "🔄 Restoring backup..."
    sudo cp /etc/nginx/sites-available/default.backup.* /etc/nginx/sites-available/default
    exit 1
fi

echo ""
echo "📋 Next steps:"
echo "1. Test your application at https://hetasinglar.vercel.app"
echo "2. Check CORS with: curl -H 'Origin: https://hetasinglar.vercel.app' -I https://apihetasinglar.duckdns.org/api/health"
echo "3. If issues persist, check Docker logs: docker logs hetasinglar-api"
