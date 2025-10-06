# AWS Database Configuration Fix - Quick Reference

## Problem Fixed
Your AWS deployment was showing old data because it was connecting to the wrong database due to:
1. Hardcoded fallback MongoDB URI in `server.js` (pointing to old database)
2. AWS not properly loading `.env.production` file with new database settings

## Solution Implemented

### 1. Environment Configuration
- **Development (`.env`)**: Uses OLD database for testing
- **Production (`.env.production`)**: Uses NEW database for live deployment

### 2. Server Configuration Updated
- Added automatic environment file loading based on `NODE_ENV`
- Removed hardcoded fallback database URI
- Added validation to ensure `MONGODB_URI` is set

### 3. Deployment Scripts Created
- **Linux/Mac**: `deploy-aws.sh`
- **Windows**: `deploy-aws.ps1`
- Both scripts ensure `NODE_ENV=production` and proper environment loading

## How to Deploy to AWS

### Option 1: Using the deployment script (Recommended)
```bash
# On Linux/Mac
chmod +x deploy-aws.sh
./deploy-aws.sh

# On Windows PowerShell
.\deploy-aws.ps1
```

### Option 2: Manual deployment
```bash
# Set production environment
export NODE_ENV=production

# Install dependencies
npm ci --only=production

# Start application
node server.js
```

## Testing the Fix

### Test Development Environment (OLD database)
```bash
node test-database-connection.js
```

### Test Production Environment (NEW database)
```bash
NODE_ENV=production node test-database-connection.js
```

## Verification Checklist

After deployment, verify:
1. ✅ API health check responds: `http://your-aws-server:5000/api/health`
2. ✅ Environment shows "production"
3. ✅ Database shows "connected"
4. ✅ Your NEW data appears in the application
5. ✅ No more old data showing

## Key Files Changed

1. **`server.js`**: Added environment-based config loading
2. **`.env`**: Kept with OLD database for development
3. **`.env.production`**: NEW database for production
4. **`deploy-aws.sh`**: Linux/Mac deployment script
5. **`deploy-aws.ps1`**: Windows deployment script
6. **`test-database-connection.js`**: Connection testing utility

## Database URLs Reference

- **OLD Database (Development)**: `dating.flel6.mongodb.net`
- **NEW Database (Production)**: `hetasinglar.ca0z4d.mongodb.net`

## Next Steps

1. Deploy to AWS using the deployment script
2. Test the deployment with the verification checklist
3. Confirm your NEW data is showing in the live application

## Troubleshooting

If you still see old data:
1. Check AWS server logs for database connection info
2. Run the test script on AWS: `NODE_ENV=production node test-database-connection.js`
3. Verify `.env.production` file exists on AWS server
4. Ensure AWS has `NODE_ENV=production` environment variable set