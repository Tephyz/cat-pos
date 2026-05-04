# Real-time WebSocket Inventory Updates

This setup adds real-time WebSocket functionality to your POS system for instant inventory updates across multiple clients.

## Features Added

- **Real-time Inventory Updates**: Instant notifications when inventory items are added, modified, or removed
- **Low Stock Alerts**: Automatic warnings when items reach reorder levels
- **Connection Status Indicator**: Visual indicator showing real-time connection status
- **Fallback System**: Automatically falls back to Firebase listeners if WebSocket is unavailable
- **Multi-client Support**: Multiple dashboard instances receive updates simultaneously

## Setup Instructions

### 1. Start the Development Servers

Run both the Next.js app and WebSocket server simultaneously:

```bash
npm run dev:full
```

Or run them separately in different terminals:

```bash
# Terminal 1 - Next.js app
npm run dev

# Terminal 2 - WebSocket server
npm run dev:socket
```

### 2. Environment Variables (Optional)

Create a `.env.local` file in the root directory to customize the WebSocket URL:

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

Default: `http://localhost:3001`

### 3. Testing Real-time Updates

1. **Open Multiple Browser Tabs**: Open `http://localhost:3000/dashboard` in 2+ browser tabs
2. **Make Inventory Changes**: Use your existing inventory management system to add/remove/modify items
3. **Observe Real-time Updates**: All open tabs should receive instant notifications
4. **Check Connection Status**: Look for the green "Real-time Active" indicator in the bottom-left

## What You'll See

### Real-time Notifications
- **Blue notifications**: Regular inventory updates (added/modified/removed)
- **Yellow notifications**: Low stock warnings
- **Red notifications**: Critical stock levels (out of stock)

### Connection Status
- **Green dot**: WebSocket connected and active
- **Gray dot**: WebSocket offline (using Firebase fallback)

## File Structure

```
├── server/
│   └── socket-server.js      # WebSocket server
├── src/lib/
│   └── socket-client.ts      # WebSocket client utilities
└── src/app/dashboard/
    └── page.tsx             # Updated with real-time features
```

## How It Works

1. **WebSocket Server** (`server/socket-server.js`):
   - Listens to Firebase inventory changes
   - Broadcasts updates to all connected clients
   - Handles low stock alerts
   - Runs on port 3001 by default

2. **Client Integration** (`src/lib/socket-client.ts`):
   - Manages WebSocket connection
   - Handles reconnection logic
   - Provides TypeScript interfaces
   - Fallback to Firebase if needed

3. **Dashboard Updates** (`src/app/dashboard/page.tsx`):
   - Real-time notifications display
   - Connection status indicator
   - Seamless integration with existing inventory system

## Troubleshooting

### WebSocket Not Connecting
- Ensure the WebSocket server is running (`npm run dev:socket`)
- Check that port 3001 is available
- Verify Firebase configuration in `server/socket-server.js`

### No Real-time Updates
- Check the connection status indicator
- Verify Firebase Firestore rules allow inventory collection access
- Check browser console for WebSocket errors

### Performance Issues
- The system includes automatic fallback to Firebase listeners
- WebSocket connections are automatically managed with reconnection logic
- Notifications auto-dismiss after 5-10 seconds

## Production Deployment

For production deployment:

1. **Deploy WebSocket Server**: Deploy `server/socket-server.js` to a Node.js hosting service
2. **Update Environment Variable**: Set `NEXT_PUBLIC_SOCKET_URL` to your production WebSocket server URL
3. **Configure CORS**: Update CORS settings in the WebSocket server for your production domain
4. **Scale Considerations**: Consider using Redis for multi-server WebSocket scaling

## Benefits Over Firebase-only

- **Faster Updates**: WebSocket push vs Firebase pull
- **Lower Latency**: Direct server-to-client communication
- **Better UX**: Instant notifications without polling delays
- **Reduced Costs**: Fewer Firebase read operations
- **Reliable Fallback**: Still works if WebSocket fails
