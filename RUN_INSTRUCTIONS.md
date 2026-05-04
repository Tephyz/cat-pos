# 🚀 How to Run Your POS System

## Quick Start (Recommended)

### Option 1: Run Everything Together
```bash
npm run dev:full
```
This starts both the Next.js app (port 3000) and WebSocket server (port 3002) simultaneously.

### Option 2: Run Separately (for debugging)

**Terminal 1 - Next.js App:**
```bash
npm run dev
```
Opens at: http://localhost:3000

**Terminal 2 - WebSocket Server:**
```bash
npm run dev:socket
```
Runs on: ws://localhost:3002

---

## 📋 What You Should See

### WebSocket Server Output:
```
🚀 Test Socket.IO server running on port 3002
📦 Test inventory updates enabled
🔗 WebSocket endpoint: ws://localhost:3002
🌐 CORS enabled for all origins
🧪 Test mode - No Firebase dependencies
📊 Connected clients: 0
```

### Next.js App Output:
```
▲ Next.js 16.1.6 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://192.168.x.x:3000
✓ Ready in 1288ms
```

---

## 🔧 Testing Real-time Features

1. **Open Dashboard**: Go to http://localhost:3000/dashboard
2. **Check Connection Status**: Look for green "Real-time Active" indicator (bottom-left)
3. **Open Multiple Tabs**: Open same URL in 2+ browser windows
4. **Watch for Notifications**: Blue test notifications should appear every 10 seconds

### Expected Notifications:
- 📦 "Test Item 1/2 updated" (every 10 seconds)
- 🔵 Blue notifications for inventory updates
- 🟡 Yellow notifications for low stock alerts

---

## 🛠️ Troubleshooting

### If WebSocket Not Connecting:
1. **Check WebSocket server is running** (see output above)
2. **Refresh browser** to retry connection
3. **Check console** for error messages
4. **Status should show**: "Real-time Active" (green) or "Real-time Offline" (gray)

### If Port Conflicts:
```bash
# Kill existing processes
netstat -ano | findstr :3002
taskkill /F /PID [PID_NUMBER]

# Or use different port:
SET SOCKET_PORT=3003
npm run dev:socket
```

### If Firebase Errors:
1. **Update Firestore rules** with the rules from FIREBASE_RULES_UPDATE.md
2. **Go to Firebase Console** → Firestore → Rules
3. **Paste updated rules** and Publish

---

## 🎯 Testing Order Creation

After updating Firebase rules:
1. **Login to your POS system**
2. **Try creating an order** - should work without permission errors
3. **Check inventory updates** - should show real-time notifications

---

## 📱 Mobile Testing

Access from mobile devices:
1. **Find your IP**: `ipconfig` (look for IPv4 Address)
2. **Use network URL**: http://[YOUR_IP]:3000/dashboard
3. **Same real-time features** work across devices

---

## 🔥 Production Setup

For production deployment:
1. **Use production Firebase rules**
2. **Deploy WebSocket server** to cloud hosting
3. **Update NEXT_PUBLIC_SOCKET_URL** environment variable
4. **Configure proper CORS** and security

---

## 📞 Need Help?

- **WebSocket issues**: Check server console output
- **Firebase permissions**: Update Firestore rules
- **Connection problems**: Refresh browser and check console
- **Port conflicts**: Kill existing processes or change ports
