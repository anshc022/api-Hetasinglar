# Fix External API Access - Security Group Configuration

## Problem
The HetaSinglar backend API is running successfully on EC2 instance `i-077d75d7b779430a1` (13.51.56.220) port 5000, but external access is blocked by AWS Security Group restrictions.

## Current Status
- ✅ Server running on port 5000
- ✅ Internal access works: `http://localhost:5000/api/health`
- ❌ External access blocked: `http://13.51.56.220:5000/api/health`

## Solutions

### Option 1: AWS Management Console (Recommended)

1. **Log into AWS Console**
   - Go to https://aws.amazon.com/console/
   - Navigate to EC2 Dashboard

2. **Find Your Instance**
   - Go to "Instances" in the left sidebar
   - Search for instance ID: `i-077d75d7b779430a1`
   - Click on the instance

3. **Modify Security Group**
   - In the instance details, click on the "Security" tab
   - Click on the Security Group name (e.g., `sg-xxxxxxxxxx`)
   - Click "Edit inbound rules"

4. **Add Port 5000 Rule**
   ```
   Type: Custom TCP
   Protocol: TCP
   Port Range: 5000
   Source: 0.0.0.0/0 (Anywhere-IPv4)
   Description: HetaSinglar API Server
   ```

5. **Save Rules**
   - Click "Save rules"
   - Changes take effect immediately

### Option 2: AWS CLI Command

```bash
# First, get the security group ID
aws ec2 describe-instances --instance-ids i-077d75d7b779430a1 --query "Reservations[0].Instances[0].SecurityGroups[0].GroupId" --output text

# Then add the inbound rule (replace sg-xxxxxxxxxx with actual ID)
aws ec2 authorize-security-group-ingress \
    --group-id sg-xxxxxxxxxx \
    --protocol tcp \
    --port 5000 \
    --cidr 0.0.0.0/0 \
    --description "HetaSinglar API Server"
```

### Option 3: PowerShell AWS Tools

```powershell
# Install AWS Tools if not already installed
Install-Module -Name AWSPowerShell.NetCore -Force

# Configure AWS credentials (if not already done)
Set-AWSCredential -AccessKey "your-access-key" -SecretKey "your-secret-key" -StoreAs default

# Get security group ID
$instanceId = "i-077d75d7b779430a1"
$instance = Get-EC2Instance -InstanceId $instanceId
$securityGroupId = $instance.Instances[0].SecurityGroups[0].GroupId

# Add inbound rule for port 5000
$ipPermission = New-Object Amazon.EC2.Model.IpPermission
$ipPermission.IpProtocol = "tcp"
$ipPermission.FromPort = 5000
$ipPermission.ToPort = 5000
$ipPermission.IpRanges.Add("0.0.0.0/0")

Grant-EC2SecurityGroupIngress -GroupId $securityGroupId -IpPermission $ipPermission
```

## Security Considerations

### More Secure Approach (Recommended for Production)
Instead of allowing access from anywhere (0.0.0.0/0), restrict to specific IPs:

```
Source Options:
- Your Office IP: xxx.xxx.xxx.xxx/32
- Your ISP Range: xxx.xxx.xxx.0/24  
- Specific Countries: Use AWS VPC endpoints
```

### Load Balancer Alternative
For production, consider using an Application Load Balancer:
- Create ALB listening on port 80/443
- Forward to EC2 instance on port 5000
- Add SSL certificate for HTTPS
- Better security and scalability

## Testing After Fix

1. **Test External API Access**
   ```bash
   curl -X GET http://13.51.56.220:5000/api/health
   ```

2. **Expected Response**
   ```json
   {
     "status": "OK",
     "timestamp": "2025-09-04T15:07:00.071Z",
     "uptime": 182.98167302,
     "environment": "development",
     "version": "1.0.0"
   }
   ```

3. **Test WebSocket Connection**
   ```javascript
   const ws = new WebSocket('ws://13.51.56.220:5000');
   ws.onopen = () => console.log('WebSocket connected');
   ```

## DNS Configuration (Next Steps)

After security group is fixed, update DNS:
1. Point `apihetasinglar.duckdns.org` to `13.51.56.220`
2. Or set up CloudFlare/Route53 for better DNS management
3. Consider SSL certificate for HTTPS

## Instance Details
- Instance ID: `i-077d75d7b779430a1`
- Public IP: `13.51.56.220`
- Region: EU-West-1 (Stockholm)
- Server Port: 5000

## Next Actions
1. ✅ Fix security group (choose option above)
2. ⏳ Test external API access
3. ⏳ Update frontend API endpoints if needed
4. ⏳ Configure SSL certificate for production
5. ⏳ Set up proper DNS routing
