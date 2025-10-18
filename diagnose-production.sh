#!/bin/bash

echo "🔍 HetaSinglar Production Server Diagnostic Script"
echo "================================================"

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Not in server directory. Looking for server files..."
    find /home -name "server.js" -type f 2>/dev/null | head -5
    echo ""
    echo "Please run this script from the server directory (where server.js is located)"
    exit 1
fi

echo "✅ Found server.js in current directory"
echo ""

# 1. Check Node.js processes
echo "1. 📊 Checking Node.js processes:"
ps aux | grep node | grep -v grep
echo ""

# 2. Check system services
echo "2. 🔧 Checking systemd services:"
sudo systemctl status hetasinglar-backend --no-pager -l || echo "Service not found or not running"
echo ""

# 3. Check environment files
echo "3. 📁 Environment configuration:"
if [ -f ".env.production" ]; then
    echo "✅ .env.production exists"
    echo "Environment variables (sensitive data masked):"
    cat .env.production | sed 's/\(.*=\)\(.*\)/\1***MASKED***/' | head -10
else
    echo "❌ .env.production not found!"
    echo "Available env files:"
    ls -la .env* 2>/dev/null || echo "No env files found"
fi
echo ""

# 4. Test MongoDB connection
echo "4. 🍃 Testing MongoDB connection:"
node -e "
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' 
    ? path.join(__dirname, '.env.production')
    : path.join(__dirname, '.env')
});

console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('MongoDB URI available:', process.env.MONGODB_URI ? 'YES' : 'NO');

if (!process.env.MONGODB_URI) {
  console.log('❌ MONGODB_URI not set');
  process.exit(1);
}

console.log('Attempting connection...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000
}).then(() => {
  console.log('✅ MongoDB connection successful');
  return mongoose.connection.db.admin().ping();
}).then(() => {
  console.log('✅ MongoDB ping successful');
  process.exit(0);
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  if (err.message.includes('Authentication failed')) {
    console.error('💡 Check MongoDB Atlas credentials and database name');
  } else if (err.message.includes('ENOTFOUND')) {
    console.error('💡 Check MongoDB Atlas cluster URL and network access');
  }
  process.exit(1);
});
" 2>/dev/null
echo ""

# 5. Check server logs
echo "5. 📜 Recent server logs:"
if [ -f "server.log" ]; then
    echo "From server.log:"
    tail -20 server.log
elif command -v journalctl >/dev/null; then
    echo "From systemd journal:"
    sudo journalctl -u hetasinglar-backend -n 10 --no-pager 2>/dev/null || echo "No systemd logs found"
else
    echo "No logs found"
fi
echo ""

# 6. Check network connectivity
echo "6. 🌐 Network connectivity tests:"
echo "Testing external connectivity:"
curl -s -m 5 https://www.google.com >/dev/null && echo "✅ Internet connectivity OK" || echo "❌ Internet connectivity failed"

echo "Testing MongoDB Atlas connectivity:"
nslookup hetasinglar.ca0z4d.mongodb.net >/dev/null 2>&1 && echo "✅ DNS resolution OK" || echo "❌ DNS resolution failed"

echo ""

# 7. Check disk space
echo "7. 💾 Disk space:"
df -h . | tail -1
echo ""

# 8. Check port usage
echo "8. 🔌 Port status:"
netstat -tlnp | grep :5000 || echo "Port 5000 not in use"
echo ""

echo "🏁 Diagnostic complete!"
echo ""
echo "Next steps based on results:"
echo "- If MongoDB connection failed: Update .env.production with correct credentials"
echo "- If service not running: Run the fix script to restart services"
echo "- If port conflicts: Kill conflicting processes"