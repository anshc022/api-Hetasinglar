# Simple EC2 Database Fix Deployment Script
$PemFile = "F:\vercal\Hetasinglar\backend\api-Hetasinglar\hetasinglar-key.pem"
$EC2User = "ec2-user"
$EC2Host = "13.51.56.220"

Write-Host "🚀 Deploying Database Fix to EC2..." -ForegroundColor Green
Write-Host "🔑 PEM File: $PemFile" -ForegroundColor Cyan
Write-Host "👤 User: $EC2User" -ForegroundColor Cyan  
Write-Host "🌐 Host: $EC2Host" -ForegroundColor Cyan

# Verify PEM file exists
if (-not (Test-Path $PemFile)) {
    Write-Host "❌ PEM file not found: $PemFile" -ForegroundColor Red
    exit 1
}

# Test SSH connection first
Write-Host "🔍 Testing SSH connection..." -ForegroundColor Cyan
$testResult = ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "echo 'Connection successful'"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ SSH connection successful!" -ForegroundColor Green
    Write-Host $testResult -ForegroundColor Green
} else {
    Write-Host "❌ SSH connection failed" -ForegroundColor Red
    exit 1
}

# Check current directory on EC2
Write-Host "📁 Checking EC2 directory..." -ForegroundColor Cyan
ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "pwd; ls -la"

# Create application directory
Write-Host "📁 Creating application directory..." -ForegroundColor Cyan
ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "mkdir -p api-Hetasinglar"

# Copy essential files
Write-Host "📤 Copying files to EC2..." -ForegroundColor Cyan

$filesToCopy = @("server.js", ".env.production", "package.json", "deploy-aws.sh", "test-database-connection.js")

foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Write-Host "📤 Copying $file..." -ForegroundColor Yellow
        scp -i $PemFile -o StrictHostKeyChecking=no $file $EC2User@$EC2Host`:api-Hetasinglar/
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $file copied successfully" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Failed to copy $file" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  $file not found locally" -ForegroundColor Yellow
    }
}

# Make deployment script executable
Write-Host "🔧 Making deploy script executable..." -ForegroundColor Cyan
ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "chmod +x api-Hetasinglar/deploy-aws.sh"

# Test database connection
Write-Host "🧪 Testing database connection..." -ForegroundColor Cyan
$dbTestResult = ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "cd api-Hetasinglar; NODE_ENV=production node test-database-connection.js"

Write-Host "📊 Database Test Results:" -ForegroundColor Green
Write-Host $dbTestResult -ForegroundColor Gray

if ($dbTestResult -match "Successfully connected to MongoDB") {
    if ($dbTestResult -match "hetasinglar\.ca0z4d\.mongodb\.net") {
        Write-Host "🎉 SUCCESS: Connected to NEW production database!" -ForegroundColor Green
        
        # Deploy the application
        Write-Host "🚀 Deploying application..." -ForegroundColor Cyan
        $deployResult = ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "cd api-Hetasinglar; ./deploy-aws.sh"
        
        Write-Host "📊 Deployment Results:" -ForegroundColor Green
        Write-Host $deployResult -ForegroundColor Gray
        
        # Wait and test API
        Write-Host "⏳ Waiting 15 seconds for startup..." -ForegroundColor Cyan
        Start-Sleep -Seconds 15
        
        Write-Host "🏥 Testing API health..." -ForegroundColor Cyan
        $healthResult = ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "curl -s http://localhost:5000/api/health"
        
        Write-Host "📊 API Health Check:" -ForegroundColor Green
        Write-Host $healthResult -ForegroundColor Gray
        
        Write-Host ""
        Write-Host "🎉 DEPLOYMENT COMPLETED!" -ForegroundColor Green
        Write-Host "🌐 Test your API: http://$EC2Host:5000/api/health" -ForegroundColor Cyan
        Write-Host "🗄️  Database: NEW Production Database" -ForegroundColor Green
        
    } else {
        Write-Host "⚠️  WARNING: Still using old database!" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Database connection failed!" -ForegroundColor Red
}

Write-Host "✨ Script completed!" -ForegroundColor Green