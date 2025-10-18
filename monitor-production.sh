#!/bin/bash

echo "📊 Real-time Production Monitoring"
echo "=================================="

while true; do
    clear
    echo "🕒 $(date)"
    echo ""
    
    # Service status
    echo "🔧 Service Status:"
    sudo systemctl is-active hetasinglar-backend 2>/dev/null || echo "inactive"
    echo ""
    
    # Process info
    echo "📊 Process Info:"
    ps aux | grep "node.*server.js" | grep -v grep || echo "No node processes found"
    echo ""
    
    # Memory usage
    echo "💾 Memory Usage:"
    free -h | grep Mem
    echo ""
    
    # API Health
    echo "🌐 API Health:"
    curl -s -m 3 http://localhost:5000/api/health 2>/dev/null | jq -r '.services.database // "No response"' 2>/dev/null || echo "API not responding"
    echo ""
    
    # Recent logs (last 3 lines)
    echo "📜 Recent Logs:"
    sudo journalctl -u hetasinglar-backend -n 3 --no-pager 2>/dev/null | tail -3 || echo "No logs available"
    echo ""
    
    echo "Press Ctrl+C to exit monitoring..."
    sleep 5
done