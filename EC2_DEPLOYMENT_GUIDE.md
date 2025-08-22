# EC2 Deployment Guide for Hetasinglar Backend

## 🚀 EC2 t2.micro Deployment with GitHub Auto-Deploy

This guide will help you deploy the Hetasinglar backend to an EC2 t2.micro instance with automatic deployment from GitHub.

### 📋 Prerequisites

1. **AWS Account** with EC2 access
2. **GitHub Repository** with your code
3. **Domain** (optional) for production URL

### 🖥️ EC2 Instance Setup

#### Step 1: Launch EC2 Instance

1. **Launch Instance**:
   - AMI: Amazon Linux 2
   - Instance Type: t2.micro (Free Tier)
   - Key Pair: Create or use existing
   - Security Group: Allow SSH (22), HTTP (80), HTTPS (443), Custom (5000)

2. **Security Group Rules**:
   ```
   SSH     (22)   - Your IP
   HTTP    (80)   - 0.0.0.0/0
   HTTPS   (443)  - 0.0.0.0/0
   Custom  (5000) - 0.0.0.0/0 (for direct API access)
   ```

#### Step 2: Connect and Setup

1. **Connect to EC2**:
   ```bash
   ssh -i your-key.pem ec2-user@your-ec2-public-ip
   ```

2. **Run Setup Script**:
   ```bash
   # Download and run the setup script from public repository
   wget https://raw.githubusercontent.com/anshc022/api-Hetasinglar/main/ec2-setup.sh
   chmod +x ec2-setup.sh
   sudo ./ec2-setup.sh
   ```

#### Step 3: Configure Environment Variables

1. **Edit Production Environment**:
   ```bash
   nano /home/ec2-user/.env.production
   ```

2. **Update with your values**:
   ```env
   NODE_ENV=production
   PORT=5000
   
   # Your MongoDB Atlas connection
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hetasinglar
   
   # Generate secure JWT secrets
   JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
   JWT_REFRESH_SECRET=your-super-secure-refresh-secret-minimum-32-characters
   
   # Your production domain
   CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
   ```

### 🔧 GitHub Actions Setup

#### Step 1: Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalrXUt...
AWS_REGION=us-east-1
EC2_HOST=your-ec2-public-ip
EC2_SSH_KEY=-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
S3_BUCKET=hetasinglar-deployments
```

#### Step 2: Create S3 Bucket

```bash
# Create S3 bucket for deployment packages
aws s3 mb s3://hetasinglar-deployments --region us-east-1
```

#### Step 3: IAM User Permissions

Create IAM user with these policies:
- `AmazonS3FullAccess` (or specific bucket access)
- `AmazonEC2ReadOnlyAccess`

### 🚀 Deployment Process

#### Automatic Deployment

1. **Push to main branch**:
   ```bash
   git add .
   git commit -m "Deploy to EC2"
   git push origin main
   ```

2. **GitHub Actions will**:
   - Build the application
   - Run tests
   - Create deployment package
   - Upload to S3
   - Deploy to EC2
   - Restart services
   - Verify health

#### Manual Deployment

1. **SSH to EC2**:
   ```bash
   ssh -i your-key.pem ec2-user@your-ec2-ip
   ```

2. **Upload deployment package**:
   ```bash
   # If you have the package locally
   scp -i your-key.pem hetasinglar-backend.tar.gz ec2-user@your-ec2-ip:/home/ec2-user/
   ```

3. **Run deployment**:
   ```bash
   ./deploy.sh
   ```

### 📊 Monitoring

#### Health Checks

```bash
# Check application health
curl http://your-ec2-ip/api/health

# Monitor system
./monitor.sh

# View PM2 status
pm2 status

# View logs
pm2 logs hetasinglar-api
```

#### System Monitoring

```bash
# CPU and Memory
htop

# Disk usage
df -h

# Network connections
netstat -tulpn

