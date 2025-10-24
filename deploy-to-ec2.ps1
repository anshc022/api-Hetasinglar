# Deploy to EC2 and Test Database Fix
param(
    [string]$PemFile = "F:\vercal\Hetasinglar\backend\api-Hetasinglar\hetasinglar-key.pem",
    [string]$EC2User = "ec2-user", 
    [string]$EC2Host = "13.48.194.178",
    [switch]$TestOnly = $false
)

Write-Host "🚀 Deploying Database Fix to EC2..." -ForegroundColor Green
Write-Host "🔑 PEM File: $PemFile" -ForegroundColor Cyan
Write-Host "👤 User: $EC2User" -ForegroundColor Cyan  
Write-Host "🌐 Host: $EC2Host" -ForegroundColor Cyan

# Verify PEM file exists
if (-not (Test-Path $PemFile)) {
    Write-Host "❌ PEM file not found: $PemFile" -ForegroundColor Red
    exit 1
}

# Set proper permissions for PEM file (Windows equivalent of chmod 400)
try {
    $acl = Get-Acl $PemFile
    $acl.SetAccessRuleProtection($true, $false)
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "FullControl", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl $PemFile $acl
    Write-Host "✅ PEM file permissions set" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  Could not set PEM permissions: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Function to run SSH command
function Invoke-SSHCommand {
    param(
        [string]$Command,
        [string]$Description
    )
    
    Write-Host "🔧 $Description..." -ForegroundColor Cyan
    
    $sshArgs = @(
        "-i", $PemFile,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "$EC2User@$EC2Host",
        $Command
    )
    
    $result = & ssh @sshArgs 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ $Description completed" -ForegroundColor Green
        return $result
    }
    else {
        Write-Host "❌ $Description failed" -ForegroundColor Red
        Write-Host "Error: $result" -ForegroundColor Red
        return $null
    }
}

# Function to copy file to EC2
function Copy-ToEC2 {
    param(
        [string]$LocalFile,
        [string]$RemotePath,
        [string]$Description
    )
    
    Write-Host "📤 $Description..." -ForegroundColor Cyan
    
    $scpArgs = @(
        "-i", $PemFile,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        $LocalFile,
        "$EC2User@$EC2Host`:$RemotePath"
    )
    
    $result = & scp @scpArgs 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ $Description completed" -ForegroundColor Green
        return $true
    }
    else {
        Write-Host "❌ $Description failed" -ForegroundColor Red
        Write-Host "Error: $result" -ForegroundColor Red
        return $false
    }
}

