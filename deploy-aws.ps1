# AWS Production Deployment Script for Hetasinglar API (PowerShell)
param(
    [switch]$Force = $false
)

Write-Host "🚀 Starting AWS Production Deployment..." -ForegroundColor Green
Write-Host "📅 Deployment Time: $(Get-Date)" -ForegroundColor Cyan

# Set production environment
$env:NODE_ENV = "production"
Write-Host "🌍 Environment set to: $($env:NODE_ENV)" -ForegroundColor Yellow

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
Write-Host "📁 Working directory: $(Get-Location)" -ForegroundColor Cyan

# Function to check if application is running
function Test-Application {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

# Function to stop existing processes
function Stop-ExistingProcesses {
    Write-Host "⏸️  Stopping existing processes..." -ForegroundColor Yellow
    
    # Stop PM2 processes if available
    try {
        if (Get-Command pm2 -ErrorAction SilentlyContinue) {
            pm2 stop hetasinglar-api 2>$null
            pm2 delete hetasinglar-api 2>$null
        }
    }
    catch {
        Write-Host "PM2 not available or no processes to stop" -ForegroundColor Gray
    }
    
    # Find and stop Node.js processes
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*server.js*"
    }
    
    if ($nodeProcesses) {
        Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
        $nodeProcesses | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
}

# Function to verify environment files
function Test-EnvironmentFiles {
    Write-Host "🔍 Verifying environment configuration..." -ForegroundColor Cyan
    
    if (-not (Test-Path ".env.production")) {
        Write-Host "❌ .env.production file not found!" -ForegroundColor Red
        Write-Host "📝 Creating .env.production with production settings..." -ForegroundColor Yellow
        
        $envContent = @"
PORT=5000

# Production MongoDB Connection with New Credentials (CORRECT CLUSTER)
MONGODB_URI=mongodb+srv://HetaSinglar:HetaSinglar-0099@hetasinglar.ca0z4d.mongodb.net/hetasinglar?retryWrites=true&w=majority

JWT_SECRET=your-production-secret-key-here

# Production Environment Settings
NODE_ENV=production
FRONTEND_URL=http://hotsingles.se
ALLOWED_ORIGINS=http://hotsingles.se,http://www.hotsingles.se,http://13.48.194.178

# Production Security Settings
SESSION_SECRET=your-production-session-secret
"@
        $envContent | Out-File -FilePath ".env.production" -Encoding UTF8
    }
    else {
        Write-Host "✅ .env.production file exists" -ForegroundColor Green
    }
    
    # Verify the production environment has the correct database
    $envContent = Get-Content ".env.production" -Raw
    if ($envContent -match "hetasinglar\.ca0z4d\.mongodb\.net") {
        Write-Host "✅ Production environment configured with NEW database" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  Warning: Production environment may not have the correct database!" -ForegroundColor Yellow
    }
}

# Function to start application in production mode
function Start-Application {
    Write-Host "🔄 Starting application in production mode..." -ForegroundColor Cyan
    
    # Ensure NODE_ENV is set for the application
    $env:NODE_ENV = "production"
    
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        pm2 start server.js --name "hetasinglar-api" --max-memory-restart 1G --env NODE_ENV=production
        pm2 save
        Write-Host "✅ Application started with PM2" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  PM2 not found, starting with Start-Process..." -ForegroundColor Yellow
        $process = Start-Process -FilePath "node" -ArgumentList "server.js" -NoNewWindow -PassThru
        Write-Host "Started with PID: $($process.Id)" -ForegroundColor Green
        
        # Save PID for later reference
        $process.Id | Out-File -FilePath "app.pid"
    }
}

# Function to verify deployment
function Test-Deployment {
    Write-Host "🔍 Verifying production deployment..." -ForegroundColor Cyan
    
    for ($i = 1; $i -le 15; $i++) {
        if (Test-Application) {
            Write-Host "✅ Application is responding!" -ForegroundColor Green
            
            try {
                $healthInfo = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing | ConvertFrom-Json
                Write-Host "📊 Health Check Response:" -ForegroundColor Cyan
                Write-Host "   Status: $($healthInfo.status)" -ForegroundColor Green
                Write-Host "   Environment: $($healthInfo.environment)" -ForegroundColor Yellow
                Write-Host "   Database: $($healthInfo.services.database)" -ForegroundColor Cyan
                
                if ($healthInfo.services.database -eq "connected") {
                    Write-Host "✅ Database connection established" -ForegroundColor Green
                }
                else {
                    Write-Host "⚠️  Database connection status: $($healthInfo.services.database)" -ForegroundColor Yellow
                }
            }
            catch {
                Write-Host "⚠️  Could not parse health check response" -ForegroundColor Yellow
            }
            
            return $true
        }
        else {
            Write-Host "Attempt $i/15: Waiting for application..." -ForegroundColor Gray
            Start-Sleep -Seconds 4
        }
    }
    
    Write-Host "❌ Application failed to start properly" -ForegroundColor Red
    Write-Host "📋 Checking logs..." -ForegroundColor Yellow
    
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        pm2 logs hetasinglar-api --lines 20
    }
    elseif (Test-Path "app.log") {
        Get-Content "app.log" -Tail 20
    }
    
    return $false
}

# Main deployment process
try {
    Write-Host "🔧 Starting deployment process..." -ForegroundColor Cyan
    
    # Stop existing processes
    Stop-ExistingProcesses
    
    # Verify environment configuration
    Test-EnvironmentFiles
    
    # Install dependencies
    Write-Host "📦 Installing production dependencies..." -ForegroundColor Cyan
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        try {
            npm ci --only=production --silent
        }
        catch {
            Write-Host "⚠️  npm ci failed, falling back to npm install..." -ForegroundColor Yellow
            npm install --production --silent
        }
    }
    else {
        Write-Host "❌ npm is not installed or not in PATH" -ForegroundColor Red
        exit 1
    }
    
    # Start application
    Start-Application
    
    # Verify deployment
    if (Test-Deployment) {
        Write-Host "🎉 AWS Production Deployment completed successfully!" -ForegroundColor Green
        Write-Host "🔗 API Health Check: http://localhost:5000/api/health" -ForegroundColor Cyan
        Write-Host "📊 Application Status: RUNNING" -ForegroundColor Green
        Write-Host "🗄️  Database: NEW Production Database (hetasinglar.ca0z4d.mongodb.net)" -ForegroundColor Green
    }
    else {
        Write-Host "❌ Deployment verification failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✨ Deployment finished at: $(Get-Date)" -ForegroundColor Green
}
catch {
    Write-Host "❌ Deployment failed with error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
