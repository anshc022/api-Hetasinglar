# PowerShell script to launch EC2 instance for Hetasinglar

Write-Host "🚀 Launching EC2 t2.micro instance for Hetasinglar Backend..." -ForegroundColor Green

# Check if AWS CLI is installed
try {
    aws --version | Out-Null
    Write-Host "✅ AWS CLI detected" -ForegroundColor Green
} catch {
    Write-Host "❌ AWS CLI not found. Please install AWS CLI first." -ForegroundColor Red
    Write-Host "Download from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Set variables
$SecurityGroupName = "hetasinglar-sg"
$KeyPairName = "hetasinglar-key"
$InstanceName = "Hetasinglar-Backend"

Write-Host "📋 Configuration:" -ForegroundColor Blue
Write-Host "   Security Group: $SecurityGroupName" -ForegroundColor White
Write-Host "   Key Pair: $KeyPairName" -ForegroundColor White
Write-Host "   Instance Name: $InstanceName" -ForegroundColor White

# Create Security Group
Write-Host "🛡️ Creating security group..." -ForegroundColor Blue
try {
    aws ec2 create-security-group --group-name $SecurityGroupName --description "Security group for Hetasinglar backend on EC2"
    Write-Host "✅ Security group created: $SecurityGroupName" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Security group may already exist" -ForegroundColor Yellow
}

# Add Security Group Rules
Write-Host "🔐 Configuring security group rules..." -ForegroundColor Blue

# SSH access
aws ec2 authorize-security-group-ingress --group-name $SecurityGroupName --protocol tcp --port 22 --cidr "0.0.0.0/0" 2>$null
Write-Host "✅ SSH (22) access added" -ForegroundColor Green

# HTTP access
aws ec2 authorize-security-group-ingress --group-name $SecurityGroupName --protocol tcp --port 80 --cidr "0.0.0.0/0" 2>$null
Write-Host "✅ HTTP (80) access added" -ForegroundColor Green

# HTTPS access
aws ec2 authorize-security-group-ingress --group-name $SecurityGroupName --protocol tcp --port 443 --cidr "0.0.0.0/0" 2>$null
Write-Host "✅ HTTPS (443) access added" -ForegroundColor Green

# API direct access
aws ec2 authorize-security-group-ingress --group-name $SecurityGroupName --protocol tcp --port 5000 --cidr "0.0.0.0/0" 2>$null
Write-Host "✅ API (5000) access added" -ForegroundColor Green

# Create Key Pair
Write-Host "🔑 Creating key pair..." -ForegroundColor Blue
try {
    aws ec2 create-key-pair --key-name $KeyPairName --query 'KeyMaterial' --output text | Out-File -FilePath "$KeyPairName.pem" -Encoding utf8
    Write-Host "✅ Key pair created: $KeyPairName.pem" -ForegroundColor Green
    Write-Host "🔒 Keep this key file secure!" -ForegroundColor Yellow
} catch {
    Write-Host "⚠️ Key pair may already exist" -ForegroundColor Yellow
}

# Get latest Amazon Linux 2 AMI ID
Write-Host "🔍 Finding latest Amazon Linux 2 AMI..." -ForegroundColor Blue
$amiId = aws ec2 describe-images --owners amazon --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" "Name=state,Values=available" --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" --output text

Write-Host "✅ Using AMI: $amiId" -ForegroundColor Green

# Launch EC2 Instance
Write-Host "🚀 Launching EC2 instance..." -ForegroundColor Blue
$instanceResult = aws ec2 run-instances --image-id $amiId --count 1 --instance-type t2.micro --key-name $KeyPairName --security-groups $SecurityGroupName --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$InstanceName}]" | ConvertFrom-Json

$instanceId = $instanceResult.Instances[0].InstanceId
Write-Host "✅ Instance launched: $instanceId" -ForegroundColor Green

# Wait for instance to be running
Write-Host "⏳ Waiting for instance to be running..." -ForegroundColor Blue
aws ec2 wait instance-running --instance-ids $instanceId

# Get instance information
Write-Host "📊 Getting instance information..." -ForegroundColor Blue
$instanceInfo = aws ec2 describe-instances --instance-ids $instanceId --query 'Reservations[0].Instances[0].[InstanceId,PublicIpAddress,PublicDnsName,State.Name]' --output text

$instanceDetails = $instanceInfo -split "`t"
$publicIp = $instanceDetails[1]
$publicDns = $instanceDetails[2]
$state = $instanceDetails[3]

Write-Host "🎉 EC2 Instance Successfully Launched!" -ForegroundColor Green
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host "Instance ID: $instanceId" -ForegroundColor White
Write-Host "Public IP: $publicIp" -ForegroundColor White
Write-Host "Public DNS: $publicDns" -ForegroundColor White
Write-Host "State: $state" -ForegroundColor White
Write-Host "Key File: $KeyPairName.pem" -ForegroundColor White
Write-Host "=" * 50 -ForegroundColor Cyan

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Connect to your instance:" -ForegroundColor White
Write-Host "   ssh -i $KeyPairName.pem ec2-user@$publicIp" -ForegroundColor Yellow
Write-Host "`n2. Upload and run the setup script:" -ForegroundColor White
Write-Host "   scp -i $KeyPairName.pem ec2-setup.sh ec2-user@$publicIp`:~/" -ForegroundColor Yellow
Write-Host "   ssh -i $KeyPairName.pem ec2-user@$publicIp 'chmod +x ec2-setup.sh && sudo ./ec2-setup.sh'" -ForegroundColor Yellow
Write-Host "`n3. Configure GitHub Secrets:" -ForegroundColor White
Write-Host "   EC2_HOST = $publicIp" -ForegroundColor Yellow
Write-Host "   EC2_SSH_KEY = (content of $KeyPairName.pem)" -ForegroundColor Yellow
Write-Host "`n4. Update environment variables:" -ForegroundColor White
Write-Host "   Edit /home/ec2-user/.env.production on the instance" -ForegroundColor Yellow
Write-Host "`n5. Test the setup:" -ForegroundColor White
Write-Host "   http://$publicIp/api/health" -ForegroundColor Yellow

Write-Host "`n💡 Remember to:" -ForegroundColor Cyan
Write-Host "   • Create an S3 bucket for deployments" -ForegroundColor White
Write-Host "   • Configure your GitHub repository secrets" -ForegroundColor White
Write-Host "   • Update your domain DNS if using custom domain" -ForegroundColor White
Write-Host "   • Set up SSL certificate for HTTPS" -ForegroundColor White

Write-Host "`n🔒 Security Note:" -ForegroundColor Red
Write-Host "The SSH port (22) is open to 0.0.0.0/0. Consider restricting it to your IP for better security." -ForegroundColor Yellow

Write-Host "`n🎯 Your Hetasinglar backend will be accessible at:" -ForegroundColor Green
Write-Host "http://$publicIp/api/health" -ForegroundColor Cyan