try {
    # Test SSH connection
    Write-Host "🔍 Testing SSH connection..." -ForegroundColor Cyan
    $connectionTest = Invoke-SSHCommand "echo 'SSH connection successful'" "Testing SSH connection"
    
    if (-not $connectionTest) {
        Write-Host "❌ Cannot connect to EC2 instance" -ForegroundColor Red
        exit 1
    }
    
    Write-Host $connectionTest -ForegroundColor Green
    
    if ($TestOnly) {
        Write-Host "✅ SSH connection test successful!" -ForegroundColor Green
        exit 0
    }
    
    # Check current directory structure
    Write-Host "📁 Checking current directory structure..." -ForegroundColor Cyan
    $dirCheck = Invoke-SSHCommand "pwd; ls -la" "Checking current directory"
    Write-Host $dirCheck -ForegroundColor Gray
    
    # Look for existing application
    Write-Host "🔍 Looking for existing Hetasinglar application..." -ForegroundColor Cyan
    $appCheck = Invoke-SSHCommand "find /home/$EC2User -name 'server.js' -o -name 'package.json' 2>/dev/null | head -5" "Finding application files"
    Write-Host $appCheck -ForegroundColor Gray
    
    # Check if API directory exists
    $apiDirCheck = Invoke-SSHCommand "ls -la /home/$EC2User/api-Hetasinglar/ 2>/dev/null || echo 'Directory not found'" "Checking API directory"
    Write-Host $apiDirCheck -ForegroundColor Gray
    
    # Create/navigate to application directory
    $createDir = Invoke-SSHCommand "mkdir -p /home/$EC2User/api-Hetasinglar; cd /home/$EC2User/api-Hetasinglar; pwd" "Creating application directory"
    
    # Copy essential files to EC2
    Write-Host "📤 Copying updated files to EC2..." -ForegroundColor Cyan
    
    $filesToCopy = @(
        @{Local="server.js"; Remote="/home/$EC2User/api-Hetasinglar/server.js"; Desc="Updated server.js with database fix"},
        @{Local=".env.production"; Remote="/home/$EC2User/api-Hetasinglar/.env.production"; Desc="Production environment file"},
        @{Local="package.json"; Remote="/home/$EC2User/api-Hetasinglar/package.json"; Desc="Package.json"},
        @{Local="deploy-aws.sh"; Remote="/home/$EC2User/api-Hetasinglar/deploy-aws.sh"; Desc="Deployment script"},
        @{Local="test-database-connection.js"; Remote="/home/$EC2User/api-Hetasinglar/test-database-connection.js"; Desc="Database test script"}
    )
    
    foreach ($file in $filesToCopy) {
        if (Test-Path $file.Local) {
            $success = Copy-ToEC2 $file.Local $file.Remote $file.Desc
            if (-not $success) {
                Write-Host "⚠️  Failed to copy $($file.Local), continuing..." -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "⚠️  Local file not found: $($file.Local)" -ForegroundColor Yellow
        }
    }
    
    # Make deployment script executable
    $chmodResult = Invoke-SSHCommand "chmod +x /home/$EC2User/api-Hetasinglar/deploy-aws.sh" "Making deployment script executable"
    
    # Test database connection with production environment
    Write-Host "🧪 Testing database connection with production environment..." -ForegroundColor Cyan
    $dbTest = Invoke-SSHCommand "cd /home/$EC2User/api-Hetasinglar; NODE_ENV=production node test-database-connection.js" "Testing database connection"
    
    if ($dbTest) {
        Write-Host "📊 Database Test Results:" -ForegroundColor Green
        Write-Host $dbTest -ForegroundColor Gray
        
        if ($dbTest -match "Successfully connected to MongoDB") {
            Write-Host "✅ Database connection successful!" -ForegroundColor Green
            
            # Check if it's connecting to the NEW database
            if ($dbTest -match "hetasinglar\.ca0z4d\.mongodb\.net") {
                Write-Host "🎉 Connected to NEW production database!" -ForegroundColor Green
                
                # Deploy the application
                Write-Host "🚀 Deploying application with new database..." -ForegroundColor Cyan
                $deployResult = Invoke-SSHCommand "cd /home/$EC2User/api-Hetasinglar; ./deploy-aws.sh" "Deploying application"
                
                if ($deployResult) {
                    Write-Host "📊 Deployment Results:" -ForegroundColor Green
                    Write-Host $deployResult -ForegroundColor Gray
                    
                    # Test API health endpoint
                    Write-Host "🏥 Testing API health endpoint..." -ForegroundColor Cyan
                    Start-Sleep -Seconds 10  # Wait for startup
                    
                    $healthTest = Invoke-SSHCommand "curl -s http://localhost:5000/api/health | head -10" "Testing API health"
                    if ($healthTest) {
                        Write-Host "📊 API Health Check:" -ForegroundColor Green
                        Write-Host $healthTest -ForegroundColor Gray
                    }
                    
                    Write-Host ""
                    Write-Host "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!" -ForegroundColor Green
                    Write-Host "🔗 Your API should now be running with the NEW database" -ForegroundColor Cyan
                    Write-Host "🌐 Test URL: http://$EC2Host:5000/api/health" -ForegroundColor Cyan
                    Write-Host "🗄️  Database: NEW Production Database (hetasinglar.ca0z4d.mongodb.net)" -ForegroundColor Green
                }
                else {
                    Write-Host "❌ Deployment failed" -ForegroundColor Red
                }
            }
            else {
                Write-Host "⚠️  Warning: Still connecting to old database!" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "❌ Database connection failed" -ForegroundColor Red
        }
    }
    else {
        Write-Host "❌ Could not test database connection" -ForegroundColor Red
    }
}
catch {
    Write-Host "💥 Deployment failed with error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "✨ Script completed at: $(Get-Date)" -ForegroundColor Green