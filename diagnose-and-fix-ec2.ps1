# EC2 Instance Diagnosis and Recovery Script
Write-Host "EC2 Instance Diagnosis Tool" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

$EC2_IP = "13.48.194.178"
$KEY_PATH = "f:\vercal\Hetasinglar\backend\api-Hetasinglar\hetasinglar-key.pem"

Write-Host "`n1. Testing connectivity..." -ForegroundColor Yellow

# Test ping
Write-Host "   - Testing ping..." -NoNewline
$pingResult = Test-NetConnection -ComputerName $EC2_IP -InformationLevel Quiet
if ($pingResult) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " FAILED" -ForegroundColor Red
}

# Test SSH port
Write-Host "   - Testing SSH port 22..." -NoNewline
$sshResult = Test-NetConnection -ComputerName $EC2_IP -Port 22 -InformationLevel Quiet
if ($sshResult) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " FAILED" -ForegroundColor Red
}

# Test HTTP port
Write-Host "   - Testing HTTP port 80..." -NoNewline
$httpResult = Test-NetConnection -ComputerName $EC2_IP -Port 80 -InformationLevel Quiet
if ($httpResult) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " FAILED" -ForegroundColor Red
}

# Test HTTPS port
Write-Host "   - Testing HTTPS port 443..." -NoNewline
$httpsResult = Test-NetConnection -ComputerName $EC2_IP -Port 443 -InformationLevel Quiet
if ($httpsResult) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " FAILED" -ForegroundColor Red
}

Write-Host "`n2. Testing website..." -ForegroundColor Yellow

# Test website
Write-Host "   - Testing website access..." -NoNewline
try {
    $webResult = Invoke-WebRequest -Uri "https://hetasinglar.se" -Method Head -TimeoutSec 5 -ErrorAction Stop
    Write-Host " OK (Status: $($webResult.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host " FAILED" -ForegroundColor Red
}

Write-Host "`n3. Summary:" -ForegroundColor Cyan

if (-not $pingResult) {
    Write-Host "   CRITICAL: Instance is DOWN or UNREACHABLE" -ForegroundColor Red
    Write-Host "`n   Required Actions:" -ForegroundColor Yellow
    Write-Host "   1. Go to AWS EC2 Console" -ForegroundColor White
    Write-Host "   2. Find instance with IP $EC2_IP" -ForegroundColor White
    Write-Host "   3. Check if instance is stopped - if so, start it" -ForegroundColor White
    Write-Host "   4. Check Security Groups - ensure ports 22,80,443 are open" -ForegroundColor White
} else {
    Write-Host "   Instance is reachable" -ForegroundColor Green
    if ($sshResult) {
        Write-Host "   SSH is accessible - attempting connection..." -ForegroundColor Yellow
        ssh -i $KEY_PATH -o ConnectTimeout=10 ec2-user@$EC2_IP "echo 'Connection test successful'; sudo systemctl status nginx --no-pager"
    }
}

Write-Host "`nDone." -ForegroundColor Cyan