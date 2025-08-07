# HetaSinglar Backend API Health & Alert System

## 🚀 Server Startup with Alerts

The backend now includes comprehensive health monitoring and alert system that will show you when the server is running and provide API health status for both **local development** and **production** environments.

### 🌐 Your Production API: `https://api-hetasinglar.onrender.com/`

## 📋 Available Commands

### Production Monitoring Commands
```powershell
# Quick production status check
npm run check-production

# Continuous production monitoring
npm run monitor-production

# Production startup check (shows status only)
npm run start-production-check

# Test all API endpoints (basic scan)
npm run test-endpoints

# Full endpoint testing with authentication
npm run test-endpoints-full
```

### Local Development Commands
```powershell
# Start local server with alerts
npm run start-with-alerts

# Monitor local server health
npm run monitor

# Regular local server start
npm start

# Development mode with auto-restart
npm run dev
```

## 🏥 Health Check Endpoints

### Production API Health Check
```
GET https://api-hetasinglar.onrender.com/api/health
```

### Local API Health Check
```
GET http://localhost:5000/api/health
```
Returns detailed server health information including:
- Server status and uptime
- Memory usage
- Database connection status
- WebSocket client count
- Service status

### Production API Status
```
GET https://api-hetasinglar.onrender.com/api/status
```

### Local API Status
```
GET http://localhost:5000/api/status
```
Returns basic server information and available endpoints

## 🚨 Alert Features

### Startup Alerts
When you start the server, you'll see:
```
🚀 HETASINGLAR BACKEND SERVER STARTED
============================================================
📍 Server URL: http://localhost:5000
⏰ Started at: 2025-08-07T...
🌐 Environment: development
🔗 Health Check: http://localhost:5000/api/health
📊 Status Check: http://localhost:5000/api/status
============================================================
🟢 API READY - All endpoints are available
🔄 WebSocket server is running
✅ Backend is fully operational
```

### Health Status Alerts (Every 30 minutes)
```
🏥 SERVER HEALTH STATUS ALERT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Time: 2025-08-07T...
⏱️  Uptime: 2h 15m
🔗 Active WebSocket connections: 5
💾 Memory usage: 45MB
🗄️  Database: ✅ Connected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 API STATUS: HEALTHY & OPERATIONAL
```

### Error Alerts
```
🚨 SERVER ERROR ALERT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Time: 2025-08-07T...
🔍 Endpoint: GET /api/some-endpoint
❌ Error: Error message here
📍 Stack: Stack trace...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Server encountered an error but remains operational
```

### Shutdown Alerts
```
🛑 SHUTDOWN ALERT - SIGINT received
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Shutdown initiated at: 2025-08-07T...
🔄 Stopping reminder service...
✅ Reminder service stopped
🔌 Closing WebSocket connections...
✅ WebSocket server closed
💾 Closing database connections...
✅ Database connections closed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👋 HetaSinglar Backend Server shutdown complete
```

## 🔍 Monitoring Features

The health monitor will show:
- **🟢 HEALTHY** - Server is running and responding normally
- **🔴 OFFLINE** - Server is not running
- **🟡 TIMEOUT** - Server is running but responding slowly
- **🟠 ERROR** - Server has encountered an issue

## 💡 Usage Tips

### For Production Monitoring:
1. **Quick Status Check**: Use `npm run check-production` to get instant production API status
2. **Continuous Monitoring**: Use `npm run monitor-production` to watch production health in real-time
3. **Direct Browser Check**: Visit `https://api-hetasinglar.onrender.com/api/health` in your browser

### For Local Development:
1. **Daily Development**: Use `npm run start-with-alerts` to get clear feedback about server status
2. **Continuous Monitoring**: Use `npm run monitor` in a separate terminal to watch server health
3. **Production**: The regular `npm start` now includes enhanced logging for better visibility
4. **Debugging**: Check the health endpoint directly in your browser: `http://localhost:5000/api/health`

### Production Specific Tips:
- **Free Tier Services**: Render free tier services sleep after 15 minutes of inactivity
- **Cold Starts**: First request after sleep may take 30+ seconds to respond
- **Monitoring**: Use continuous monitoring to keep your service awake
- **Troubleshooting**: Check Render dashboard at https://dashboard.render.com for deployment issues

## 🛠️ Troubleshooting

### Local Development Issues:
If you see alerts about the local server being offline:
1. Make sure you're in the correct directory: `f:\vercal\Hetasinglar\backend\api-Hetasinglar`
2. Install dependencies: `npm install`
3. Check if MongoDB is accessible
4. Verify port 5000 is not in use by another application

### Production Issues:
If production API shows as offline:
1. **Service Sleeping**: Free tier services sleep after 15 minutes
   - Use `npm run monitor-production` to wake it up
   - Consider upgrading to paid tier for always-on service
2. **Deployment Failed**: Check Render dashboard for build/deploy errors
3. **Environment Variables**: Verify all required environment variables are set
4. **Database Issues**: Check MongoDB Atlas connection and IP whitelist
5. **DNS/Network**: Try accessing the URL directly in a browser

### Common Production Error Messages:
- **🔴 OFFLINE**: Service is sleeping or crashed - check Render dashboard
- **🟡 TIMEOUT**: Service is starting up - wait 30-60 seconds and try again  
- **🟠 HTTP ERROR**: Check specific HTTP status code for details

The alert system will help you quickly identify and resolve any backend issues!
