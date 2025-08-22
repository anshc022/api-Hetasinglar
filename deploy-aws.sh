#!/bin/bash

# AWS Elastic Beanstalk Deployment Script for Hetasinglar Backend
# Linux/Mac deployment script

echo "🚀 Starting AWS Deployment for Hetasinglar Backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if AWS CLI is installed
if command -v aws &> /dev/null; then
    echo -e "${GREEN}✅ AWS CLI detected${NC}"
else
    echo -e "${RED}❌ AWS CLI not found. Please install AWS CLI first.${NC}"
    echo -e "${YELLOW}Installation: https://aws.amazon.com/cli/${NC}"
    exit 1
fi

# Check if EB CLI is installed
if command -v eb &> /dev/null; then
    echo -e "${GREEN}✅ EB CLI detected${NC}"
else
    echo -e "${YELLOW}❌ EB CLI not found. Installing via pip...${NC}"
    pip install awsebcli
fi

# Set environment variables for deployment
export NODE_ENV=production
echo -e "${BLUE}🌐 Environment set to production${NC}"

# Create deployment package
echo -e "${BLUE}📦 Creating deployment package...${NC}"

# Clean previous builds
if [ -d "node_modules" ]; then
    rm -rf node_modules
    echo -e "${YELLOW}🧹 Cleaned node_modules${NC}"
fi

if [ -f "package-lock.json" ]; then
    rm package-lock.json
    echo -e "${YELLOW}🧹 Cleaned package-lock.json${NC}"
fi

# Install production dependencies
echo -e "${BLUE}📥 Installing production dependencies...${NC}"
npm ci --only=production

# Validate environment variables
echo -e "${BLUE}🔍 Validating environment configuration...${NC}"

required_vars=("MONGODB_URI" "JWT_SECRET" "JWT_REFRESH_SECRET")

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${YELLOW}⚠️  Warning: $var not set in environment${NC}"
    else
        echo -e "${GREEN}✅ $var configured${NC}"
    fi
done

# Initialize Elastic Beanstalk (if not already initialized)
if [ ! -d ".elasticbeanstalk" ]; then
    echo -e "${BLUE}🔧 Initializing Elastic Beanstalk...${NC}"
    eb init --platform "Node.js 18 running on 64bit Amazon Linux 2" --region us-east-1 hetasinglar-api
else
    echo -e "${GREEN}✅ Elastic Beanstalk already initialized${NC}"
fi

# Create environment (if not exists)
echo -e "${BLUE}🏗️  Creating/updating Elastic Beanstalk environment...${NC}"
if eb status hetasinglar-prod &> /dev/null; then
    echo -e "${GREEN}✅ Environment 'hetasinglar-prod' exists${NC}"
else
    echo -e "${BLUE}🔧 Creating new environment 'hetasinglar-prod'...${NC}"
    eb create hetasinglar-prod --instance-type t3.micro --min-instances 1 --max-instances 4
fi

# Set environment variables in EB
echo -e "${BLUE}⚙️  Setting environment variables...${NC}"
eb setenv \
    NODE_ENV=production \
    PORT=8080 \
    MONGODB_URI="$MONGODB_URI" \
    JWT_SECRET="$JWT_SECRET" \
    JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    CORS_ORIGIN="https://hetasinglar.com,https://www.hetasinglar.com"

# Deploy to Elastic Beanstalk
echo -e "${BLUE}🚀 Deploying to AWS Elastic Beanstalk...${NC}"
eb deploy hetasinglar-prod

# Check deployment status
echo -e "${BLUE}🔍 Checking deployment status...${NC}"
eb status

# Get application URL
app_url=$(eb status | grep "CNAME:" | awk '{print $2}')
if [ ! -z "$app_url" ]; then
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    echo -e "${CYAN}🌐 Application URL: https://$app_url${NC}"
    echo -e "${CYAN}💊 Health Check: https://$app_url/api/health${NC}"
    
    # Test health endpoint
    echo -e "${BLUE}🔬 Testing health endpoint...${NC}"
    if curl -s "https://$app_url/api/health" > /dev/null; then
        echo -e "${GREEN}✅ Health check passed!${NC}"
        
        # Get health details
        health_response=$(curl -s "https://$app_url/api/health")
        status=$(echo $health_response | jq -r '.status' 2>/dev/null || echo "Unknown")
        environment=$(echo $health_response | jq -r '.environment' 2>/dev/null || echo "Unknown")
        database=$(echo $health_response | jq -r '.services.database' 2>/dev/null || echo "Unknown")
        
        echo -e "${GREEN}📊 Server Status: $status${NC}"
        echo -e "${GREEN}🌍 Environment: $environment${NC}"
        echo -e "${GREEN}💾 Database: $database${NC}"
    else
        echo -e "${YELLOW}⚠️  Health check failed - server may still be starting up${NC}"
        echo -e "${YELLOW}🔄 Try again in a few minutes: https://$app_url/api/health${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not retrieve application URL${NC}"
fi

echo -e "${CYAN}📋 Post-deployment checklist:${NC}"
echo -e "  1. Test all API endpoints"
echo -e "  2. Verify database connections"
echo -e "  3. Check WebSocket functionality"
echo -e "  4. Test username validation endpoint"
echo -e "  5. Configure domain name (if needed)"
echo -e "  6. Set up SSL certificate"
echo -e "  7. Configure CloudWatch monitoring"

echo -e "${GREEN}🎉 Deployment script completed!${NC}"
