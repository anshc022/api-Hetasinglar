# Quick EC2 Test Script
$PemFile = "F:\vercal\Hetasinglar\backend\api-Hetasinglar\hetasinglar-key.pem"
$EC2User = "ec2-user"
$EC2Host = "13.51.56.220"

Write-Host "Testing SSH connection to EC2..." -ForegroundColor Green

# Test basic SSH connection
Write-Host "Step 1: Testing SSH connection..." -ForegroundColor Cyan
ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "echo 'SSH works'; pwd; whoami"

Write-Host "`nStep 2: Checking for existing files..." -ForegroundColor Cyan  
ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "ls -la; find . -name '*.js' 2>/dev/null | head -5"

Write-Host "`nStep 3: Creating directory..." -ForegroundColor Cyan
ssh -i $PemFile -o StrictHostKeyChecking=no $EC2User@$EC2Host "mkdir -p api-Hetasinglar; ls -la api-Hetasinglar"

Write-Host "`nDone! SSH connection is working." -ForegroundColor Green