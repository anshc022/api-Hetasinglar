# AWS Elastic Beanstalk Deployment Script for Hetasinglar Backend
# PowerShell script for Windows deployment

Write-Host "🚀 Starting AWS Deployment for Hetasinglar Backend..." -ForegroundColor Green

# Check if AWS CLI is installed
try {
    aws --version | Out-Null
    Write-Host "✅ AWS CLI detected" -ForegroundColor Green
} catch {
    Write-Host "❌ AWS CLI not found. Please install AWS CLI first." -ForegroundColor Red
    Write-Host "Download from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Check if EB CLI is installed
try {
    eb --version | Out-Null
    Write-Host "✅ EB CLI detected" -ForegroundColor Green
} catch {
    Write-Host "❌ EB CLI not found. Installing via pip..." -ForegroundColor Yellow
    pip install awsebcli
}

# Set environment variables for deployment
$env:NODE_ENV = "production"
Write-Host "🌐 Environment set to production" -ForegroundColor Blue

# Create deployment package
Write-Host "📦 Creating deployment package..." -ForegroundColor Blue

# Clean previous builds
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "🧹 Cleaned node_modules" -ForegroundColor Yellow
}

if (Test-Path "package-lock.json") {
    Remove-Item "package-lock.json"
    Write-Host "🧹 Cleaned package-lock.json" -ForegroundColor Yellow
}

# Install production dependencies
Write-Host "📥 Installing production dependencies..." -ForegroundColor Blue
npm ci --only=production

# Validate environment variables
Write-Host "🔍 Validating environment configuration..." -ForegroundColor Blue

$requiredVars = @(
    "MONGODB_URI",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET"
)

foreach ($var in $requiredVars) {
    if (-not $env:$var) {
        Write-Host "⚠️  Warning: $var not set in environment" -ForegroundColor Yellow
    } else {
        Write-Host "✅ $var configured" -ForegroundColor Green
    }
}

# Initialize Elastic Beanstalk (if not already initialized)
if (-not (Test-Path ".elasticbeanstalk")) {
    Write-Host "🔧 Initializing Elastic Beanstalk..." -ForegroundColor Blue
    eb init --platform "Node.js 18 running on 64bit Amazon Linux 2" --region us-east-1 hetasinglar-api
} else {
    Write-Host "✅ Elastic Beanstalk already initialized" -ForegroundColor Green
}

# Create environment (if not exists)
Write-Host "🏗️  Creating/updating Elastic Beanstalk environment..." -ForegroundColor Blue
try {
    eb status hetasinglar-prod 2>$null | Out-Null
    Write-Host "✅ Environment 'hetasinglar-prod' exists" -ForegroundColor Green
} catch {
    Write-Host "🔧 Creating new environment 'hetasinglar-prod'..." -ForegroundColor Blue
    eb create hetasinglar-prod --instance-type t3.micro --min-instances 1 --max-instances 4
}

# Set environment variables in EB
Write-Host "⚙️  Setting environment variables..." -ForegroundColor Blue
eb setenv `
    NODE_ENV=production `
    PORT=8080 `
    MONGODB_URI=$env:MONGODB_URI `
    JWT_SECRET=$env:JWT_SECRET `
    JWT_REFRESH_SECRET=$env:JWT_REFRESH_SECRET `
    CORS_ORIGIN="https://hetasinglar.com,https://www.hetasinglar.com"

# Deploy to Elastic Beanstalk
Write-Host "🚀 Deploying to AWS Elastic Beanstalk..." -ForegroundColor Blue
eb deploy hetasinglar-prod

# Check deployment status
Write-Host "🔍 Checking deployment status..." -ForegroundColor Blue
eb status

# Get application URL
$appUrl = eb status | Select-String "CNAME:" | ForEach-Object { $_.Line.Split()[1] }
if ($appUrl) {
    Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
    Write-Host "🌐 Application URL: https://$appUrl" -ForegroundColor Cyan
    Write-Host "💊 Health Check: https://$appUrl/api/health" -ForegroundColor Cyan
    
    # Test health endpoint
    Write-Host "🔬 Testing health endpoint..." -ForegroundColor Blue
    try {
        $response = Invoke-RestMethod -Uri "https://$appUrl/api/health" -Method Get
        Write-Host "✅ Health check passed!" -ForegroundColor Green
        Write-Host "📊 Server Status: $($response.status)" -ForegroundColor Green
        Write-Host "🌍 Environment: $($response.environment)" -ForegroundColor Green
        Write-Host "💾 Database: $($response.services.database)" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Health check failed - server may still be starting up" -ForegroundColor Yellow
        Write-Host "🔄 Try again in a few minutes: https://$appUrl/api/health" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Could not retrieve application URL" -ForegroundColor Yellow
}

Write-Host "📋 Post-deployment checklist:" -ForegroundColor Cyan
Write-Host "  1. Test all API endpoints" -ForegroundColor White
Write-Host "  2. Verify database connections" -ForegroundColor White
Write-Host "  3. Check WebSocket functionality" -ForegroundColor White
Write-Host "  4. Test username validation endpoint" -ForegroundColor White
Write-Host "  5. Configure domain name (if needed)" -ForegroundColor White
Write-Host "  6. Set up SSL certificate" -ForegroundColor White
Write-Host "  7. Configure CloudWatch monitoring" -ForegroundColor White

Write-Host "🎉 Deployment script completed!" -ForegroundColor Green