# Nginx status
sudo systemctl status nginx
```

### 🔒 Security Best Practices

#### 1. Security Groups
- Limit SSH access to your IP only
- Use HTTPS in production
- Close unnecessary ports

#### 2. SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

#### 3. Environment Security
- Use AWS Secrets Manager for sensitive data
- Rotate JWT secrets regularly
- Monitor access logs

### 🌐 Domain Configuration

#### Step 1: Point Domain to EC2
```
A Record: @ → your-ec2-public-ip
A Record: www → your-ec2-public-ip
```

#### Step 2: Update Nginx Configuration
```bash
sudo nano /etc/nginx/conf.d/hetasinglar.conf
# Update server_name to your domain
```

#### Step 3: Update CORS Settings
```bash
nano /home/ec2-user/.env.production
# Update CORS_ORIGIN to your domain
```

### 📦 Project Structure on EC2

```
/home/ec2-user/
├── hetasinglar-backend/          # Current application
├── hetasinglar-backend-backup-*  # Backup versions
├── ecosystem.config.js           # PM2 configuration
├── .env.production              # Environment variables
├── deploy.sh                    # Deployment script
├── monitor.sh                   # Monitoring script
└── logs/                        # Application logs
    ├── err.log
    ├── out.log
    └── combined.log
```

### 🔄 GitHub Actions Workflow

The workflow triggers on:
- Push to `main` branch
- Changes in `backend/` directory
- Manual trigger

**Workflow steps**:
1. Checkout code
2. Setup Node.js 18
3. Install dependencies
4. Run tests
5. Create deployment package
6. Upload to S3
7. Deploy to EC2
8. Health check verification

### 🛠️ Troubleshooting

#### Common Issues

1. **Health Check Fails**:
   ```bash
   pm2 logs hetasinglar-api
   curl http://localhost:5000/api/health
   ```

2. **Database Connection Issues**:
   ```bash
   # Check environment variables
   cat .env
   # Test MongoDB connection
   node -e "console.log(process.env.MONGODB_URI)"
   ```

3. **Nginx Issues**:
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   sudo tail -f /var/log/nginx/error.log
   ```

4. **PM2 Process Issues**:
   ```bash
   pm2 restart hetasinglar-api
   pm2 reload ecosystem.config.js
   pm2 monit
   ```

### 📈 Performance Optimization

#### 1. PM2 Clustering
```javascript
// ecosystem.config.js
instances: 'max', // Use all CPU cores
exec_mode: 'cluster'
```

#### 2. Nginx Caching
```nginx
# Add to nginx config
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public";
}
```

#### 3. Database Optimization
- Use MongoDB connection pooling
- Implement query optimization
- Add database indexes

### 💰 Cost Optimization

#### t2.micro Free Tier Limits
- 750 hours/month (24/7 for one instance)
- 30 GB EBS storage
- 15 GB data transfer out

#### Monitoring Costs
```bash
# Check AWS costs
aws ce get-cost-and-usage --time-period Start=2024-01-01,End=2024-01-31 --granularity MONTHLY --metrics BlendedCost
```

### 🎯 Production Checklist

- [ ] EC2 instance launched and configured
- [ ] Security groups properly configured
- [ ] Environment variables set
- [ ] GitHub secrets configured
- [ ] S3 bucket created
- [ ] Domain pointed to EC2 (optional)
- [ ] SSL certificate installed (optional)
- [ ] Monitoring scripts working
- [ ] Backup strategy implemented
- [ ] Auto-deployment tested

### 📞 Support Commands

```bash
# Quick health check
curl http://your-domain.com/api/health

# Test all endpoints
npm run production:test http://your-domain.com

# View system status
./monitor.sh

# Emergency restart
pm2 restart all
sudo systemctl restart nginx
```

---

## 🎉 Your EC2 deployment is ready!

**API URL**: `http://your-ec2-ip/api/health`  
**Admin Panel**: `http://your-ec2-ip/api/status`  
**Auto-Deploy**: Push to main branch triggers deployment

The setup includes:
- ✅ Node.js 18 with PM2 process management
- ✅ Nginx reverse proxy with security headers
- ✅ GitHub Actions CI/CD pipeline
- ✅ Automatic health checks and rollback
- ✅ Comprehensive monitoring and logging
- ✅ Production-ready security configuration
