# AWS Deployment Guide for Hetasinglar Backend

## 🚀 Production Deployment to AWS Elastic Beanstalk

This guide will help you deploy the Hetasinglar backend to AWS Elastic Beanstalk for production use.

### Prerequisites

1. **AWS Account**: Ensure you have an active AWS account
2. **AWS CLI**: Install and configure AWS CLI
   - Download: https://aws.amazon.com/cli/
   - Configure: `aws configure`
3. **EB CLI**: Install Elastic Beanstalk CLI
   - Install: `pip install awsebcli`
4. **Environment Variables**: Set up production environment variables

### Environment Variables Required

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hetasinglar

# JWT Secrets
JWT_SECRET=your-super-secure-jwt-secret-key
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-key

# CORS Configuration
CORS_ORIGIN=https://hetasinglar.com,https://www.hetasinglar.com

# Production Settings
NODE_ENV=production
PORT=8080
```

### Deployment Steps

#### Option 1: Using PowerShell (Windows)
```powershell
# Navigate to backend directory
cd backend/api-Hetasinglar

# Run deployment script
.\deploy-aws.ps1
```

#### Option 2: Using Bash (Linux/Mac)
```bash
# Navigate to backend directory
cd backend/api-Hetasinglar

# Make script executable (Linux/Mac only)
chmod +x deploy-aws.sh

# Run deployment script
./deploy-aws.sh
```

#### Option 3: Manual Deployment

1. **Initialize Elastic Beanstalk**
   ```bash
   eb init --platform "Node.js 18 running on 64bit Amazon Linux 2" --region us-east-1 hetasinglar-api
   ```

2. **Create Environment**
   ```bash
   eb create hetasinglar-prod --instance-type t3.micro --min-instances 1 --max-instances 4
   ```

3. **Set Environment Variables**
   ```bash
   eb setenv NODE_ENV=production PORT=8080 MONGODB_URI=your-mongodb-uri JWT_SECRET=your-jwt-secret JWT_REFRESH_SECRET=your-refresh-secret CORS_ORIGIN=https://hetasinglar.com,https://www.hetasinglar.com
   ```

4. **Deploy Application**
   ```bash
   eb deploy hetasinglar-prod
   ```

### Project Structure for Deployment

```
backend/api-Hetasinglar/
├── .ebextensions/                 # Elastic Beanstalk configuration
│   ├── 01-nodejs.config          # Node.js settings
│   └── 02-environment.config     # Environment variables
├── .dockerignore                 # Docker ignore file
├── .env.production              # Production environment variables
├── Dockerfile                   # Docker configuration
├── deploy-aws.ps1              # Windows deployment script
├── deploy-aws.sh               # Linux/Mac deployment script
├── package.json                # Dependencies
├── server.js                   # Main server file
└── ... (other application files)
```

### Post-Deployment Verification

1. **Health Check**
   ```bash
   curl https://your-app-url.elasticbeanstalk.com/api/health
   ```

2. **Test Endpoints**
   - Health: `/api/health`
   - Status: `/api/status`
   - Username check: `/api/auth/check-username`
   - CORS test: `/api/cors-test`

3. **Monitor Logs**
   ```bash
   eb logs hetasinglar-prod
   ```

### AWS Configuration Files

#### Dockerfile
- **Base Image**: Node.js 18 Alpine
- **Security**: Non-root user execution
- **Health Check**: Built-in health monitoring
- **Port**: Exposes port 8080

#### .ebextensions/01-nodejs.config
- **Node.js Version**: 18.x
- **Auto Scaling**: 1-4 instances
- **Instance Type**: t3.micro
- **Health Check**: Custom health URL

#### .ebextensions/02-environment.config
- **Environment Variables**: Production settings
- **CORS Configuration**: Secure origin settings
- **Database**: MongoDB Atlas connection

### Security Features

1. **CORS Protection**: Configured for production domains
2. **Security Headers**: XSS protection, content type options
3. **Request Limits**: Body size restrictions
4. **Error Handling**: Production-safe error responses
5. **Connection Pooling**: Optimized database connections

### Monitoring and Logging

1. **Health Checks**: Automated health monitoring
2. **CloudWatch Logs**: Centralized logging
3. **Performance Metrics**: CPU, memory, and response times
4. **Error Tracking**: Comprehensive error logging

### Scaling Configuration

- **Auto Scaling**: Automatically scales between 1-4 instances
- **Load Balancing**: AWS Application Load Balancer
- **Health Checks**: Automatic unhealthy instance replacement
- **Rolling Deployments**: Zero-downtime deployments

### Domain Configuration (Optional)

1. **Custom Domain**: Configure your domain in Route 53
2. **SSL Certificate**: Use AWS Certificate Manager
3. **CNAME Record**: Point to Elastic Beanstalk environment

### Troubleshooting

#### Common Issues

1. **Environment Variables Not Set**
   ```bash
   eb printenv
   eb setenv KEY=value
   ```

2. **Health Check Failures**
   - Check `/api/health` endpoint
   - Verify database connectivity
   - Review application logs

3. **Deployment Failures**
   ```bash
   eb logs
   eb events
   ```

4. **Database Connection Issues**
   - Verify MongoDB Atlas whitelist
   - Check connection string format
   - Ensure network connectivity

### Commands Reference

```bash
# Check environment status
eb status

# View logs
eb logs

# SSH into instance
eb ssh

# Terminate environment
eb terminate hetasinglar-prod

# Open application in browser
eb open
```

### Production Checklist

- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] Health check passing
- [ ] All API endpoints working
- [ ] WebSocket connections functional
- [ ] CORS configured correctly
- [ ] SSL certificate installed
- [ ] Domain name configured
- [ ] Monitoring alerts set up
- [ ] Backup strategy implemented

### Support

For deployment issues:
1. Check AWS Elastic Beanstalk console
2. Review CloudWatch logs
3. Test health endpoint
4. Verify environment variables
5. Check security group settings

---

## Production URLs

- **Health Check**: `https://your-app.elasticbeanstalk.com/api/health`
- **API Documentation**: `https://your-app.elasticbeanstalk.com/api/status`
- **Username Validation**: `https://your-app.elasticbeanstalk.com/api/auth/check-username`

The backend is now production-ready with:
- ✅ Enhanced security and error handling
- ✅ Production-grade database configuration
- ✅ Auto-scaling and load balancing
- ✅ Comprehensive health monitoring
- ✅ Real-time username validation
- ✅ Professional WebSocket chat system
- ✅ AWS-optimized deployment configuration
