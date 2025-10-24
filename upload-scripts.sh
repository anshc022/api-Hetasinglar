#!/bin/bash

echo "📤 Uploading production scripts to EC2..."

EC2_HOST="13.48.194.178"
EC2_USER="ec2-user"
KEY_FILE="hetasinglar-key.pem"

# List of scripts to upload
SCRIPTS=(
    "diagnose-production.sh"
    "fix-production.sh" 
    "restart-production.sh"
    "monitor-production.sh"
    "test-production-api.sh"
    "deploy-production.sh"
)

echo "Uploading scripts to EC2 instance..."

for script in "${SCRIPTS[@]}"; do
    echo "📁 Uploading $script..."
    scp -i "$KEY_FILE" "$script" "$EC2_USER@$EC2_HOST:~/"
    
    # Make executable on remote server
    ssh -i "$KEY_FILE" "$EC2_USER@$EC2_HOST" "chmod +x ~/$script"
done

echo ""
echo "✅ All scripts uploaded successfully!"
echo ""
echo "📋 Now run these commands on your EC2 server:"
echo ""
echo "1. First, run diagnosis:"
echo "   ./diagnose-production.sh"
echo ""
echo "2. Then run the complete deployment:"
echo "   ./deploy-production.sh"
echo ""
echo "3. Or for quick fixes:"
echo "   ./fix-production.sh      # Complete fix"
echo "   ./restart-production.sh  # Quick restart"
echo ""
echo "4. For monitoring:"
echo "   ./monitor-production.sh  # Real-time monitoring"
echo "   ./test-production-api.sh # API testing"