# 🚀 Quick EC2 Setup for Hetasinglar Backend

## One-Command Launch & Deploy

### Step 1: Launch EC2 Instance

**Windows (PowerShell):**
```powershell
cd backend/api-Hetasinglar
npm run ec2:launch
```

**Linux/Mac:**
```bash
cd backend/api-Hetasinglar
npm run ec2:launch-bash
```

This will:
- ✅ Create security group with proper ports
- ✅ Launch t2.micro instance (Free Tier)
- ✅ Generate SSH key pair
- ✅ Provide connection details

### Step 2: Setup Instance

```bash
# Replace YOUR_EC2_IP with the IP from Step 1
scp -i hetasinglar-key.pem ec2-setup.sh ec2-user@YOUR_EC2_IP:~/
ssh -i hetasinglar-key.pem ec2-user@YOUR_EC2_IP 'chmod +x ec2-setup.sh && sudo ./ec2-setup.sh'
```

**Alternative - Download directly from GitHub:**
```bash
# SSH to your instance first
ssh -i hetasinglar-key.pem ec2-user@YOUR_EC2_IP

# Then download and run setup script
wget https://raw.githubusercontent.com/anshc022/api-Hetasinglar/main/ec2-setup.sh
chmod +x ec2-setup.sh
sudo ./ec2-setup.sh
```

### Step 3: Configure Environment

```bash
# SSH to your instance
ssh -i hetasinglar-key.pem ec2-user@YOUR_EC2_IP

# Edit environment variables
nano /home/ec2-user/.env.production
```

**Required Variables:**
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hetasinglar
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-minimum-32-characters
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
```

### Step 4: Configure GitHub Auto-Deploy

1. **Go to your GitHub repository → Settings → Secrets**

2. **Add these secrets:**
   ```
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=wJalrXUt...
   AWS_REGION=us-east-1
   EC2_HOST=YOUR_EC2_IP
   EC2_SSH_KEY=(paste content of hetasinglar-key.pem)
   S3_BUCKET=hetasinglar-deployments
   ```

3. **Create S3 bucket:**
   ```bash
   aws s3 mb s3://hetasinglar-deployments
   ```

### Step 5: Deploy

**Auto-deploy (Recommended):**
```bash
git add .
git commit -m "Deploy to EC2"
git push origin main
```

**Manual deploy:**
```bash
# Create deployment package
tar -czf hetasinglar-backend.tar.gz --exclude=node_modules .

# Upload to EC2
scp -i hetasinglar-key.pem hetasinglar-backend.tar.gz ec2-user@YOUR_EC2_IP:~/

# Deploy
ssh -i hetasinglar-key.pem ec2-user@YOUR_EC2_IP './deploy.sh'
```

### Step 6: Verify

```bash
# Check health
curl http://YOUR_EC2_IP/api/health

# Monitor system
ssh -i hetasinglar-key.pem ec2-user@YOUR_EC2_IP './monitor.sh'
```

## 🎯 Your API Endpoints

- **Health Check**: `http://YOUR_EC2_IP/api/health`
- **Username Check**: `http://YOUR_EC2_IP/api/auth/check-username`
- **User Registration**: `http://YOUR_EC2_IP/api/auth/register`
- **User Login**: `http://YOUR_EC2_IP/api/auth/login`
- **Chat System**: `http://YOUR_EC2_IP/api/chats`

## 🔧 Management Commands

```bash
# Monitor system
npm run ec2:monitor

# View logs
npm run ec2:logs

# Manual deploy
npm run ec2:deploy

# Test production
npm run production:test http://YOUR_EC2_IP
```

## 🛡️ Security Features

- ✅ Nginx reverse proxy with security headers
- ✅ PM2 process management with auto-restart
- ✅ Firewall configuration
- ✅ SSL ready (add Let's Encrypt)
- ✅ Environment variable protection
- ✅ Auto-scaling ready

## 💰 Free Tier Usage

- **t2.micro**: 750 hours/month (runs 24/7 free)
- **EBS Storage**: 30 GB free
- **Data Transfer**: 15 GB out free
- **Estimated Cost**: $0/month (within free tier limits)

## 🔄 Auto-Deploy Features

- ✅ Triggers on push to main branch
- ✅ Runs tests before deployment
- ✅ Zero-downtime deployment
- ✅ Automatic rollback on failure
- ✅ Health check verification
- ✅ Slack/email notifications (optional)

---

## 🎉 That's it!

Your Hetasinglar backend is now running on EC2 with:
- Professional Node.js backend with real-time username validation
- Auto-deployment from GitHub
- Production-ready monitoring and logging
- Scalable architecture ready for growth

**Next Steps:**
1. Point your domain to the EC2 IP
2. Set up SSL certificate
3. Configure monitoring alerts
4. Scale as needed

Your dating platform backend is live! 🚀
