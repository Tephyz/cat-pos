const { createServer } = require('http');
const { Server } = require('socket.io');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, onSnapshot, doc, updateDoc, increment, getDoc, query, where, getDocs } = require('firebase/firestore');
const next = require('next');

// Firebase configuration (same as in your app)
const firebaseConfig = {
  apiKey: "AIzaSyD1SCRVJioiZEMNNY5xCAazhtOu2YPXh-k",
  authDomain: "coffeeteaconnection.firebaseapp.com",
  projectId: "coffeeteaconnection",
  storageBucket: "coffeeteaconnection.firebasestorage.app",
  messagingSenderId: "444013177678",
  appId: "1:444013177678:web:da33349973f8a2b85b8c1f",
  measurementId: "G-XTC62L3EFD"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const httpServer = createServer((req, res) => {
  handle(req, res);
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected clients and their inventory subscriptions
const connectedClients = new Map();

// Helper function to broadcast inventory updates
const broadcastInventoryUpdate = (updateData) => {
  io.emit('inventory-update', updateData);
};

// Helper function to broadcast low stock alerts
const broadcastLowStockAlert = (alertData) => {
  io.emit('low-stock-alert', alertData);
};

// Listen for real-time inventory changes from Firebase
const setupInventoryListener = () => {
  console.log('Setting up inventory listener...');
  
  const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const docData = change.doc.data();
      const inventoryItem = {
        id: change.doc.id,
        ...docData,
        timestamp: new Date().toISOString()
      };

      // Check for low stock
      const currentStock = docData.quantity || 0;
      const reorderLevel = docData.reorderLevel || 0;
      const isLowStock = currentStock <= reorderLevel;

      if (change.type === 'modified') {
        console.log(`Inventory updated: ${docData.name} - New stock: ${currentStock}`);
        
        // Broadcast the update to all connected clients
        broadcastInventoryUpdate({
          type: 'inventory-changed',
          item: inventoryItem,
          changeType: 'modified'
        });

        // Check if this is a low stock situation
        if (isLowStock && currentStock > 0) {
          broadcastLowStockAlert({
            type: 'low-stock',
            item: inventoryItem,
            message: `⚠️ Low stock alert: ${docData.name} (${currentStock} ${docData.unit || 'units'} remaining)`,
            severity: currentStock === 0 ? 'critical' : 'warning'
          });
        }
      } else if (change.type === 'added') {
        console.log(`New inventory item: ${docData.name}`);
        broadcastInventoryUpdate({
          type: 'inventory-added',
          item: inventoryItem,
          changeType: 'added'
        });
      } else if (change.type === 'removed') {
        console.log(`Inventory item removed: ${docData.name}`);
        broadcastInventoryUpdate({
          type: 'inventory-removed',
          item: inventoryItem,
          changeType: 'removed'
        });
      }
    });
  }, (error) => {
    console.error('Inventory listener error:', error);
  });

  return unsubscribe;
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Store client info
  connectedClients.set(socket.id, {
    connectedAt: new Date(),
    subscriptions: []
  });

  // Send current inventory data to newly connected client
  const sendCurrentInventory = async () => {
    try {
      const inventorySnapshot = await getDocs(collection(db, "inventory"));
      const inventoryData = [];
      
      inventorySnapshot.forEach((doc) => {
        inventoryData.push({
          id: doc.id,
          ...doc.data()
        });
      });

      socket.emit('initial-inventory', {
        type: 'initial-data',
        data: inventoryData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending initial inventory:', error);
      socket.emit('error', { message: 'Failed to load inventory data' });
    }
  };

  // Send initial data
  sendCurrentInventory();

  // Handle client requests for specific inventory updates
  socket.on('subscribe-inventory', (data) => {
    console.log(`Client ${socket.id} subscribed to inventory updates`);
    const clientInfo = connectedClients.get(socket.id);
    if (clientInfo) {
      clientInfo.subscriptions.push('inventory');
    }
  });

  // Handle manual inventory update requests
  socket.on('manual-inventory-update', async (data) => {
    try {
      const { itemId, quantity, operation } = data;
      const itemRef = doc(db, "inventory", itemId);
      
      const updateData = operation === 'add' 
        ? { quantity: increment(quantity) }
        : { quantity: increment(-quantity) };

      await updateDoc(itemRef, updateData);
      
      // Get updated item data
      const updatedDoc = await getDoc(itemRef);
      const updatedItem = {
        id: itemId,
        ...updatedDoc.data(),
        timestamp: new Date().toISOString()
      };

      // Broadcast the update
      broadcastInventoryUpdate({
        type: 'manual-update',
        item: updatedItem,
        operation: operation,
        changeType: 'modified'
      });

      socket.emit('update-success', { message: 'Inventory updated successfully' });
    } catch (error) {
      console.error('Manual inventory update error:', error);
      socket.emit('update-error', { message: 'Failed to update inventory' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Setup inventory listener
const inventoryUnsubscribe = setupInventoryListener();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  if (inventoryUnsubscribe) {
    inventoryUnsubscribe();
  }
  httpServer.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});

const PORT = process.env.SOCKET_PORT || 3002;

app.prepare().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Socket.IO server running on port ${PORT}`);
    console.log(`📦 Real-time inventory updates enabled`);
    console.log(`🔗 WebSocket endpoint: ws://localhost:${PORT}`);
  });
}).catch((ex) => {
  console.error('Error starting server:', ex);
  process.exit(1);
});
