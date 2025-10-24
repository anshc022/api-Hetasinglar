# Fix Security Group Access - PowerShell Script
# This script adds port 5000 to the EC2 instance security group

param(
    [string]$AccessKey = "",
    [string]$SecretKey = "",
    [string]$Region = "eu-west-1"
)

Write-Host "🔧 HetaSinglar Security Group Fix Script" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Instance details
$instanceId = "i-077d75d7b779430a1"
$port = 5000

try {
    # Check if AWS PowerShell module is installed
    if (!(Get-Module -ListAvailable -Name AWSPowerShell.NetCore)) {
        Write-Host "⚠️  AWS PowerShell module not found. Installing..." -ForegroundColor Yellow
        Install-Module -Name AWSPowerShell.NetCore -Force -AllowClobber
        Write-Host "✅ AWS PowerShell module installed" -ForegroundColor Green
    }

    # Import AWS module
    Import-Module AWSPowerShell.NetCore

    # Set AWS credentials if provided
    if ($AccessKey -and $SecretKey) {
        Set-AWSCredential -AccessKey $AccessKey -SecretKey $SecretKey -StoreAs "temp"
        Set-AWSCredential -ProfileName "temp"
        Write-Host "✅ AWS credentials configured" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Using default AWS credentials" -ForegroundColor Yellow
        Write-Host "   Make sure you have AWS credentials configured" -ForegroundColor Yellow
    }

    # Set region
    Set-DefaultAWSRegion -Region $Region
    Write-Host "✅ AWS region set to: $Region" -ForegroundColor Green

    # Get instance information
    Write-Host "🔍 Getting instance information..." -ForegroundColor Blue
    $instance = Get-EC2Instance -InstanceId $instanceId
    
    if (!$instance) {
        throw "Instance $instanceId not found"
    }

    $securityGroups = $instance.Instances[0].SecurityGroups
    Write-Host "✅ Found instance: $instanceId" -ForegroundColor Green
    Write-Host "   Security Groups: $($securityGroups.Count)" -ForegroundColor Gray

    # Process each security group
    foreach ($sg in $securityGroups) {
        $groupId = $sg.GroupId
        Write-Host "🔧 Checking security group: $groupId" -ForegroundColor Blue
        
        # Get current rules
        $securityGroup = Get-EC2SecurityGroup -GroupId $groupId
        $existingRules = $securityGroup.IpPermissions
        
        # Check if port 5000 rule already exists
        $portExists = $false
        foreach ($rule in $existingRules) {
            if ($rule.FromPort -eq $port -and $rule.ToPort -eq $port -and $rule.IpProtocol -eq "tcp") {
                foreach ($ipRange in $rule.IpRanges) {
                    if ($ipRange.CidrIp -eq "0.0.0.0/0") {
                        $portExists = $true
                        break
                    }
                }
                if ($portExists) { break }
            }
        }

        if ($portExists) {
            Write-Host "✅ Port $port is already accessible from 0.0.0.0/0" -ForegroundColor Green
        } else {
            # Create new inbound rule
            Write-Host "➕ Adding inbound rule for port $port..." -ForegroundColor Yellow
            
            $ipPermission = New-Object Amazon.EC2.Model.IpPermission
            $ipPermission.IpProtocol = "tcp"
            $ipPermission.FromPort = $port
            $ipPermission.ToPort = $port
            
            $ipRange = New-Object Amazon.EC2.Model.IpRange
            $ipRange.CidrIp = "0.0.0.0/0"
            $ipRange.Description = "HetaSinglar API Server - Auto-added $(Get-Date -Format 'yyyy-MM-dd')"
            
            $ipPermission.IpRanges.Add($ipRange)

            # Apply the rule
            Grant-EC2SecurityGroupIngress -GroupId $groupId -IpPermission $ipPermission
            Write-Host "✅ Successfully added port $port to security group $groupId" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "🎉 Security group configuration complete!" -ForegroundColor Green
    Write-Host "   Your API should now be accessible at:" -ForegroundColor Gray
    Write-Host "   http://13.48.194.178:5000/api/health" -ForegroundColor White
    Write-Host ""
    Write-Host "🧪 Testing API access..." -ForegroundColor Blue
    
    # Test API access
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri "http://13.48.194.178:5000/api/health" -Method GET -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ API is now accessible!" -ForegroundColor Green
            Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "⚠️  API test failed. It may take a few moments for changes to propagate." -ForegroundColor Yellow
        Write-Host "   Try again in 30 seconds: http://13.48.194.178:5000/api/health" -ForegroundColor Gray
    }

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Please check your AWS credentials and permissions" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Manual steps:" -ForegroundColor Yellow
    Write-Host "1. Go to AWS Console > EC2 > Instances" -ForegroundColor Gray
    Write-Host "2. Find instance: $instanceId" -ForegroundColor Gray
    Write-Host "3. Go to Security tab > Edit inbound rules" -ForegroundColor Gray
    Write-Host "4. Add: Type=Custom TCP, Port=5000, Source=0.0.0.0/0" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   - Update frontend to use: https://apihetasinglar.duckdns.org" -ForegroundColor Gray
Write-Host "   - Configure SSL certificate for HTTPS" -ForegroundColor Gray
Write-Host "   - Set up proper DNS routing" -ForegroundColor Gray
