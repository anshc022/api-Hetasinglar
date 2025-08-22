# EC2 Instance Launch Commands

# AWS CLI commands to launch t2.micro instance for Hetasinglar

# 1. Create Security Group
aws ec2 create-security-group \
    --group-name hetasinglar-sg \
    --description "Security group for Hetasinglar backend on EC2"

# 2. Add Security Group Rules
# SSH access (replace with your IP)
aws ec2 authorize-security-group-ingress \
    --group-name hetasinglar-sg \
    --protocol tcp \
    --port 22 \
    --cidr 0.0.0.0/0

# HTTP access
aws ec2 authorize-security-group-ingress \
    --group-name hetasinglar-sg \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

# HTTPS access
aws ec2 authorize-security-group-ingress \
    --group-name hetasinglar-sg \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# API direct access (optional)
aws ec2 authorize-security-group-ingress \
    --group-name hetasinglar-sg \
    --protocol tcp \
    --port 5000 \
    --cidr 0.0.0.0/0

# 3. Create Key Pair (if not exists)
aws ec2 create-key-pair \
    --key-name hetasinglar-key \
    --query 'KeyMaterial' \
    --output text > hetasinglar-key.pem

chmod 600 hetasinglar-key.pem

# 4. Launch EC2 Instance
aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --count 1 \
    --instance-type t2.micro \
    --key-name hetasinglar-key \
    --security-groups hetasinglar-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=Hetasinglar-Backend}]'

# 5. Get Instance Information
aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=Hetasinglar-Backend" \
    --query 'Reservations[*].Instances[*].[InstanceId,PublicIpAddress,State.Name]' \
    --output table

# 6. Connect to Instance (replace with your instance IP)
# ssh -i hetasinglar-key.pem ec2-user@YOUR_INSTANCE_PUBLIC_IP
