const { createServer } = require('http');
const { Server } = require('socket.io');

// Create HTTP server
const httpServer = createServer();

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected clients
const connectedClients = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`👤 Client connected: ${socket.id}`);
  
  // Store client info
  connectedClients.set(socket.id, {
    connectedAt: new Date(),
    subscriptions: []
  });

  // Send complete inventory data with ALL ingredients from recipes
  socket.emit('initial-inventory', {
    type: 'initial-data',
    data: [
      // Base ingredients for all recipes
      { id: '1', name: 'Coffee', quantity: 5000, unit: 'ml', reorderLevel: 1000 },
      { id: '2', name: 'Assam Black Tea', quantity: 3000, unit: 'ml', reorderLevel: 500 },
      { id: '3', name: 'Creamer', quantity: 2000, unit: 'ml', reorderLevel: 300 },
      { id: '4', name: 'Fructose', quantity: 1500, unit: 'ml', reorderLevel: 200 },
      
      // Milk Tea powders
      { id: '5', name: 'Okinawa Powder', quantity: 500, unit: 'g', reorderLevel: 100 },
      { id: '6', name: 'Dark Choco Powder', quantity: 400, unit: 'g', reorderLevel: 80 },
      { id: '7', name: 'Strawberry Powder', quantity: 350, unit: 'g', reorderLevel: 70 },
      { id: '8', name: 'Cappuccino Powder', quantity: 300, unit: 'g', reorderLevel: 60 },
      { id: '9', name: 'Wintermelon', quantity: 800, unit: 'ml', reorderLevel: 150 },
      { id: '10', name: 'Vanilla Powder', quantity: 250, unit: 'g', reorderLevel: 50 },
      
      // Frappe ingredients
      { id: '11', name: 'Dark Chocolate Powder', quantity: 400, unit: 'g', reorderLevel: 80 },
      { id: '12', name: 'Caramel Syrup', quantity: 600, unit: 'ml', reorderLevel: 100 },
      { id: '13', name: 'Chocolate Syrup', quantity: 450, unit: 'ml', reorderLevel: 80 },
      { id: '14', name: 'Chocolate Chip', quantity: 200, unit: 'pcs', reorderLevel: 40 },
      { id: '15', name: 'Water', quantity: 5000, unit: 'ml', reorderLevel: 1000 },
      
      // Yakult Mix ingredients
      { id: '16', name: 'Cold Water', quantity: 5000, unit: 'ml', reorderLevel: 1000 },
      { id: '17', name: 'Syrup', quantity: 1200, unit: 'ml', reorderLevel: 200 },
      { id: '18', name: 'Yakult', quantity: 100, unit: 'bottles', reorderLevel: 20 },
      
      // Fruit Tea ingredients
      { id: '19', name: 'Jasmine Green Tea', quantity: 2500, unit: 'ml', reorderLevel: 400 },
      
      // Add-ons - Mixed stock levels to simulate real inventory
      { id: '20', name: 'Pearl', quantity: 10000, unit: 'g', reorderLevel: 1000 },      // Available
      { id: '21', name: 'Nata', quantity: 8000, unit: 'g', reorderLevel: 800 },         // Available  
      { id: '22', name: 'Espresso', quantity: 0, unit: 'ml', reorderLevel: 500 },        // NOT AVAILABLE (0 stock)
      { id: '23', name: 'Coffee Jelly', quantity: 6000, unit: 'g', reorderLevel: 600 },  // Available
      { id: '24', name: 'Oreo', quantity: 0, unit: 'pcs', reorderLevel: 100 },          // NOT AVAILABLE (0 stock)
      { id: '25', name: 'Caramel', quantity: 4000, unit: 'ml', reorderLevel: 400 },     // Available
      { id: '26', name: 'Whip Cream', quantity: 0, unit: 'ml', reorderLevel: 300 }      // NOT AVAILABLE (0 stock)
    ],
    timestamp: new Date().toISOString()
  });
  
  console.log(`📤 Sent test inventory data to ${socket.id}`);

  // Handle client requests for inventory updates
  socket.on('subscribe-inventory', () => {
    console.log(`📡 Client ${socket.id} subscribed to inventory updates`);
    const clientInfo = connectedClients.get(socket.id);
    if (clientInfo) {
      clientInfo.subscriptions.push('inventory');
    }
  });

  // Handle manual inventory update requests (for testing)
  socket.on('manual-inventory-update', (data) => {
    console.log(`🔧 Manual inventory update request:`, data);
    
    // Simulate an update
    const updatedItem = {
      id: data.itemId,
      name: 'Test Item Updated',
      quantity: 999,
      unit: 'units',
      reorderLevel: 50,
      timestamp: new Date().toISOString()
    };

    // Broadcast the update
    io.emit('inventory-update', {
      type: 'manual-update',
      item: updatedItem,
      operation: data.operation,
      changeType: 'modified'
    });

    socket.emit('update-success', { message: 'Inventory updated successfully' });
  });

  // Test low stock alerts
  socket.on('test-low-stock', () => {
    console.log(`🧪 Testing low stock alert for ${socket.id}`);
    
    const alertData = {
      type: 'low-stock',
      item: {
        id: '1',
        name: 'Test Low Stock Item',
        quantity: 5,
        unit: 'units',
        reorderLevel: 20,
        timestamp: new Date().toISOString()
      },
      message: '⚠️ Low stock alert: Test Low Stock Item (5 units remaining)',
      severity: 'warning'
    };

    socket.emit('low-stock-alert', alertData);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`👋 Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// Simulate periodic inventory updates for testing
const ingredients = ['Coffee', 'Assam Black Tea', 'Creamer', 'Fructose', 'Pearl', 'Espresso', 'Oreo', 'Whip Cream'];
let ingredientIndex = 0;

setInterval(() => {
  if (connectedClients.size > 0) {
    const ingredientName = ingredients[ingredientIndex % ingredients.length];
    const testUpdate = {
      type: 'inventory-changed',
      item: {
        id: 'test-' + Date.now(),
        name: ingredientName,
        quantity: Math.floor(Math.random() * 1000) + 100,
        unit: ingredientName === 'Pearl' || ingredientName === 'Nata' ? 'g' : 'ml',
        reorderLevel: 50,
        timestamp: new Date().toISOString()
      },
      changeType: 'modified'
    };
    
    io.emit('inventory-update', testUpdate);
    console.log(`🔄 Sent automatic test update for ${ingredientName} to ${connectedClients.size} clients`);
    ingredientIndex++;
  }
}, 10000); // Every 10 seconds

const PORT = process.env.SOCKET_PORT || 3002;

httpServer.listen(PORT, () => {
  console.log(`🚀 Test Socket.IO server running on port ${PORT}`);
  console.log(`📦 Test inventory updates enabled`);
  console.log(`🔗 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🌐 CORS enabled for all origins`);
  console.log(`🧪 Test mode - No Firebase dependencies`);
  console.log(`📊 Connected clients: ${connectedClients.size}`);
});

// Log server status every 30 seconds
setInterval(() => {
  console.log(`📊 Server status: ${connectedClients.size} clients connected`);
}, 30000);
