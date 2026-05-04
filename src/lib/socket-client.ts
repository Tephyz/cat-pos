import { io, Socket } from 'socket.io-client';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  timestamp?: string;
}

export interface InventoryUpdate {
  type: 'inventory-changed' | 'inventory-added' | 'inventory-removed' | 'manual-update';
  item: InventoryItem;
  changeType: 'modified' | 'added' | 'removed';
  operation?: 'add' | 'subtract';
}

export interface LowStockAlert {
  type: 'low-stock';
  item: InventoryItem;
  message: string;
  severity: 'warning' | 'critical';
}

export interface SocketEvents {
  'initial-inventory': (data: { type: string; data: InventoryItem[]; timestamp: string }) => void;
  'inventory-update': (data: InventoryUpdate) => void;
  'low-stock-alert': (data: LowStockAlert) => void;
  'update-success': (data: { message: string }) => void;
  'update-error': (data: { message: string }) => void;
  'error': (data: { message: string }) => void;
  'subscribe-inventory': () => void;
  'manual-inventory-update': (data: { itemId: string; quantity: number; operation: 'add' | 'subtract' }) => void;
}

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;

  connect(): Promise<void> {
    // Return existing connection promise if already connecting
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Return resolved promise if already connected
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    // Create new connection promise
    this.connectionPromise = new Promise((resolve, reject) => {
      this.isConnecting = true;

      // Connect to the WebSocket server
      this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002', {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

      this.socket.on('connect', () => {
        console.log('🔗 Connected to WebSocket server');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.connectionPromise = null;
        resolve();
      });

      this.socket.on('connect_error', (error: any) => {
        console.error('❌ WebSocket connection error:', error);
        this.isConnecting = false;
        this.connectionPromise = null;
        reject(error);
      });

      this.socket.on('disconnect', (reason: any) => {
        console.log('🔌 Disconnected from WebSocket server:', reason);
        this.isConnecting = false;
        this.connectionPromise = null;
      });

      this.socket.on('reconnect', (attemptNumber: number) => {
        console.log(`🔄 Reconnected to WebSocket server after ${attemptNumber} attempts`);
        this.reconnectAttempts = 0;
      });

      this.socket.on('reconnect_error', (error: any) => {
        console.error('❌ WebSocket reconnection error:', error);
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('🚫 Max reconnection attempts reached');
        }
      });
    });

    return this.connectionPromise;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.connectionPromise = null;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Subscribe to inventory updates
  subscribeToInventory() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe-inventory');
    }
  }

  // Manual inventory update
  updateInventory(itemId: string, quantity: number, operation: 'add' | 'subtract') {
    if (this.socket && this.socket.connected) {
      this.socket.emit('manual-inventory-update', {
        itemId,
        quantity,
        operation
      });
    }
  }

  // Event listeners
  onInitialInventory(callback: (data: { type: string; data: InventoryItem[]; timestamp: string }) => void) {
    this.socket?.on('initial-inventory', callback);
  }

  onInventoryUpdate(callback: (data: InventoryUpdate) => void) {
    this.socket?.on('inventory-update', callback);
  }

  onLowStockAlert(callback: (data: LowStockAlert) => void) {
    this.socket?.on('low-stock-alert', callback);
  }

  onUpdateSuccess(callback: (data: { message: string }) => void) {
    this.socket?.on('update-success', callback);
  }

  onUpdateError(callback: (data: { message: string }) => void) {
    this.socket?.on('update-error', callback);
  }

  onError(callback: (data: { message: string }) => void) {
    this.socket?.on('error', callback);
  }

  // Remove event listeners
  offInitialInventory(callback: (data: { type: string; data: InventoryItem[]; timestamp: string }) => void) {
    this.socket?.off('initial-inventory', callback);
  }

  offInventoryUpdate(callback: (data: InventoryUpdate) => void) {
    this.socket?.off('inventory-update', callback);
  }

  offLowStockAlert(callback: (data: LowStockAlert) => void) {
    this.socket?.off('low-stock-alert', callback);
  }

  offUpdateSuccess(callback: (data: { message: string }) => void) {
    this.socket?.off('update-success', callback);
  }

  offUpdateError(callback: (data: { message: string }) => void) {
    this.socket?.off('update-error', callback);
  }

  offError(callback: (data: { message: string }) => void) {
    this.socket?.off('error', callback);
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Singleton instance
export const socketClient = new SocketClient();

// React hook for using the socket client
export function useSocketClient() {
  return socketClient;
}
