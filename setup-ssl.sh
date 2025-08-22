# SSL Setup Script for EC2
# Run this on your EC2 instance to set up HTTPS

#!/bin/bash

# Update system
sudo yum update -y

# Install Nginx
sudo yum install -y nginx

# Install certbot for Let's Encrypt
sudo yum install -y python3-pip
sudo pip3 install certbot certbot-nginx

# Create Nginx configuration for your API
sudo tee /etc/nginx/conf.d/hetasinglar-api.conf > /dev/null <<EOF
server {
    listen 80;
    server_name 13.51.56.220;  # Replace with your domain if you have one
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Open ports in firewall (if needed)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

echo "✅ Nginx setup complete!"
echo "Your API is now available at: http://13.51.56.220"
echo ""
echo "Next steps:"
echo "1. Get a domain name and point it to your EC2 IP"
echo "2. Update the server_name in /etc/nginx/conf.d/hetasinglar-api.conf"
echo "3. Run: sudo certbot --nginx to get SSL certificate"
EOF
