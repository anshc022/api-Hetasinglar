# CORS Configuration & Testing

## Current Configuration

### Frontend URL
- **Production**: https://hetasinglar.vercel.app

### Backend URL  
- **Production**: https://apihetasinglar.duckdns.org

## Testing CORS

Run the CORS testing script to verify configuration:

```bash
# Test CORS configuration
npm run test-cors

# Or run directly
node test-cors.js
```

## CORS Test Results

The test script checks:
- ✅ Health endpoint accessibility
- ✅ Username checking functionality  
- ✅ Preflight OPTIONS requests
- ✅ CORS header validation
- ✅ Duplicate origin detection

## Common CORS Issues

### Issue: Multiple Origins Error
```
Access-Control-Allow-Origin header contains multiple values 'https://hetasinglar.vercel.app, *'
```

**Cause**: Nginx proxy adding wildcard CORS headers in addition to Express CORS headers.

**Solution**: Disabled Express CORS middleware, using manual CORS configuration to prevent conflicts.

### Configuration Changes
1. **Disabled default CORS middleware** in server.js
2. **Added manual CORS handling** for precise control
3. **Single origin policy** - only allows `https://hetasinglar.vercel.app`
4. **Handles preflight OPTIONS** requests globally

## Deployment Notes

The backend is deployed on EC2 with Docker and likely has nginx as a reverse proxy which may add additional CORS headers. The manual CORS configuration prevents conflicts.

## Links for Reference

- Frontend: https://hetasinglar.vercel.app/
- Backend API: https://apihetasinglar.duckdns.org
- Health Check: https://apihetasinglar.duckdns.org/api/health
- CORS Test: https://apihetasinglar.duckdns.org/api/cors-test
