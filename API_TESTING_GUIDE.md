# API Endpoint Testing Documentation

## 🧪 Testing Your Production API: `https://api-hetasinglar.onrender.com/`

This document explains how to test all API endpoints of your HetaSinglar backend.

## 📋 Available Testing Commands

### Quick Endpoint Scan
```powershell
npm run test-endpoints
```
**What it does:**
- Scans all API endpoints without authentication
- Shows which endpoints are accessible publicly
- Identifies endpoints that require authentication
- Displays response times and status codes
- Perfect for quick API health verification

**Example Output:**
```
✅ GET  /api/health                   200 OK              145ms
✅ GET  /api/status                   200 OK              98ms
🔐 GET  /api/admin/dashboard          401 AUTH REQUIRED   234ms
🔐 GET  /api/agents                   401 AUTH REQUIRED   187ms
❌ GET  /api/nonexistent              404 ERROR           156ms
```

### Comprehensive Testing
```powershell
npm run test-endpoints-full
```
**What it does:**
- Tests all endpoints with authentication attempts
- Performs POST/PUT/DELETE operations where applicable
- Provides detailed error analysis
- Tests data validation and error handling
- Requires valid credentials in the script

**Before running:** Update the credentials in `test-all-endpoints.js`:
```javascript
const TEST_CREDENTIALS = {
  admin: {
    username: 'your-admin-username',
    password: 'your-admin-password'
  },
  agent: {
    username: 'your-agent-username',
    password: 'your-agent-password'
  }
};
```

## 📊 Understanding Test Results

### Status Icons
- ✅ **Green Check**: Endpoint working perfectly
- 🔐 **Lock**: Authentication required (normal for protected endpoints)
- ⚠️ **Warning**: Client error (4xx) - might need different parameters
- ❌ **Red X**: Server error (5xx) or connection failure
- 🟡 **Yellow**: Timeout or slow response

### HTTP Status Codes
- **200-299**: Success ✅
- **401**: Authentication required 🔐
- **403**: Forbidden (insufficient permissions) 🔐
- **404**: Endpoint not found ⚠️
- **500+**: Server error ❌

## 🎯 Tested Endpoint Categories

### 1. Health & Status (Public)
- `GET /api/health` - Server health information
- `GET /api/status` - Basic server status

### 2. Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/verify` - Token verification

### 3. Admin Panel (Protected)
- `GET /api/admin/dashboard` - Admin dashboard data
- `GET /api/admin/users` - User management
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/settings` - System settings

### 4. Agent Management (Protected)
- `GET /api/agents` - List all agents
- `GET /api/agents/profile` - Agent profile
- `GET /api/agents/earnings` - Agent earnings
- `GET /api/agents/stats` - Agent statistics

### 5. Chat System (Protected)
- `GET /api/chats` - Chat list
- `GET /api/chats/active` - Active chats
- `GET /api/chats/queue` - Chat queue
- `GET /api/chats/history` - Chat history

### 6. Subscriptions
- `GET /api/subscription/packages` - Available packages
- `GET /api/subscription/stats` - Subscription statistics
- `POST /api/subscription/purchase` - Purchase subscription

### 7. Commission System (Protected)
- `GET /api/commission/settings` - Commission settings
- `GET /api/commission/rates` - Commission rates
- `GET /api/commission/earnings` - Commission earnings

### 8. User Assignment (Protected)
- `GET /api/user-assignment/queue` - Assignment queue
- `GET /api/user-assignment/stats` - Assignment statistics

### 9. Affiliate Program (Protected)
- `GET /api/affiliate/stats` - Affiliate statistics
- `GET /api/affiliate/referrals` - Referral data
- `GET /api/affiliate/earnings` - Affiliate earnings

### 10. System Logs (Protected)
- `GET /api/logs` - System logs
- `GET /api/logs/recent` - Recent logs

### 11. First Contact (Protected)
- `GET /api/first-contact/stats` - First contact statistics

## 🔧 Troubleshooting Test Results

### Common Issues and Solutions

#### 🔴 Connection Failures
**Problem:** Cannot reach the API
**Solutions:**
1. Check if your production server is running: `npm run check-production`
2. Verify the URL is correct: `https://api-hetasinglar.onrender.com`
3. Check if Render service is sleeping (free tier)
4. Verify DNS resolution

#### 🟡 Timeouts
**Problem:** Requests taking too long (>15 seconds)
**Causes:**
- Cold start (Render free tier waking up)
- High server load
- Database connection issues
**Solutions:**
- Wait and retry in 30-60 seconds
- Use `npm run monitor-production` to keep service awake

#### 🔐 Authentication Errors
**Problem:** Many 401/403 errors
**This is normal!** Most endpoints require authentication.
**To test protected endpoints:**
1. Get valid admin/agent credentials
2. Update `TEST_CREDENTIALS` in `test-all-endpoints.js`
3. Run `npm run test-endpoints-full`

#### ⚠️ 404 Errors
**Problem:** Endpoint not found
**Possible causes:**
- Endpoint path changed
- Route not implemented
- API version mismatch
**Check:** Server logs for missing routes

#### ❌ 500 Errors
**Problem:** Server errors
**Causes:**
- Database connection issues
- Application bugs
- Missing environment variables
**Check:** 
1. Render deployment logs
2. Database connectivity
3. Environment variables

## 📈 Performance Benchmarks

### Expected Response Times
- **Health endpoints**: < 200ms
- **Database queries**: < 500ms
- **Complex operations**: < 1000ms
- **Cold start**: 5-30 seconds (first request after sleep)

### Performance Tips
1. Keep production service awake with monitoring
2. Use CDN for static assets
3. Optimize database queries
4. Consider upgrading to paid Render tier

## 🚀 Best Practices

### Regular Testing Schedule
1. **Daily**: Quick endpoint scan (`npm run test-endpoints`)
2. **Weekly**: Full authentication testing
3. **After deployments**: Comprehensive testing
4. **Before releases**: Full test suite

### Monitoring Integration
Combine endpoint testing with continuous monitoring:
```powershell
# Terminal 1: Continuous monitoring
npm run monitor-production

# Terminal 2: Periodic testing
npm run test-endpoints
```

### CI/CD Integration
Add to your deployment pipeline:
```yaml
# Example GitHub Actions step
- name: Test API Endpoints
  run: |
    cd backend/api-Hetasinglar
    npm run test-endpoints
```

## 📞 Support

If you encounter issues:
1. Check the test output for specific error messages
2. Review Render dashboard logs
3. Verify environment variables
4. Check database connectivity
5. Monitor response times with continuous monitoring

The testing suite will help you maintain API reliability and quickly identify issues! 🎉
