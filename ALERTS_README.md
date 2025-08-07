# HetaSinglar Backend API Health & Alert System

## 🚀 Server Startup with Alerts

The backend now includes comprehensive health monitoring and alert system that will show you when the server is running and provide API health status.

## 📋 Available Commands

### Start Server with Alerts
```powershell
npm run start-with-alerts
```
This command will:
- Check if server is already running
- Start the server with enhanced logging
- Show detailed startup progress
- Display health status once ready
- Provide helpful command suggestions

### Monitor Server Health
```powershell
npm run monitor
```
This command will:
- Continuously monitor server health every 10 seconds
- Show real-time status updates
- Display response times, uptime, memory usage
- Alert you if server goes offline
- Press Ctrl+C to stop monitoring

### Regular Server Start
```powershell
npm start
```
Standard server startup with enhanced console alerts

### Development Mode
```powershell
npm run dev
```
Start server with auto-restart on file changes

## 🏥 Health Check Endpoints

### API Health Check
```
GET http://localhost:5000/api/health
```
Returns detailed server health information including:
- Server status and uptime
- Memory usage
- Database connection status
- WebSocket client count
- Service status

### Server Status
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

1. **Daily Development**: Use `npm run start-with-alerts` to get clear feedback about server status
2. **Continuous Monitoring**: Use `npm run monitor` in a separate terminal to watch server health
3. **Production**: The regular `npm start` now includes enhanced logging for better visibility
4. **Debugging**: Check the health endpoint directly in your browser: `http://localhost:5000/api/health`

## 🛠️ Troubleshooting

If you see alerts about the server being offline:
1. Make sure you're in the correct directory: `f:\vercal\Hetasinglar\backend\api-Hetasinglar`
2. Install dependencies: `npm install`
3. Check if MongoDB is accessible
4. Verify port 5000 is not in use by another application

The alert system will help you quickly identify and resolve any backend issues!
