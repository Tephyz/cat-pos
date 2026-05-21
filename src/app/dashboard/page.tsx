"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { collection, addDoc, serverTimestamp, runTransaction, doc, increment, query, where, getDocs, onSnapshot, DocumentReference, deleteDoc, updateDoc, setDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logSaleTransaction } from "@/utils/userActivityLogger";

// Utility function for generating IDs (tablet compatible)
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
};

// Sort helper function - More robust version
const sortAlphabetically = (arr: any[]) => {
  return [...arr].sort((a, b) => {
    // Convert both to strings and handle null/undefined
    const strA = String(a || '');
    const strB = String(b || '');
    return strA.localeCompare(strB, 'en', { sensitivity: 'base' });
  });
};

// Helper function to generate receipt HTML with complete order list
const getReceiptHTML = (transaction: {
  number: string;
  method: string;
  total: number;
  discountAmount: number;
  amountTendered: string;
  nonCashSenderName?: string;
  nonCashNumber?: string;
  items?: OrderItem[];
  subtotal?: number;
  discount?: {
    type: string;
    amount: number;
    percentage?: number;
  };
} | null) => {
  if (!transaction) return '';
  
  const now = new Date();
  const dateTime = now.toLocaleString();
  
  // Add-on price constant
  const ADD_ON_PRICE_VALUE = 30;
  
  const hasItems = transaction.items && transaction.items.length > 0;
  const subtotal = transaction.subtotal || (hasItems ? transaction.items!.reduce((sum, item) => {
    const addOnsTotal = (item.addOns || []).reduce((total) => total + ADD_ON_PRICE_VALUE, 0);
    return sum + (item.price + addOnsTotal) * item.quantity;
  }, 0) : transaction.total);
  const discountAmount = transaction.discountAmount || 0;
  const totalPaid = transaction.total;
  
  return `
    <div style="font-family: monospace; max-width: 350px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0 0 5px 0; font-size: 16px;">Coffee and Tea Connection</h2>
        <p style="margin: 0; font-size: 11px;">Est. 2016</p>
        <p style="margin: 5px 0 0 0; font-size: 10px;">${dateTime}</p>
      </div>
      <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
        <span>Transaction No:</span>
        <span>${transaction.number}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
        <span>Payment Method:</span>
        <span>${transaction.method}</span>
      </div>
      ${transaction.method === "Non Cash" && transaction.nonCashSenderName ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Customer Name:</span>
          <span>${transaction.nonCashSenderName}</span>
        </div>
      ` : ''}
      ${transaction.method === "Non Cash" && transaction.nonCashNumber ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Reference No:</span>
          <span>${transaction.nonCashNumber}</span>
        </div>
      ` : ''}
      <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
      <div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">ORDER SUMMARY:</div>
      
      ${hasItems ? transaction.items!.map(item => {
        const addOnsTotal = (item.addOns || []).reduce((total) => total + ADD_ON_PRICE_VALUE, 0);
        const itemBaseTotal = item.price * item.quantity;
        const itemAddOnsTotal = addOnsTotal * item.quantity;
        let itemTotal = itemBaseTotal + itemAddOnsTotal;
        
        // Check for individual item discount
        const hasItemDiscount = item.discountType && item.discountType !== "None";
        const discountedTotal = hasItemDiscount ? itemTotal * 0.8 : itemTotal;
        const itemDiscountAmount = hasItemDiscount ? itemTotal - discountedTotal : 0;
        
        // Build item details string
        let details = '';
        if (item.size) details += `${item.size} · `;
        if (item.temperature && item.temperature !== "Hot") details += `${item.temperature} · `;
        if (item.sugar && item.sugar !== "100%") details += `Sugar ${item.sugar}`;
        
        return `
          <div style="margin: 10px 0; border-bottom: 1px dotted #ddd; padding-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px;">
              <span>${item.quantity}x ${item.name}</span>
              ${hasItemDiscount ? `
                <div style="text-align: right;">
                  <span style="text-decoration: line-through; font-size: 10px; color: #999;">₱${itemTotal.toFixed(2)}</span>
                  <span style="color: #2d7a38; margin-left: 5px;">₱${discountedTotal.toFixed(2)}</span>
                </div>
              ` : `
                <span>₱${itemTotal.toFixed(2)}</span>
              `}
            </div>
            ${details ? `
              <div style="font-size: 10px; color: #666; margin-top: 2px;">
                ${details}
              </div>
            ` : ''}
            ${hasItemDiscount ? `
              <div style="font-size: 9px; color: #2d7a38; margin-top: 2px;">
                ${item.discountType} Discount (20% off) -₱${itemDiscountAmount.toFixed(2)}
              </div>
            ` : ''}
            <div style="margin-left: 15px; margin-top: 4px;">
              <div style="display: flex; justify-content: space-between; font-size: 10px; color: #555;">
                <span>  Base price (x${item.quantity}):</span>
                <span>₱${itemBaseTotal.toFixed(2)}</span>
              </div>
              ${item.addOns && item.addOns.length > 0 ? `
                <div style="margin-top: 3px;">
                  <div style="font-size: 10px; color: #2d7a38; font-weight: 500;">  Add-ons:</div>
                  ${item.addOns.map(addon => {
                    return `
                      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #2d7a38; margin-left: 10px;">
                        <span>    • ${addon}</span>
                        <span>₱${(ADD_ON_PRICE_VALUE * item.quantity).toFixed(2)}</span>
                      </div>
                    `;
                  }).join('')}
                  <div style="display: flex; justify-content: space-between; font-size: 10px; color: #2d7a38; font-weight: 500; margin-top: 2px;">
                    <span>  Add-ons total:</span>
                    <span>₱${itemAddOnsTotal.toFixed(2)}</span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('') : ''}
      
      <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
        <span>Subtotal:</span>
        <span>₱${subtotal.toFixed(2)}</span>
      </div>
      ${discountAmount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px; color: #c0392b;">
          <span>Discount (${transaction.discount?.type || 'Applied'}):</span>
          <span>- ₱${discountAmount.toFixed(2)}</span>
        </div>
      ` : ''}
      <div style="border-top: 1px double #000; margin: 10px 0;"></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-weight: bold; font-size: 14px;">
        <span>TOTAL PAID:</span>
        <span>₱${totalPaid.toFixed(2)}</span>
      </div>
      ${transaction.method === "Cash" && transaction.amountTendered ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Amount Received:</span>
          <span>₱${parseFloat(transaction.amountTendered).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Change:</span>
          <span>₱${(parseFloat(transaction.amountTendered) - totalPaid).toFixed(2)}</span>
        </div>
      ` : ''}
      <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
      <div style="text-align: center; margin-top: 20px; font-size: 10px;">
        <p>Thank you for your order!</p>
        <p>Please come again </p>
      </div>
    </div>
  `;
};

interface OrderItem {
  name: string;
  category: string;
  temperature: string;
  size: string;
  sugar: string;
  quantity: number;
  price: number;
  addOns?: string[];
  variant?: string;
  discountType?: "None" | "PWD" | "Senior";
  discountCustomerName?: string;
  discountCustomerID?: string;
}

interface Tab {
  id: string;
  name: string;
  orderItems: OrderItem[];
  bulkDiscount: "None" | "5%" | "10%";
  createdAt: Date;
}

// Distinct colors for categories (sorted)
const categoryColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }> = {
  Coffee: { bg: "#FFF0F5", hoverBg: "#FFE4EC", activeBg: "#C0392B", text: "#8B5E6E" },
  "Non Coffee": { bg: "#E8F4F8", hoverBg: "#D4EAF0", activeBg: "#2980B9", text: "#2C6E7A" },
  Milktea: { bg: "#FFF8E1", hoverBg: "#FFECB3", activeBg: "#F39C12", text: "#D68910" },
  "Yakult Mix": { bg: "#E8F5E9", hoverBg: "#C8E6C9", activeBg: "#43A047", text: "#2E7D32" },
  "Fruit Tea": { bg: "#FCE4EC", hoverBg: "#F8BBD0", activeBg: "#E91E63", text: "#AD1457" },
  "Hot Tea": { bg: "#EDE7F6", hoverBg: "#D1C4E9", activeBg: "#5E35B1", text: "#4527A0" },
  Frappe: { bg: "#FFFFFF", hoverBg: "#F0F0F0", activeBg: "#D0D0D0", text: "#000000" },
  "Food & Bites": { bg: "#EFEBE9", hoverBg: "#D7CCC8", activeBg: "#8D6E63", text: "#5D4037" },
};

// Per-subcategory colors for Frappe types
const frappeSubColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }> = {
  "Coffee Based": { bg: "#FFF9C4", hoverBg: "#FFF59D", activeBg: "#F57F17", text: "#E65100" },
  "Cream Based":  { bg: "#B2DFDB", hoverBg: "#80CBC4", activeBg: "#00796B", text: "#004D40" },
  "Tea Based":    { bg: "#D1C4E9", hoverBg: "#B39DDB", activeBg: "#4527A0", text: "#311B92" },
};

// ---------------------------------------------------------
// RECIPES & INVENTORY LOGIC
// ---------------------------------------------------------
type Recipes = Record<string, Record<string, Record<string, number>>>;

const RECIPES: Recipes = {
  // --- MILK TEAS --- 
  "Milktea - Okinawa": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Okinawa Powder": 15 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Okinawa Powder": 25 } 
  },
  "Milktea - Dark Choco": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Dark Choco Powder": 20 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Dark Choco Powder": 30 }
  },
  "Milktea - Strawberry": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Strawberry Powder": 20 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Strawberry Powder": 30 }
  },
  "Milktea - Capuccino": { 
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Cappuccino Powder": 20 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Cappuccino Powder": 30 }
  },
  "Milktea - Wintermelon": {
    "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Wintermelon": 30 },
    "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Wintermelon": 40 }
  },

  // --- FRAPPES ---
  "Mocha": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 30 }
  },
  "Dark Mocha": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20, "Dark Chocolate Powder": 10 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 30, "Dark Chocolate Powder": 15 }
  },
  "Caramel": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 10, "Caramel Syrup": 30 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20, "Caramel Syrup": 40 }
  },
  "Vanilla": {
    "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 20, "Water": 50 },
    "Large":  { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 30, "Water": 70 }
  },
  "Coffee Jelly": {
    "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 15 },
    "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20 }
  },
  "Chocolate Chip": {
    "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 15, "Chocolate Syrup": 40, "Chocolate Chip": 10, "Water": 50 },
    "Large":  { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 25, "Chocolate Syrup": 50, "Chocolate Chip": 15, "Water": 70 }
  },

  // --- YAKULT MIX ---
  "Yakult Mix - Strawberry": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Green Apple": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Blueberry": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Lychee": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Wintermelon": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },

  // --- FRUIT TEAS ---
  "Fruit Tea - Green Apple": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Blueberry": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Lychee": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Strawberry": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Wintermelon": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } }
};

// Serving sizes ng Add-Ons (sorted)
const ADD_ON_SERVING_SIZES: Record<string, number> = {
  Pearl: 50,
  Nata: 40,
  Espresso: 30,
  "Coffee Jelly": 40,
  Oreo: 1,
  Caramel: 20,
  "Whip Cream": 20
};

// Allowed Add-ons per Category (sorted)
const CATEGORY_ADD_ONS: Record<string, string[]> = {
  "Coffee": ["Caramel", "Coffee Jelly", "Espresso", "Whip Cream"],
  "Non Coffee": ["Caramel", "Coffee Jelly", "Nata", "Oreo", "Pearl", "Whip Cream"],
  "Milktea": ["Coffee Jelly", "Nata", "Oreo", "Pearl", "Whip Cream"],
  "Yakult Mix": ["Coffee Jelly", "Nata", "Pearl"],
  "Fruit Tea": ["Coffee Jelly", "Nata", "Pearl"],
  "Frappe": ["Caramel", "Coffee Jelly", "Espresso", "Nata", "Oreo", "Pearl", "Whip Cream"],
  "Hot Tea": [],
  "Food & Bites": []
};

// Delete Confirmation Modal Component
function DeleteConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  itemName, 
  itemType 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  itemName: string; 
  itemType: "category" | "item";
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-xl font-bold mb-3" style={{ color: "#3b2212" }}>
          Delete {itemType === "category" ? "Category" : "Item"}
        </h3>
        <p className="text-base mb-6" style={{ color: "#a07850" }}>
          Are you sure you want to delete "{itemName}"? 
          {itemType === "category" && " All items in this category will also be deleted."}
          This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold text-base transition-all active:scale-95"
            style={{ background: "#f0e8e0", color: "#3b2212" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-semibold text-base transition-all active:scale-95"
            style={{ background: "#c0392b", color: "white" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// Individual Discount Modal (for per-item "Add Discount" button) - has BOTH PWD and Senior options
function IndividualDiscountModal({ 
  isOpen, 
  onClose, 
  onApply, 
  itemName,
  currentDiscount
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onApply: (discountType: "None" | "PWD" | "Senior", name: string, id: string) => void;
  itemName: string;
  currentDiscount: { type: "None" | "PWD" | "Senior"; name: string; id: string };
}) {
  const [discountType, setDiscountType] = useState<"PWD" | "Senior">(
    currentDiscount.type !== "None" ? currentDiscount.type : "PWD"
  );
  const [activeInput, setActiveInput] = useState<"name" | "id" | null>(null);
  const [tempName, setTempName] = useState(currentDiscount.name);
  const [tempID, setTempID] = useState(currentDiscount.id);
  const [isLandscape, setIsLandscape] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    if (activeInput && modalRef.current) {
      setTimeout(() => {
        modalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [activeInput]);

  const handleKeyPress = (key: string) => {
    if (activeInput === "name") {
      if (key === "BACKSPACE") {
        setTempName(prev => prev.slice(0, -1));
      } else if (key === "SPACE") {
        setTempName(prev => prev + " ");
      } else if (key === "CLEAR") {
        setTempName("");
      } else {
        setTempName(prev => prev + key);
      }
    } else if (activeInput === "id") {
      if (key === "BACKSPACE") {
        setTempID(prev => prev.slice(0, -1));
      } else if (key === "CLEAR") {
        setTempID("");
      } else if (/^[0-9]$/.test(key)) {
        setTempID(prev => prev + key);
      }
    }
  };

  const handleApply = () => {
    if (tempName.trim() && tempID.trim()) {
      onApply(discountType, tempName, tempID);
      setActiveInput(null);
      onClose();
    }
  };

  const handleClose = () => {
    setTempName(currentDiscount.name);
    setTempID(currentDiscount.id);
    setActiveInput(null);
    onClose();
  };

  if (!isOpen) return null;

  const isRemoveButtonEnabled = currentDiscount.type !== "None";
  const isApplyButtonEnabled = tempName.trim() && tempID.trim();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[70] p-4">
      <div ref={modalRef} className={`bg-white rounded-2xl shadow-2xl w-full max-w-3xl ${isLandscape ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>
              Apply Discount
            </h2>
            <button
              onClick={handleClose}
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl active:scale-95 touch-manipulation"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4", minHeight: "44px" }}
            >
              ✕
            </button>
          </div>
          
          <p className="text-sm mb-5" style={{ color: "#a07850" }}>
            {itemName.length > 45 ? itemName.substring(0, 42) + "..." : itemName} - 20% off
          </p>

          <div className="flex gap-3 mb-5">
            {(["PWD", "Senior"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setDiscountType(type)}
                className={`flex-1 py-3 rounded-xl font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[48px] ${
                  discountType === type
                    ? "bg-[#3b2212] text-white"
                    : "bg-[#faf7f4] text-[#3b2212] border border-[#e8ddd4]"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                Customer Name <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("name")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer ${
                  activeInput === "name" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "52px",
                }}
              >
                {tempName || <span style={{ color: "#c0b090" }}>Tap to enter name...</span>}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                ID Number <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("id")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer font-mono ${
                  activeInput === "id" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "52px",
                }}
              >
                {tempID || <span style={{ color: "#c0b090" }}>Tap to enter ID number...</span>}
              </div>
            </div>
          </div>

          {activeInput && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold" style={{ color: "#3b2212" }}>
                  Enter {activeInput === "name" ? "Customer Name" : "ID Number"}
                </p>
                <button
                  onClick={() => setActiveInput(null)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold active:scale-95 touch-manipulation min-h-[40px]"
                  style={{ background: "#3b2212", color: "white" }}
                >
                  Done
                </button>
              </div>
              
              {activeInput === "name" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-10 gap-1.5">
                    {["Q","W","E","R","T","Y","U","I","O","P"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["A","S","D","F","G","H","J","K","L"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["Z","X","C","V","B","N","M"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                    <button onClick={() => handleKeyPress("SPACE")}
                      className="py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation col-span-2 min-h-[44px]"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                      SPACE
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      ⌫
                    </button>
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation min-h-[44px]"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {["1","2","3","4","5","6","7","8","9"].map((num) => (
                      <button key={num} onClick={() => handleKeyPress(num)}
                        className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-4 rounded-xl font-bold text-base transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                    <button onClick={() => handleKeyPress("0")}
                      className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                      0
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      ⌫
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 mt-6">
            <button
              disabled={!isRemoveButtonEnabled}
              onClick={() => {
                onApply("None", "", "");
                setActiveInput(null);
                onClose();
              }}
              className="flex-1 py-4 rounded-xl font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[52px]"
              style={{
                background: !isRemoveButtonEnabled ? "#e8e0d8" : "#f0e8e0",
                color: !isRemoveButtonEnabled ? "#b09070" : "#3b2212",
                cursor: !isRemoveButtonEnabled ? "not-allowed" : "pointer"
              }}
            >
              Remove Discount
            </button>
            <button
              disabled={!isApplyButtonEnabled}
              onClick={handleApply}
              className="flex-1 py-4 rounded-xl font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[52px]"
              style={{
                background: !isApplyButtonEnabled ? "#e8e0d8" : "#2d7a38",
                color: !isApplyButtonEnabled ? "#b09070" : "white",
                cursor: !isApplyButtonEnabled ? "not-allowed" : "pointer",
              }}
            >
              Apply Discount
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// PWD ONLY Modal (for bulk PWD button)
function PWDDiscountModal({ 
  isOpen, 
  onClose, 
  onApply, 
  itemName,
  currentName,
  currentID
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onApply: (name: string, id: string) => void;
  itemName: string;
  currentName: string;
  currentID: string;
}) {
  const [activeInput, setActiveInput] = useState<"name" | "id" | null>(null);
  const [tempName, setTempName] = useState(currentName);
  const [tempID, setTempID] = useState(currentID);
  const [isLandscape, setIsLandscape] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    if (activeInput && modalRef.current) {
      setTimeout(() => {
        modalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [activeInput]);

  const handleKeyPress = (key: string) => {
    if (activeInput === "name") {
      if (key === "BACKSPACE") {
        setTempName(prev => prev.slice(0, -1));
      } else if (key === "SPACE") {
        setTempName(prev => prev + " ");
      } else if (key === "CLEAR") {
        setTempName("");
      } else {
        setTempName(prev => prev + key);
      }
    } else if (activeInput === "id") {
      if (key === "BACKSPACE") {
        setTempID(prev => prev.slice(0, -1));
      } else if (key === "CLEAR") {
        setTempID("");
      } else if (/^[0-9]$/.test(key)) {
        setTempID(prev => prev + key);
      }
    }
  };

  const handleApply = () => {
    if (tempName.trim() && tempID.trim()) {
      onApply(tempName, tempID);
      setActiveInput(null);
      onClose();
    }
  };

  const handleClose = () => {
    setTempName(currentName);
    setTempID(currentID);
    setActiveInput(null);
    onClose();
  };

  if (!isOpen) return null;

  const isRemoveButtonEnabled = currentName !== "";
  const isApplyButtonEnabled = tempName.trim() && tempID.trim();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[70] p-4">
      <div ref={modalRef} className={`bg-white rounded-2xl shadow-2xl w-full max-w-3xl ${isLandscape ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>
              Apply PWD Discount
            </h2>
            <button
              onClick={handleClose}
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl active:scale-95 touch-manipulation"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4", minHeight: "44px" }}
            >
              ✕
            </button>
          </div>
          
          <p className="text-sm mb-5" style={{ color: "#a07850" }}>
            {itemName.length > 45 ? itemName.substring(0, 42) + "..." : itemName} - 20% off (PWD)
          </p>

          <div className="mb-5 p-3 rounded-xl text-center" style={{ background: "#e8f5e9", color: "#2d7a38" }}>
            <span className="font-semibold">PWD Discount (20% off)</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                Customer Name <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("name")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer ${
                  activeInput === "name" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "52px",
                }}
              >
                {tempName || <span style={{ color: "#c0b090" }}>Tap to enter name...</span>}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                PWD ID Number <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("id")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer font-mono ${
                  activeInput === "id" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "52px",
                }}
              >
                {tempID || <span style={{ color: "#c0b090" }}>Tap to enter PWD ID...</span>}
              </div>
            </div>
          </div>

          {activeInput && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold" style={{ color: "#3b2212" }}>
                  Enter {activeInput === "name" ? "Customer Name" : "PWD ID Number"}
                </p>
                <button
                  onClick={() => setActiveInput(null)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold active:scale-95 touch-manipulation min-h-[40px]"
                  style={{ background: "#3b2212", color: "white" }}
                >
                  Done
                </button>
              </div>
              
              {activeInput === "name" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-10 gap-1.5">
                    {["Q","W","E","R","T","Y","U","I","O","P"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["A","S","D","F","G","H","J","K","L"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["Z","X","C","V","B","N","M"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                    <button onClick={() => handleKeyPress("SPACE")}
                      className="py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation col-span-2 min-h-[44px]"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                      SPACE
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      ⌫
                    </button>
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation min-h-[44px]"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {["1","2","3","4","5","6","7","8","9"].map((num) => (
                      <button key={num} onClick={() => handleKeyPress(num)}
                        className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-4 rounded-xl font-bold text-base transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                    <button onClick={() => handleKeyPress("0")}
                      className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                      0
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      ⌫
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 mt-6">
            <button
              disabled={!isRemoveButtonEnabled}
              onClick={() => {
                onApply("", "");
                setActiveInput(null);
                onClose();
              }}
              className="flex-1 py-4 rounded-xl font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[52px]"
              style={{
                background: !isRemoveButtonEnabled ? "#e8e0d8" : "#f0e8e0",
                color: !isRemoveButtonEnabled ? "#b09070" : "#3b2212",
                cursor: !isRemoveButtonEnabled ? "not-allowed" : "pointer"
              }}
            >
              Remove Discount
            </button>
            <button
              disabled={!isApplyButtonEnabled}
              onClick={handleApply}
              className="flex-1 py-4 rounded-xl font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[52px]"
              style={{
                background: !isApplyButtonEnabled ? "#e8e0d8" : "#2d7a38",
                color: !isApplyButtonEnabled ? "#b09070" : "white",
                cursor: !isApplyButtonEnabled ? "not-allowed" : "pointer",
              }}
            >
              Apply PWD Discount
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Senior ONLY Modal (for bulk Senior button)
function SeniorDiscountModal({ 
  isOpen, 
  onClose, 
  onApply, 
  itemName,
  currentName,
  currentID
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onApply: (name: string, id: string) => void;
  itemName: string;
  currentName: string;
  currentID: string;
}) {
  const [activeInput, setActiveInput] = useState<"name" | "id" | null>(null);
  const [tempName, setTempName] = useState(currentName);
  const [tempID, setTempID] = useState(currentID);
  const [isLandscape, setIsLandscape] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    if (activeInput && modalRef.current) {
      setTimeout(() => {
        modalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [activeInput]);

  const handleKeyPress = (key: string) => {
    if (activeInput === "name") {
      if (key === "BACKSPACE") {
        setTempName(prev => prev.slice(0, -1));
      } else if (key === "SPACE") {
        setTempName(prev => prev + " ");
      } else if (key === "CLEAR") {
        setTempName("");
      } else {
        setTempName(prev => prev + key);
      }
    } else if (activeInput === "id") {
      if (key === "BACKSPACE") {
        setTempID(prev => prev.slice(0, -1));
      } else if (key === "CLEAR") {
        setTempID("");
      } else if (/^[0-9]$/.test(key)) {
        setTempID(prev => prev + key);
      }
    }
  };

  const handleApply = () => {
    if (tempName.trim() && tempID.trim()) {
      onApply(tempName, tempID);
      setActiveInput(null);
      onClose();
    }
  };

  const handleClose = () => {
    setTempName(currentName);
    setTempID(currentID);
    setActiveInput(null);
    onClose();
  };

  if (!isOpen) return null;

  const isRemoveButtonEnabled = currentName !== "";
  const isApplyButtonEnabled = tempName.trim() && tempID.trim();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[70] p-4">
      <div ref={modalRef} className={`bg-white rounded-2xl shadow-2xl w-full max-w-3xl ${isLandscape ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>
              Apply Senior Discount
            </h2>
            <button
              onClick={handleClose}
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl active:scale-95 touch-manipulation"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4", minHeight: "44px" }}
            >
              ✕
            </button>
          </div>
          
          <p className="text-sm mb-5" style={{ color: "#a07850" }}>
            {itemName.length > 45 ? itemName.substring(0, 42) + "..." : itemName} - 20% off (Senior)
          </p>

          <div className="mb-5 p-3 rounded-xl text-center" style={{ background: "#fff3e0", color: "#e67e22" }}>
            <span className="font-semibold">Senior Discount (20% off)</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                Customer Name <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("name")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer ${
                  activeInput === "name" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "52px",
                }}
              >
                {tempName || <span style={{ color: "#c0b090" }}>Tap to enter name...</span>}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                Senior ID Number <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <div
                onClick={() => setActiveInput("id")}
                className={`w-full rounded-xl px-4 py-3 text-base transition-all cursor-pointer font-mono ${
                  activeInput === "id" ? "ring-2 ring-[#3b2212]" : ""
                }`}
                style={{
                  background: "#faf7f4",
                  border: "1.5px solid #e8ddd4",
                  color: "#3b2212",
                  minHeight: "52px",
                }}
              >
                {tempID || <span style={{ color: "#c0b090" }}>Tap to enter Senior ID...</span>}
              </div>
            </div>
          </div>

          {activeInput && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold" style={{ color: "#3b2212" }}>
                  Enter {activeInput === "name" ? "Customer Name" : "Senior ID Number"}
                </p>
                <button
                  onClick={() => setActiveInput(null)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold active:scale-95 touch-manipulation min-h-[40px]"
                  style={{ background: "#3b2212", color: "white" }}
                >
                  Done
                </button>
              </div>
              
              {activeInput === "name" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-10 gap-1.5">
                    {["Q","W","E","R","T","Y","U","I","O","P"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["A","S","D","F","G","H","J","K","L"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {["Z","X","C","V","B","N","M"].map((key) => (
                      <button key={key} onClick={() => handleKeyPress(key)}
                        className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                        {key}
                      </button>
                    ))}
                    <button onClick={() => handleKeyPress("SPACE")}
                      className="py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation col-span-2 min-h-[44px]"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1px solid #e8ddd4" }}>
                      SPACE
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-3 rounded-lg font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[44px]"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      ⌫
                    </button>
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 touch-manipulation min-h-[44px]"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {["1","2","3","4","5","6","7","8","9"].map((num) => (
                      <button key={num} onClick={() => handleKeyPress(num)}
                        className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                        style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => handleKeyPress("CLEAR")}
                      className="py-4 rounded-xl font-bold text-base transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#fff0f0", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      CLEAR
                    </button>
                    <button onClick={() => handleKeyPress("0")}
                      className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                      0
                    </button>
                    <button onClick={() => handleKeyPress("BACKSPACE")}
                      className="py-4 rounded-xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[56px]"
                      style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>
                      ⌫
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 mt-6">
            <button
              disabled={!isRemoveButtonEnabled}
              onClick={() => {
                onApply("", "");
                setActiveInput(null);
                onClose();
              }}
              className="flex-1 py-4 rounded-xl font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[52px]"
              style={{
                background: !isRemoveButtonEnabled ? "#e8e0d8" : "#f0e8e0",
                color: !isRemoveButtonEnabled ? "#b09070" : "#3b2212",
                cursor: !isRemoveButtonEnabled ? "not-allowed" : "pointer"
              }}
            >
              Remove Discount
            </button>
            <button
              disabled={!isApplyButtonEnabled}
              onClick={handleApply}
              className="flex-1 py-4 rounded-xl font-semibold text-base transition-all active:scale-95 touch-manipulation min-h-[52px]"
              style={{
                background: !isApplyButtonEnabled ? "#e8e0d8" : "#2d7a38",
                color: !isApplyButtonEnabled ? "#b09070" : "white",
                cursor: !isApplyButtonEnabled ? "not-allowed" : "pointer",
              }}
            >
              Apply Senior Discount
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Standalone Manage Recipes Tab (used inside ManageModal for existing items without recipes)
function ManageRecipesTab({
  inventoryKeys,
  itemsByCategory,
  mergedRecipes,
  onSaveRecipe,
}: {
  inventoryKeys: string[];
  itemsByCategory: Record<string, string[]>;
  mergedRecipes: Recipes;
  onSaveRecipe: (itemName: string, sizes: Record<string, Record<string, number>>) => Promise<void>;
}) {
  const [recipeSelectedItem, setRecipeSelectedItem] = useState<string>("");
  const [recipeIngredients, setRecipeIngredients] = useState<{ ingredient: string; medQty: string; lgQty: string }[]>([]);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const allItems = Object.entries(itemsByCategory).flatMap(([cat, items]) =>
    items.map(name => ({ name, category: cat }))
  );
  const itemsWithoutRecipe = allItems.filter(({ name, category }) => {
    const catLabel = category.split(" · ")[0];
    return !mergedRecipes[`${catLabel} - ${name}`] && !mergedRecipes[name];
  });

  const handleSaveRecipe = async () => {
    if (!recipeSelectedItem) {
      setMessage({ text: "Please select an item first.", type: "error" });
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    if (recipeIngredients.length === 0) {
      setMessage({ text: "Add at least one ingredient.", type: "error" });
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    for (const row of recipeIngredients) {
      if (!row.ingredient || !row.medQty || parseFloat(row.medQty) <= 0) {
        setMessage({ text: "Fill in all Medium quantities.", type: "error" });
        setTimeout(() => setMessage(null), 2500);
        return;
      }
    }
    const mediumIngredients: Record<string, number> = {};
    const largeIngredients: Record<string, number> = {};
    recipeIngredients.forEach(row => {
      mediumIngredients[row.ingredient] = parseFloat(row.medQty);
      largeIngredients[row.ingredient] = row.lgQty && parseFloat(row.lgQty) > 0
        ? parseFloat(row.lgQty) : parseFloat(row.medQty);
    });
    setRecipeSaving(true);
    try {
      await onSaveRecipe(recipeSelectedItem, { Medium: mediumIngredients, Large: largeIngredients });
      setMessage({ text: `Recipe for "${recipeSelectedItem}" saved! ✓`, type: "success" });
      setRecipeSelectedItem("");
      setRecipeIngredients([]);
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage({ text: "Failed to save. Try again.", type: "error" });
      setTimeout(() => setMessage(null), 2500);
    } finally {
      setRecipeSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
          Items Without a Recipe
        </label>
        {itemsWithoutRecipe.length === 0 ? (
          <div className="p-4 rounded-xl text-center text-sm" style={{ background: "#f0faf0", color: "#2d7a38", border: "1.5px solid #c8e6c9" }}>
            ✓ All items already have recipes!
          </div>
        ) : (
          <select
            value={recipeSelectedItem}
            onChange={(e) => { setRecipeSelectedItem(e.target.value); setRecipeIngredients([]); }}
            className="w-full rounded-xl px-4 py-3 text-base outline-none min-h-[48px]"
            style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
          >
            <option value="">— Select an item —</option>
            {itemsWithoutRecipe.map(({ name, category }) => (
              <option key={`${category}-${name}`} value={name}>{name} ({category})</option>
            ))}
          </select>
        )}
      </div>

      {recipeSelectedItem && (
        <>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold" style={{ color: "#3b2212" }}>Ingredients</label>
              <button
                onClick={() => setRecipeIngredients(prev => [...prev, { ingredient: inventoryKeys[0] || "", medQty: "", lgQty: "" }])}
                className="px-4 py-2 rounded-lg text-sm font-semibold active:scale-95 touch-manipulation min-h-[36px]"
                style={{ background: "#3b2212", color: "white" }}
              >
                + Add Ingredient
              </button>
            </div>
            {recipeIngredients.length === 0 ? (
              <p className="text-sm text-center py-4 rounded-xl" style={{ background: "#faf7f4", color: "#c0b090" }}>
                Tap "+ Add Ingredient" to start building the recipe.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-2 text-xs font-semibold" style={{ color: "#a07850" }}>
                  <span className="col-span-5">Ingredient</span>
                  <span className="col-span-3 text-center">Med qty</span>
                  <span className="col-span-3 text-center">Lg qty</span>
                  <span className="col-span-1" />
                </div>
                {recipeIngredients.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select
                        value={row.ingredient}
                        onChange={(e) => setRecipeIngredients(prev => prev.map((r, i) => i === idx ? { ...r, ingredient: e.target.value } : r))}
                        className="w-full rounded-lg px-2 py-2 text-sm outline-none min-h-[40px]"
                        style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                      >
                        {inventoryKeys.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input type="number" value={row.medQty} placeholder="Med"
                        onChange={(e) => setRecipeIngredients(prev => prev.map((r, i) => i === idx ? { ...r, medQty: e.target.value } : r))}
                        className="w-full rounded-lg px-2 py-2 text-sm text-center outline-none min-h-[40px]"
                        style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }} />
                    </div>
                    <div className="col-span-3">
                      <input type="number" value={row.lgQty} placeholder="Lg (opt)"
                        onChange={(e) => setRecipeIngredients(prev => prev.map((r, i) => i === idx ? { ...r, lgQty: e.target.value } : r))}
                        className="w-full rounded-lg px-2 py-2 text-sm text-center outline-none min-h-[40px]"
                        style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button onClick={() => setRecipeIngredients(prev => prev.filter((_, i) => i !== idx))}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm active:scale-95"
                        style={{ background: "#fee2e2", color: "#c0392b" }}>✕</button>
                    </div>
                  </div>
                ))}
                <p className="text-xs" style={{ color: "#a07850" }}>Leave Lg blank to use same as Med.</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSaveRecipe}
            disabled={recipeSaving || recipeIngredients.length === 0}
            className="w-full py-4 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation min-h-[52px]"
            style={{
              background: recipeSaving || recipeIngredients.length === 0 ? "#e8e0d8" : "#2d7a38",
              color: recipeSaving || recipeIngredients.length === 0 ? "#b09070" : "white",
              cursor: recipeSaving || recipeIngredients.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {recipeSaving ? "Saving..." : `Save Recipe for "${recipeSelectedItem}"`}
          </button>
        </>
      )}

      {message && (
        <div className={`p-3 rounded-xl text-center text-sm font-medium ${
          message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

// Generate Report Modal Component
function GenerateReportModal({
  isOpen,
  onClose,
  dateFilter,
  onDateFilterChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  dateFilter: string;
  onDateFilterChange: (filter: string) => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    setLoading(true);
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setOrders(records);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching orders:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  const getFilteredOrders = () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return orders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);

      if (dateFilter === "Today") {
        return orderDate >= startOfToday;
      } else if (dateFilter === "This Week") {
        return orderDate >= startOfWeek;
      } else if (dateFilter === "This Month") {
        return orderDate >= startOfMonth;
      }
      return true;
    });
  };

  const filteredOrders = getFilteredOrders();
  const totalSales = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const refundedAmount = filteredOrders
    .filter(o => o.status === "refunded")
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const completedCount = filteredOrders.filter(o => !o.status || o.status !== "refunded").length;
  const refundedCount = filteredOrders.filter(o => o.status === "refunded").length;

  const generatePDF = () => {
    const now = new Date();
    const dateStr = now.toLocaleString();
    
    let pdfContent = `
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #3b2212; }
    h1 { text-align: center; color: #3b2212; margin-bottom: 5px; }
    .header-info { text-align: center; font-size: 12px; color: #a07850; margin-bottom: 20px; }
    .summary { background: #faf7f4; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1.5px solid #e8ddd4; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: bold; }
    .summary-label { color: #a07850; }
    .summary-value { color: #3b2212; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    thead { background: #3b2212; color: white; }
    th { padding: 12px; text-align: left; font-size: 13px; border: 1px solid #3b2212; }
    td { padding: 10px 12px; border-bottom: 1px solid #e8ddd4; font-size: 12px; }
    tr:hover { background: #f7f3ef; }
    .status-completed { background: #f0faf0; color: #2d7a38; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    .status-refunded { background: #fee2e2; color: #c0392b; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    .footer { margin-top: 30px; border-top: 2px solid #3b2212; padding-top: 15px; }
    .footer-item { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; font-weight: bold; }
    .total { font-size: 18px; color: #3b2212; }
  </style>
</head>
<body>
  <h1>☕ Coffee & Tea Connection</h1>
  <div class="header-info">
    <p>Sales Report - ${dateFilter}</p>
    <p>Generated on ${dateStr}</p>
  </div>

  <div class="summary">
    <div class="summary-row">
      <span class="summary-label">Total Orders:</span>
      <span class="summary-value">${filteredOrders.length}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Completed:</span>
      <span class="summary-value">${completedCount}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Refunded:</span>
      <span class="summary-value">${refundedCount}</span>
    </div>
    <div class="summary-row" style="border-top: 1px solid #e8ddd4; padding-top: 8px;">
      <span class="summary-label">Total Sales:</span>
      <span class="summary-value">₱${totalSales.toFixed(2)}</span>
    </div>
    ${refundedAmount > 0 ? `
    <div class="summary-row">
      <span class="summary-label">Total Refunded:</span>
      <span class="summary-value" style="color: #c0392b;">-₱${refundedAmount.toFixed(2)}</span>
    </div>
    ` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Order ID</th>
        <th>Date & Time</th>
        <th>Items</th>
        <th>Amount</th>
        <th>Status</th>
        <th>Barista</th>
      </tr>
    </thead>
    <tbody>
`;

    filteredOrders.forEach(order => {
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      const dateTime = orderDate.toLocaleString();
      const itemCount = (order.items || []).length;
      const statusClass = order.status === "refunded" ? "status-refunded" : "status-completed";
      const statusText = order.status === "refunded" ? "REFUNDED" : "COMPLETED";

      pdfContent += `
      <tr>
        <td>#${order.transactionNumber || order.id.substring(0, 8)}</td>
        <td>${dateTime}</td>
        <td>${itemCount} item(s)</td>
        <td style="font-weight: bold;">₱${(order.totalAmount || 0).toFixed(2)}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td>${order.baristaName || "—"}</td>
      </tr>
`;
    });

    pdfContent += `
    </tbody>
  </table>

  <div class="footer">
    <div class="footer-item">
      <span>Total Sales (${dateFilter}):</span>
      <span class="total">₱${totalSales.toFixed(2)}</span>
    </div>
    ${refundedAmount > 0 ? `
    <div class="footer-item">
      <span>Total Refunded:</span>
      <span class="total" style="color: #c0392b;">₱${refundedAmount.toFixed(2)}</span>
    </div>
    ` : ''}
    <div class="footer-item" style="border-top: 1px solid #3b2212; padding-top: 10px; color: #a07850;">
      <span>Net Sales:</span>
      <span style="color: #3b2212; font-size: 20px;">₱${(totalSales - refundedAmount).toFixed(2)}</span>
    </div>
  </div>
</body>
</html>
`;

    const printWindow = window.open("", "", "width=800,height=600");
    printWindow?.document.write(pdfContent);
    printWindow?.document.close();
    printWindow?.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>
              Generate Sales Report
            </h2>
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl active:scale-95 touch-manipulation"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4", minHeight: "44px" }}
            >
              ✕
            </button>
          </div>

          <div className="mb-6">
            <label className="text-sm font-semibold block mb-3" style={{ color: "#3b2212" }}>
              Select Date Range:
            </label>
            <div className="flex gap-3">
              {["Today", "This Week", "This Month"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => onDateFilterChange(filter)}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 touch-manipulation min-h-[44px] ${
                    dateFilter === filter
                      ? "text-white"
                      : "bg-white text-[#3b2212] border border-[#e8ddd4]"
                  }`}
                  style={{
                    background: dateFilter === filter ? "#3b2212" : undefined,
                  }}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-[#a07850]">
              <p>Loading orders...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-[#faf7f4] rounded-xl p-3 border border-[#e8ddd4]">
                  <p className="text-xs text-[#a07850]">Total</p>
                  <p className="text-xl font-bold text-[#3b2212]">{filteredOrders.length}</p>
                </div>
                <div className="bg-[#f0faf0] rounded-xl p-3 border border-[#c8e6c9]">
                  <p className="text-xs text-[#2d7a38]">Completed</p>
                  <p className="text-xl font-bold text-[#2d7a38]">{completedCount}</p>
                </div>
                <div className="bg-[#fee2e2] rounded-xl p-3 border border-[#f5c6c6]">
                  <p className="text-xs text-[#c0392b]">Refunded</p>
                  <p className="text-xl font-bold text-[#c0392b]">{refundedCount}</p>
                </div>
                <div className="bg-gradient-to-br from-[#3b2212] to-[#6b3f22] rounded-xl p-3 text-white">
                  <p className="text-xs opacity-80">Total Sales</p>
                  <p className="text-lg font-bold">₱{totalSales.toFixed(2)}</p>
                </div>
              </div>

              {refundedAmount > 0 && (
                <div className="bg-[#fee2e2] rounded-xl p-4 mb-6 border border-[#f5c6c6]">
                  <p className="text-sm text-[#c0392b] font-semibold">
                    Total Refunded: ₱{refundedAmount.toFixed(2)}
                  </p>
                  <p className="text-sm text-[#a07850] font-semibold">
                    Net Sales: ₱{(totalSales - refundedAmount).toFixed(2)}
                  </p>
                </div>
              )}
            </>
          )}

          <button
            onClick={generatePDF}
            disabled={loading || filteredOrders.length === 0}
            className="w-full py-4 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation min-h-[52px]"
            style={{
              background:
                loading || filteredOrders.length === 0 ? "#e8e0d8" : "#3b2212",
              color: loading || filteredOrders.length === 0 ? "#b09070" : "white",
              cursor:
                loading || filteredOrders.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Download PDF Report
          </button>
        </div>
      </div>
    </div>
  );
}

// Manage Modal Component with alphabetical sorting
function ManageModal({ 
  isOpen, 
  onClose, 
  onAddCategory, 
  onAddItem, 
  onDeleteCategory,
  onDeleteItem,
  categories,
  itemsByCategory,
  categoryColors: existingCategoryColors,
  inventoryStock,
  mergedRecipes,
  onSaveRecipe,
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAddCategory: (categoryName: string, color: string) => void; 
  onAddItem: (item: { name: string; price: number; category: string; isFood?: boolean; recipe?: { Medium: Record<string, number>; Large: Record<string, number> } }) => void;
  onDeleteCategory: (categoryName: string) => void;
  onDeleteItem: (categoryName: string, itemName: string) => void;
  categories: string[];
  itemsByCategory: Record<string, string[]>;
  categoryColors: Record<string, { bg: string; hoverBg: string; activeBg: string; text: string }>;
  inventoryStock: Record<string, { quantity: number; unit: string; reorderLevel: number }>;
  mergedRecipes: Recipes;
  onSaveRecipe: (itemName: string, sizes: Record<string, Record<string, number>>) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"category" | "item" | "recipe">("category");
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#3b2212");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(categories[0] || "Coffee");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: "category" | "item";
    name: string;
    category?: string;
  }>({ isOpen: false, type: "category", name: "" });

  // --- Inline Recipe Builder state (for Add Item tab) ---
  const [newItemIngredients, setNewItemIngredients] = useState<{ ingredient: string; medQty: string; lgQty: string }[]>([]);
  const [isItemFood, setIsItemFood] = useState(false);

  if (!isOpen) return null;

  // Sort categories alphabetically
  const sortedCategories = sortAlphabetically(categories);
  // Sort items for the selected category alphabetically
  const sortedItems = sortAlphabetically(itemsByCategory[selectedCategory] || []);

  const getCategoryColor = (categoryName: string) => {
    const colors = existingCategoryColors[categoryName];
    if (colors) return colors.activeBg;
    return "#3b2212";
  };

  const getCategoryBgColor = (categoryName: string) => {
    const colors = existingCategoryColors[categoryName];
    if (colors) return colors.bg;
    return "#faf7f4";
  };

  const handleAddCategory = () => {
    if (!categoryName.trim()) {
      setMessage({ text: "Please enter a category name", type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (categories.includes(categoryName.trim())) {
      setMessage({ text: "Category already exists!", type: "error" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    onAddCategory(categoryName.trim(), categoryColor);
    setMessage({ text: `Category "${categoryName}" added successfully!`, type: "success" });
    setCategoryName("");
    setCategoryColor("#3b2212");
    setTimeout(() => setMessage(null), 2000);
  };

  const inventoryKeys = sortAlphabetically(Object.keys(inventoryStock));

  const handleAddIngredientRowForItem = () => {
    setNewItemIngredients(prev => [...prev, { ingredient: inventoryKeys[0] || "", medQty: "", lgQty: "" }]);
  };

  const handleRemoveIngredientRowForItem = (idx: number) => {
    setNewItemIngredients(prev => prev.filter((_, i) => i !== idx));
  };

  const handleIngredientChangeForItem = (idx: number, field: "ingredient" | "medQty" | "lgQty", value: string) => {
    setNewItemIngredients(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const handleAddItem = async () => {
    if (!itemName.trim()) {
      setMessage({ text: "Please enter an item name", type: "error" });
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    if (!itemPrice || parseFloat(itemPrice) <= 0) {
      setMessage({ text: "Please enter a valid price", type: "error" });
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    if (!selectedCategory) {
      setMessage({ text: "Please select a category", type: "error" });
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    if (itemsByCategory[selectedCategory]?.includes(itemName.trim())) {
      setMessage({ text: `Item "${itemName}" already exists in ${selectedCategory}!`, type: "error" });
      setTimeout(() => setMessage(null), 2500);
      return;
    }

    // Validate recipe if not food and ingredients were added
    if (!isItemFood && newItemIngredients.length > 0) {
      for (const row of newItemIngredients) {
        if (!row.ingredient || !row.medQty || parseFloat(row.medQty) <= 0) {
          setMessage({ text: "Please fill in all ingredient quantities.", type: "error" });
          setTimeout(() => setMessage(null), 2500);
          return;
        }
      }
    }

    // Save the item with recipe included
    const recipe = (!isItemFood && newItemIngredients.length > 0) ? (() => {
      const med: Record<string, number> = {};
      const lg: Record<string, number> = {};
      newItemIngredients.forEach(row => {
        med[row.ingredient] = parseFloat(row.medQty);
        lg[row.ingredient] = row.lgQty && parseFloat(row.lgQty) > 0
          ? parseFloat(row.lgQty)
          : parseFloat(row.medQty);
      });
      return { Medium: med, Large: lg };
    })() : undefined;

    onAddItem({
      name: itemName.trim(),
      price: parseFloat(itemPrice),
      category: selectedCategory,
      isFood: isItemFood,
      recipe,
    });

    if (recipe) {
      setMessage({ text: `"${itemName}" added with recipe! ✓`, type: "success" });
    } else {
      setMessage({ text: `Item "${itemName}" added to ${selectedCategory}!`, type: "success" });
    }

    setItemName("");
    setItemPrice("");
    setNewItemIngredients([]);
    setIsItemFood(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteClick = (type: "category" | "item", name: string, category?: string) => {
    setDeleteConfirm({ isOpen: true, type, name, category });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.type === "category") {
      onDeleteCategory(deleteConfirm.name);
    } else if (deleteConfirm.type === "item" && deleteConfirm.category) {
      onDeleteItem(deleteConfirm.category, deleteConfirm.name);
    }
    setDeleteConfirm({ isOpen: false, type: "category", name: "" });
    setMessage({ text: `${deleteConfirm.type === "category" ? "Category" : "Item"} deleted successfully!`, type: "success" });
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl" style={{ maxHeight: "90vh", overflow: "auto" }}>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>Manage Menu</h2>
              <button
                onClick={onClose}
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl active:scale-95 touch-manipulation"
                style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4", minHeight: "44px" }}
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2 mb-6 border-b border-[#e8ddd4]">
              <button
                onClick={() => { setActiveTab("category"); setMessage(null); }}
                className={`px-6 py-3 font-semibold transition-all min-h-[44px] ${
                  activeTab === "category"
                    ? "border-b-2 border-[#3b2212] text-[#3b2212]"
                    : "text-[#a07850] hover:text-[#3b2212]"
                }`}
              >
                Add Category
              </button>
              <button
                onClick={() => { setActiveTab("item"); setMessage(null); }}
                className={`px-6 py-3 font-semibold transition-all min-h-[44px] ${
                  activeTab === "item"
                    ? "border-b-2 border-[#3b2212] text-[#3b2212]"
                    : "text-[#a07850] hover:text-[#3b2212]"
                }`}
              >
                Add Item
              </button>
              <button
                onClick={() => { setActiveTab("recipe"); setMessage(null); }}
                className={`px-6 py-3 font-semibold transition-all min-h-[44px] ${
                  activeTab === "recipe"
                    ? "border-b-2 border-[#3b2212] text-[#3b2212]"
                    : "text-[#a07850] hover:text-[#3b2212]"
                }`}
              >
                Manage Recipes
              </button>
            </div>

            {activeTab === "category" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Category Name
                  </label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="e.g., Smoothies, Iced Tea, Pastries"
                    className="w-full rounded-xl px-4 py-3 text-base outline-none min-h-[48px]"
                    style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                    onKeyPress={(e) => e.key === "Enter" && handleAddCategory()}
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Category Color
                  </label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={categoryColor}
                      onChange={(e) => setCategoryColor(e.target.value)}
                      className="w-16 h-12 rounded-lg cursor-pointer"
                      style={{ border: "1.5px solid #e8ddd4" }}
                    />
                    <span className="text-sm" style={{ color: "#a07850" }}>
                      Choose a color for the category cards
                    </span>
                  </div>
                  <div className="mt-3 p-3 rounded-xl" style={{ background: `${categoryColor}20`, border: `1.5px solid ${categoryColor}` }}>
                    <p className="text-sm font-semibold" style={{ color: categoryColor }}>
                      Preview: {categoryName || "New Category"} items will use this color
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleAddCategory}
                  className="w-full py-4 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation min-h-[52px]"
                  style={{ background: "#3b2212", color: "white" }}
                >
                  + Add Category
                </button>

                {message && (
                  <div
                    className={`p-3 rounded-xl text-center transition-all duration-300 ${
                      message.type === "success" 
                        ? "bg-green-50 text-green-700 border border-green-200" 
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                    style={{
                      animation: "fadeInUp 0.3s ease-out",
                    }}
                  >
                    <span className="text-sm font-medium">{message.text}</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
                  <h3 className="text-md font-semibold mb-3" style={{ color: "#3b2212" }}>
                    Existing Categories (Alphabetical)
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {sortedCategories.map((cat) => {
                      const catColor = getCategoryColor(cat);
                      return (
                        <div
                          key={cat}
                          className="flex justify-between items-center p-3 rounded-xl"
                          style={{ background: `${catColor}15`, border: `1.5px solid ${catColor}30` }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full" style={{ background: catColor }}></div>
                            <span className="text-sm font-medium" style={{ color: catColor }}>{cat}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteClick("category", cat)}
                            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 touch-manipulation min-h-[40px]"
                            style={{ background: "#fee2e2", color: "#c0392b" }}
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "item" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Select Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-base outline-none min-h-[48px]"
                    style={{ 
                      background: getCategoryBgColor(selectedCategory), 
                      border: `1.5px solid ${getCategoryColor(selectedCategory)}30`,
                      color: getCategoryColor(selectedCategory),
                      fontWeight: "500"
                    }}
                  >
                    {sortedCategories.map((cat) => {
                      const catColor = getCategoryColor(cat);
                      return (
                        <option 
                          key={cat} 
                          value={cat}
                          style={{ 
                            background: `${catColor}20`, 
                            color: catColor,
                            padding: "8px"
                          }}
                        >
                          {cat}
                        </option>
                      );
                    })}
                  </select>
                  {selectedCategory && (
                    <p className="text-xs mt-1.5" style={{ color: getCategoryColor(selectedCategory) }}>
                      Items added to this category will use its color scheme
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g., Mango Smoothie"
                    className="w-full rounded-xl px-4 py-3 text-base outline-none min-h-[48px]"
                    style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                    Price (₱) - Medium Size
                  </label>
                  <input
                    type="number"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    placeholder="e.g., 150"
                    className="w-full rounded-xl px-4 py-3 text-base outline-none min-h-[48px]"
                    style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                  />
                  <p className="text-xs mt-1" style={{ color: "#a07850" }}>
                    Large size price will be automatically set to +₱20
                  </p>
                </div>

                {/* Recipe Builder — embedded in Add Item */}
                <div className="pt-3 border-t" style={{ borderColor: "#e8ddd4" }}>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-semibold" style={{ color: "#3b2212" }}>
                      Recipe / Ingredients
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-xs" style={{ color: "#a07850" }}>Food item (no recipe)</span>
                      <div
                        onClick={() => { setIsItemFood(v => !v); setNewItemIngredients([]); }}
                        className="w-10 h-5 rounded-full transition-all relative"
                        style={{ background: isItemFood ? "#2d7a38" : "#e8ddd4" }}
                      >
                        <div
                          className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                          style={{ left: isItemFood ? "22px" : "2px" }}
                        />
                      </div>
                    </label>
                  </div>

                  {isItemFood ? (
                    <div className="p-3 rounded-xl text-sm text-center" style={{ background: "#f0faf0", color: "#2d7a38", border: "1.5px solid #c8e6c9" }}>
                      ✓ Food item — no recipe needed. Stock won't be deducted on checkout.
                    </div>
                  ) : (
                    <>
                      {inventoryKeys.length === 0 ? (
                        <p className="text-xs" style={{ color: "#c0392b" }}>No inventory items found. Add inventory items first.</p>
                      ) : (
                        <>
                          {newItemIngredients.length === 0 ? (
                            <p className="text-sm text-center py-3 rounded-xl mb-2" style={{ background: "#faf7f4", color: "#c0b090" }}>
                              No ingredients yet — tap below to add.
                            </p>
                          ) : (
                            <div className="space-y-2 mb-2">
                              <div className="grid grid-cols-12 gap-1 px-1 text-xs font-semibold" style={{ color: "#a07850" }}>
                                <span className="col-span-5">Ingredient</span>
                                <span className="col-span-3 text-center">Med qty</span>
                                <span className="col-span-3 text-center">Lg qty</span>
                                <span className="col-span-1" />
                              </div>
                              {newItemIngredients.map((row, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                                  <div className="col-span-5">
                                    <select
                                      value={row.ingredient}
                                      onChange={(e) => handleIngredientChangeForItem(idx, "ingredient", e.target.value)}
                                      className="w-full rounded-lg px-2 py-2 text-xs outline-none min-h-[38px]"
                                      style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                                    >
                                      {inventoryKeys.map(key => (
                                        <option key={key} value={key}>{key}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="col-span-3">
                                    <input
                                      type="number"
                                      value={row.medQty}
                                      onChange={(e) => handleIngredientChangeForItem(idx, "medQty", e.target.value)}
                                      placeholder="Med"
                                      className="w-full rounded-lg px-2 py-2 text-xs text-center outline-none min-h-[38px]"
                                      style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <input
                                      type="number"
                                      value={row.lgQty}
                                      onChange={(e) => handleIngredientChangeForItem(idx, "lgQty", e.target.value)}
                                      placeholder="Lg"
                                      className="w-full rounded-lg px-2 py-2 text-xs text-center outline-none min-h-[38px]"
                                      style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
                                    />
                                  </div>
                                  <div className="col-span-1 flex justify-center">
                                    <button
                                      onClick={() => handleRemoveIngredientRowForItem(idx)}
                                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs active:scale-95"
                                      style={{ background: "#fee2e2", color: "#c0392b" }}
                                    >✕</button>
                                  </div>
                                </div>
                              ))}
                              <p className="text-xs" style={{ color: "#a07850" }}>
                                Leave Lg qty blank to use same amount as Med.
                              </p>
                            </div>
                          )}
                          <button
                            onClick={handleAddIngredientRowForItem}
                            className="w-full py-2 rounded-xl text-sm font-semibold active:scale-95 touch-manipulation min-h-[40px] transition-all"
                            style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px dashed #c8b090" }}
                          >
                            + Add Ingredient
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={handleAddItem}
                  className="w-full py-4 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation min-h-[52px]"
                  style={{ background: selectedCategory ? getCategoryColor(selectedCategory) : "#3b2212", color: "white" }}
                >
                  + Add Item to {selectedCategory || "Category"}
                </button>

                {message && (
                  <div
                    className={`p-3 rounded-xl text-center transition-all duration-300 ${
                      message.type === "success" 
                        ? "bg-green-50 text-green-700 border border-green-200" 
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                    style={{
                      animation: "fadeInUp 0.3s ease-out",
                    }}
                  >
                    <span className="text-sm font-medium">{message.text}</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t" style={{ borderColor: "#e8ddd4" }}>
                  <h3 className="text-md font-semibold mb-3" style={{ color: "#3b2212" }}>
                    Items in "{selectedCategory}" (Alphabetical)
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {sortedItems.length > 0 ? (
                      sortedItems.map((item) => {
                        const catColor = getCategoryColor(selectedCategory);
                        return (
                          <div
                            key={item}
                            className="flex justify-between items-center p-3 rounded-xl"
                            style={{ background: `${catColor}10`, border: `1.5px solid ${catColor}30` }}
                          >
                            <span className="text-sm font-medium" style={{ color: catColor }}>{item}</span>
                            <button
                              onClick={() => handleDeleteClick("item", item, selectedCategory)}
                              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 touch-manipulation min-h-[40px]"
                              style={{ background: "#fee2e2", color: "#c0392b" }}
                            >
                              Delete
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-center py-4" style={{ color: "#c0b090" }}>
                        No items in this category yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "recipe" && (
              <ManageRecipesTab
                inventoryKeys={inventoryKeys}
                itemsByCategory={itemsByCategory}
                mergedRecipes={mergedRecipes}
                onSaveRecipe={onSaveRecipe}
              />
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <DeleteConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, type: "category", name: "" })}
        onConfirm={handleConfirmDelete}
        itemName={deleteConfirm.name}
        itemType={deleteConfirm.type}
      />
    </>
  );
}

export default function POSLayout() {
  const { user, loading, logout, userRole } = useAuth();
  const router = useRouter();

  const [inventoryStock, setInventoryStock] = useState<Record<string, { quantity: number; unit: string; reorderLevel: number }>>({});
  const [dynamicRecipes, setDynamicRecipes] = useState<Recipes>({});

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const stock: Record<string, { quantity: number; unit: string; reorderLevel: number }> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.name) {
          stock[data.name] = { 
            quantity: parseFloat(data.quantity) || 0, 
            unit: data.unit || "units",
            reorderLevel: parseFloat(data.reorderLevel) || 0
          };
        }
      });
      setInventoryStock(stock);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const itemUnsubscribes: Map<string, () => void> = new Map();

    const catUnsub = onSnapshot(collection(db, "categories"), (catSnap) => {
      // Unsubscribe removed categories
      const currentIds = new Set(catSnap.docs.map(d => d.id));
      itemUnsubscribes.forEach((unsub, catId) => {
        if (!currentIds.has(catId)) {
          unsub();
          itemUnsubscribes.delete(catId);
        }
      });

      catSnap.docs.forEach((catDoc) => {
        const catData = catDoc.data();
        if (!catData.name) return;
        if (itemUnsubscribes.has(catDoc.id)) return; // already listening

        const catName = catData.name as string;

        const itemUnsub = onSnapshot(collection(db, "categories", catDoc.id, "menuItems"), (itemSnap) => {
          const newProducts: string[] = [];
          const newPrices: Record<string, { M: number; L: number }> = {};
          const newColors: Record<string, { bg: string; activeBg: string; text: string }> = {};
          const newRecipes: Recipes = {};

          itemSnap.docs.forEach((itemDoc) => {
            const data = itemDoc.data();
            if (!data.name) return;
            newProducts.push(data.name);
            newPrices[data.name] = {
              M: data.prices?.medium || 0,
              L: data.prices?.large || 0,
            };
            const color = categoryColors[catName]?.activeBg || catData.color || "#3b2212";
            newColors[data.name] = { bg: `${color}20`, activeBg: color, text: color };
            if (data.recipes && Object.keys(data.recipes).length > 0) {
              newRecipes[data.name] = data.recipes;
            }
          });

          setDynamicProducts(prev => ({
            ...prev,
            [catName]: sortAlphabetically(newProducts),
          }));
          setDynamicPrices(prev => ({ ...prev, ...newPrices }));
          setDynamicItemColors(prev => ({ ...prev, ...newColors }));
          setDynamicRecipes(prev => ({ ...prev, ...newRecipes }));
        });

        itemUnsubscribes.set(catDoc.id, itemUnsub);
      });
    });

    return () => {
      catUnsub();
      itemUnsubscribes.forEach(u => u());
    };
  }, []);

  // Load dynamic categories from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "categories"), (snapshot) => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.name && data.color) {
          const color = data.color;
          setDynamicProducts(prev => ({
            ...prev,
            [data.name]: prev[data.name] || [],
          }));
          categoryColors[data.name] = {
            bg: `${color}20`,
            hoverBg: `${color}30`,
            activeBg: color,
            text: color,
          };
        }
      });
    });
    return () => unsubscribe();
  }, []);

  // menu items are now loaded via categories subcollection listener above

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: generateId(),
      name: "Customer 1",
      orderItems: [],
      bulkDiscount: "None",
      createdAt: new Date(),
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const [activeCategory, setActiveCategory] = useState<string>("Coffee");
  const [activeFoodSubCategory, setActiveFoodSubCategory] = useState<string>("All");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [activeFrappeType, setActiveFrappeType] = useState<string | null>(null);
  const [tempOption, setTempOption] = useState("Hot");
  const [sizeOption, setSizeOption] = useState("Medium");
  const [sugarOption, setSugarOption] = useState("100%");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIsFood, setSelectedProductIsFood] = useState(false);
  const [selectedProductCategory, setSelectedProductCategory] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; method: "Cash" | "Non Cash" | null }>({ open: false, method: null });
  const [cashModal, setCashModal] = useState(false);
  const [nonCashModal, setNonCashModal] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [discountModalItem, setDiscountModalItem] = useState<{ index: number; item: OrderItem } | null>(null);
  
  // New states for separate modals
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [seniorModalOpen, setSeniorModalOpen] = useState(false);
  const [isGenerateReportModalOpen, setIsGenerateReportModalOpen] = useState(false);
  const [reportDateFilter, setReportDateFilter] = useState("Today");

  const [dynamicProducts, setDynamicProducts] = useState<Record<string, string[]>>({});
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, { M: number; L: number }>>({});
  const [dynamicItemColors, setDynamicItemColors] = useState<Record<string, { bg: string; hoverBg?: string; activeBg: string; text: string }>>({});

  const [nonCashName, setNonCashName] = useState("");
  const [nonCashNumber, setNonCashNumber] = useState("");

  const [amountTendered, setAmountTendered] = useState("");
  const [lastTransaction, setLastTransaction] = useState<{
  number: string;
  method: string;
  total: number;
  discountAmount: number;
  amountTendered: string;
  nonCashSenderName?: string;
  nonCashNumber?: string;
  items?: OrderItem[];
  subtotal?: number;
  discount?: {
    type: string;
    amount: number;
    percentage?: number;
  };
} | null>(null);
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);

  // Handle orientation for tablet
  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const orderItems = activeTab?.orderItems || [];
  const bulkDiscount = activeTab?.bulkDiscount || "None";

  const updateActiveTabOrderItems = (newOrderItems: OrderItem[]) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, orderItems: newOrderItems } : tab
    ));
  };

  const updateActiveTabBulkDiscount = (newDiscount: "None" | "5%" | "10%") => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, bulkDiscount: newDiscount } : tab
    ));
  };

  const updateItemDiscount = (index: number, discountType: "None" | "PWD" | "Senior", name: string, id: string) => {
  const newOrderItems = orderItems.map((item, i) =>
    i === index ? { 
      ...item, 
      discountType, 
      discountCustomerName: discountType !== "None" ? name : "",
      discountCustomerID: discountType !== "None" ? id : ""
    } : item
  );
  updateActiveTabOrderItems(newOrderItems);
  // DO NOT change bulkDiscount here!
};

  const createNewTab = () => {
    const newTabId = generateId();
    const newTabNumber = tabs.length + 1;
    const newTab: Tab = {
      id: newTabId,
      name: `Customer ${newTabNumber}`,
      orderItems: [],
      bulkDiscount: "None",
      createdAt: new Date(),
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    
    setTimeout(() => {
      if (tabsContainerRef.current) {
        tabsContainerRef.current.scrollLeft = tabsContainerRef.current.scrollWidth;
      }
    }, 100);
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      if (confirm("Clear all items in this tab?")) {
        setTabs(prev => prev.map(tab => 
          tab.id === tabId 
            ? { ...tab, orderItems: [], bulkDiscount: "None" } 
            : tab
        ));
      }
      return;
    }
    
    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== tabId);
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[0].id);
      }
      return newTabs;
    });
  };

  const startEditingTabName = (tabId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tabId);
    setEditingTabName(currentName);
  };

  const saveTabName = () => {
    if (editingTabId && editingTabName.trim()) {
      setTabs(prev => prev.map(tab => 
        tab.id === editingTabId ? { ...tab, name: editingTabName.trim() } : tab
      ));
    }
    setEditingTabId(null);
    setEditingTabName("");
  };

  const handleTabNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveTabName();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
      setEditingTabName("");
    }
  };

  const handleRemoveItem = (index: number) => {
    const newOrderItems = orderItems.filter((_, i) => i !== index);
    updateActiveTabOrderItems(newOrderItems);
  };

  const handleIncreaseQty = (index: number) => {
    const newOrderItems = orderItems.map((item, i) =>
      i === index ? { ...item, quantity: item.quantity + 1 } : item
    );
    updateActiveTabOrderItems(newOrderItems);
  };

  const handleDecreaseQty = (index: number) => {
    const newOrderItems = orderItems.map((item, i) => {
      if (i !== index) return item;
      if (item.quantity <= 1) return item;
      return { ...item, quantity: item.quantity - 1 };
    });
    updateActiveTabOrderItems(newOrderItems);
  };

  // Sort products alphabetically
  const products: Record<string, string[]> = {
    Coffee: sortAlphabetically(["Americano", "Cappuccino", "Hazelnut", "Caramel Macchiato", "Mocha", "Spanish Latte", "Salted Caramel Latte", "Dirty Matcha", "Vanilla Latte"]),
    "Non Coffee": sortAlphabetically(["Choco", "Dark Choco", "Matcha latte", "Salted Caramel", "Caramel"]),
    Milktea: sortAlphabetically(["Wintermelon", "Okinawa", "Dark Choco", "Capuccino"]),
    "Yakult Mix": sortAlphabetically(["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"]),
    "Fruit Tea": sortAlphabetically(["Wintermelon", "Blueberry", "Green Apple", "Lychee", "Strawberry"]),
    "Hot Tea": sortAlphabetically(["English Breakfast", "Four Red Fruits", "Pure Camomile", "Green Tea & Lemon", "Lemon & Ginger"]),
    Frappe: [],
    "Food & Bites": [],
  };

  const allProducts: Record<string, string[]> = { ...products };
  
  // If a category has items in Firestore subcollection, use ONLY those (no merging to avoid duplicates)
  Object.keys(dynamicProducts).forEach(cat => {
    if (dynamicProducts[cat].length > 0) {
      allProducts[cat] = sortAlphabetically(dynamicProducts[cat]);
    } else if (!allProducts[cat]) {
      allProducts[cat] = [];
    }
  });
  
  // Sort subcategory products alphabetically
  const frappeProducts = {
    "Coffee Based": sortAlphabetically(["Java Chip", "Coffee Jelly", "Dark Mocha", "Caramel"]),
    "Cream Based": sortAlphabetically(["Vanilla", "Cookies & Cream", "Strawberries & Cream", "Blue Berries & Cream", "Choco Chip", "Caramel", "Salted Caramel"]),
    "Tea Based": sortAlphabetically(["Wintermelon", "Okinawa", "Capuccino"]),
  };

  const foodProducts: Record<string, string[]> = {
    "Grilled / Fried": sortAlphabetically(["Liempo", "Leg Quarters"]),
    "Sides & Snacks": sortAlphabetically(["French Fries", "Chicken Fingers", "Nachos", "Quesadillas"]),
    "Sandwiches & Burgers": sortAlphabetically(["Burger", "Cheese Burger", "Ham & Cheese"]),
    Breakfast: sortAlphabetically(["French Toast", "Waffle", "Pancake"]),
    "Desserts & Pastries": sortAlphabetically(["Cheesecake", "Empanada", "Muffin", "Cookies", "Popcorn", "Pancake (Dessert)"]),
    "Silog Meals": sortAlphabetically(["Tapa", "Bangus", "Spam", "Hotdog", "Ham", "Longganisa"]),
    Pasta: sortAlphabetically(["Spaghetti", "Tuna Pesto"]),
    Salads: sortAlphabetically(["Vegetable Salad"]),
  };

  const coffeePrices: Record<string, { M: number; L: number }> = {
    "Americano":           { M: 100, L: 120 },
    "Cappuccino":          { M: 150, L: 170 },
    "Hazelnut":            { M: 150, L: 170 },
    "Caramel Macchiato":   { M: 150, L: 170 },
    "Mocha":               { M: 150, L: 170 },
    "Spanish Latte":       { M: 150, L: 170 },
    "Salted Caramel Latte":{ M: 150, L: 170 },
    "Dirty Matcha":        { M: 150, L: 170 },
    "Vanilla Latte":       { M: 150, L: 170 },
  };

  const nonCoffeePrices: Record<string, { M: number; L: number }> = {
    "Choco":          { M: 140, L: 160 },
    "Dark Choco":     { M: 140, L: 160 },
    "Matcha latte":   { M: 140, L: 160 },
    "Salted Caramel": { M: 140, L: 160 },
    "Caramel":        { M: 140, L: 160 },
  };

  const milkteaPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 120, L: 140 },
    "Okinawa":     { M: 120, L: 140 },
    "Dark Choco":  { M: 115, L: 135 },
    "Capuccino":   { M: 115, L: 135 },
  };

  const yakultMixPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 150, L: 170 },
    "Blueberry":   { M: 150, L: 170 },
    "Green Apple": { M: 150, L: 170 },
    "Lychee":      { M: 150, L: 170 },
    "Strawberry":  { M: 150, L: 170 },
  };

  const fruitTeaPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 110, L: 130 },
    "Blueberry":   { M: 110, L: 130 },
    "Green Apple": { M: 110, L: 130 },
    "Lychee":      { M: 110, L: 130 },
    "Strawberry":  { M: 110, L: 130 },
  };

  const hotTeaPrices: Record<string, number> = {
    "English Breakfast":  120,
    "Four Red Fruits":    120,
    "Pure Camomile":      120,
    "Green Tea & Lemon":  120,
    "Lemon & Ginger":     120,
  };

  const frappeCoffeeBasedPrices: Record<string, { M: number; L: number }> = {
    "Java Chip":    { M: 155, L: 175 },
    "Coffee Jelly": { M: 155, L: 175 },
    "Dark Mocha":   { M: 155, L: 175 },
    "Caramel":      { M: 155, L: 175 },
  };

  const frappeCreamBasedPrices: Record<string, { M: number; L: number }> = {
    "Vanilla":              { M: 150, L: 170 },
    "Cookies & Cream":      { M: 150, L: 170 },
    "Strawberries & Cream": { M: 150, L: 170 },
    "Blue Berries & Cream": { M: 150, L: 170 },
    "Choco Chip":           { M: 150, L: 170 },
    "Caramel":              { M: 150, L: 170 },
    "Salted Caramel":       { M: 150, L: 170 },
  };

  const frappeTeaBasedPrices: Record<string, { M: number; L: number }> = {
    "Wintermelon": { M: 140, L: 160 },
    "Okinawa":     { M: 140, L: 160 },
    "Capuccino":   { M: 140, L: 160 },
  };

  const foodPrices: Record<string, number> = {
    "Liempo":        220,
    "Leg Quarters":  220,
    "French Fries":     130,
    "Chicken Fingers":  200,
    "Nachos":           200,
    "Quesadillas":      0,
    "Quesadillas (Beef)":   200,
    "Quesadillas (Cheese)": 170,
    "Burger":       200,
    "Cheese Burger":200,
    "Ham & Cheese": 180,
    "French Toast": 150,
    "Waffle":       150,
    "Pancake":      150,
    "Cheesecake": 120,
    "Empanada":   120,
    "Muffin":     100,
    "Cookies":    120,
    "Popcorn":    100,
    "Pancake (Dessert)": 120,
    "Tapa":       220,
    "Bangus":     220,
    "Spam":       190,
    "Hotdog":     160,
    "Ham":        160,
    "Longganisa": 160,
    "Spaghetti":  220,
    "Tuna Pesto": 220,
    "Vegetable Salad": 180,
  };

  const ADD_ON_PRICE = 30;

  const handleAddCategory = async (categoryName: string, color: string) => {
    const bgColor = `${color}20`;
    const hoverBgColor = `${color}30`;
    categoryColors[categoryName] = { bg: bgColor, hoverBg: hoverBgColor, activeBg: color, text: color };

    // Save to Firestore
    try {
      await addDoc(collection(db, "categories"), {
        name: categoryName,
        color,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to save category:", err);
    }
  };

  const handleAddItem = async (item: { name: string; price: number; category: string; isFood?: boolean; recipe?: { Medium: Record<string, number>; Large: Record<string, number> } }) => {
    const categoryColor = categoryColors[item.category]?.activeBg || "#3b2212";

    // Optimistic local update
    setDynamicProducts(prev => ({
      ...prev,
      [item.category]: sortAlphabetically([...(prev[item.category] || []), item.name])
    }));
    setDynamicPrices(prev => ({
      ...prev,
      [item.name]: { M: item.price, L: item.price + 20 }
    }));
    setDynamicItemColors(prev => ({
      ...prev,
      [item.name]: { bg: `${categoryColor}20`, activeBg: categoryColor, text: categoryColor }
    }));

    // Save to categories/{categoryId}/menuItems/{slug}
    try {
      const slug = item.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const catQuery = query(collection(db, "categories"), where("name", "==", item.category));
      const catSnap = await getDocs(catQuery);

      if (catSnap.empty) {
        console.error("Category not found in Firestore:", item.category);
        return;
      }

      const categoryDocId = catSnap.docs[0].id;
      const menuItemRef = doc(db, "categories", categoryDocId, "menuItems", slug);
      await setDoc(menuItemRef, {
        name: item.name,
        categoryName: item.category,
        prices: {
          medium: item.price,
          large: item.price + 20,
        },
        recipes: item.recipe || {},
        hasRecipes: !!(item.recipe && Object.keys(item.recipe.Medium || {}).length > 0),
        isFood: item.isFood || false,
        status: "active",
        subcategory: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to save item:", err);
    }
  };

  const handleDeleteCategory = async (categoryName: string) => {
    const defaultCategories = ["Coffee", "Non Coffee", "Milktea", "Yakult Mix", "Fruit Tea", "Hot Tea", "Frappe", "Food & Bites"];
    if (defaultCategories.includes(categoryName)) {
      alert("Cannot delete default categories!");
      return;
    }

    const itemsToRemove = [...(dynamicProducts[categoryName] || [])];

    setDynamicProducts(prev => { const n = { ...prev }; delete n[categoryName]; return n; });
    setDynamicPrices(prev => { const n = { ...prev }; itemsToRemove.forEach(i => delete n[i]); return n; });
    setDynamicItemColors(prev => { const n = { ...prev }; itemsToRemove.forEach(i => delete n[i]); return n; });

    // Delete from Firestore — deleting the category doc also removes subcollection access,
    // but we explicitly delete menuItems subcollection docs first
    try {
      const q = query(collection(db, "categories"), where("name", "==", categoryName));
      const snap = await getDocs(q);
      for (const catDoc of snap.docs) {
        // Delete all menuItems in subcollection first
        const menuItemsSnap = await getDocs(collection(db, "categories", catDoc.id, "menuItems"));
        menuItemsSnap.forEach(d => deleteDoc(d.ref));
        // Then delete the category doc itself
        await deleteDoc(catDoc.ref);
      }
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  };

  const handleDeleteItem = async (categoryName: string, itemName: string) => {
    const defaultItems = [
      "Americano", "Cappuccino", "Hazelnut", "Caramel Macchiato", "Mocha", "Spanish Latte", "Salted Caramel Latte", "Dirty Matcha", "Vanilla Latte",
      "Choco", "Dark Choco", "Matcha latte", "Salted Caramel", "Caramel",
      "Wintermelon", "Okinawa", "Dark Choco", "Capuccino",
      "Liempo", "Leg Quarters", "French Fries", "Chicken Fingers", "Nachos", "Quesadillas",
      "Burger", "Cheese Burger", "Ham & Cheese", "French Toast", "Waffle", "Pancake",
      "Cheesecake", "Empanada", "Muffin", "Cookies", "Popcorn", "Pancake (Dessert)",
      "Tapa", "Bangus", "Spam", "Hotdog", "Ham", "Longganisa", "Spaghetti", "Tuna Pesto", "Vegetable Salad"
    ];

    if (defaultItems.includes(itemName)) {
      alert("Cannot delete default items!");
      return;
    }

    setDynamicProducts(prev => ({
      ...prev,
      [categoryName]: prev[categoryName]?.filter(item => item !== itemName) || []
    }));
    setDynamicPrices(prev => { const n = { ...prev }; delete n[itemName]; return n; });
    setDynamicItemColors(prev => { const n = { ...prev }; delete n[itemName]; return n; });

    // Delete from subcollection
    try {
      const slug = itemName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const catQuery = query(collection(db, "categories"), where("name", "==", categoryName));
      const catSnap = await getDocs(catQuery);
      if (!catSnap.empty) {
        const categoryDocId = catSnap.docs[0].id;
        await deleteDoc(doc(db, "categories", categoryDocId, "menuItems", slug));
      }
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const getDrinkPrice = (productName: string, size: string, category: string, frappeType: string | null): number => {
    const s = size === "Large" || size === "Pot" ? "L" : "M";
    
    if (dynamicPrices[productName]) {
      return dynamicPrices[productName][s as "M"|"L"] ?? dynamicPrices[productName]["M"] ?? 150;
    }
    
    switch (category) {
      case "Coffee": return coffeePrices[productName]?.[s as "M"|"L"] ?? 150;
      case "Non Coffee": return nonCoffeePrices[productName]?.[s as "M"|"L"] ?? 140;
      case "Milktea": return milkteaPrices[productName]?.[s as "M"|"L"] ?? 120;
      case "Yakult Mix": return yakultMixPrices[productName]?.[s as "M"|"L"] ?? 150;
      case "Fruit Tea": return fruitTeaPrices[productName]?.[s as "M"|"L"] ?? 110;
      case "Hot Tea": return hotTeaPrices[productName] ?? 120;
      default: {
        const fType = frappeType ?? getFrappeType(productName);
        if (fType === "Coffee Based") return frappeCoffeeBasedPrices[productName]?.[s as "M"|"L"] ?? 155;
        if (fType === "Cream Based")  return frappeCreamBasedPrices[productName]?.[s as "M"|"L"] ?? 150;
        if (fType === "Tea Based")    return frappeTeaBasedPrices[productName]?.[s as "M"|"L"] ?? 140;
        return 150;
      }
    }
  };

  const getFrappeType = (name: string): string | null => {
    for (const [type, items] of Object.entries(frappeProducts)) {
      if (items.includes(name)) return type;
    }
    return null;
  };

  const allFoodItems = Object.values(foodProducts).flat();
  const quesadillasVariants = ["Beef", "Cheese"];

  // Sort all product entries alphabetically for search
  const allProductEntries: { name: string; category: string }[] = sortAlphabetically([
    ...Object.entries(allProducts).flatMap(([cat, items]) =>
      (items as string[]).map(name => ({ name, category: cat }))
    ),
    ...Object.entries(frappeProducts).flatMap(([sub, items]) =>
      items.map(name => ({ name, category: `Frappe · ${sub}` }))
    ),
    ...Object.entries(foodProducts).flatMap(([sub, items]) =>
      items.map(name => ({ name, category: `Food & Bites · ${sub}` }))
    ),
  ].map(entry => ({ ...entry, name: entry.name, category: entry.category })));

  const searchResults = searchQuery.trim().length > 0
    ? allProductEntries.filter(entry =>
        entry.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const isSearching = searchQuery.trim().length > 0;

  const checkIsFood = (productName: string) => allFoodItems.includes(productName);
  const checkIsFrappe = (productName: string) => {
    return Object.values(frappeProducts).flat().includes(productName);
  };

  const isFood = isSearching ? selectedProductIsFood : activeCategory === "Food & Bites";

  const drinkCategoriesHideTemp = ["Milktea", "Yakult Mix", "Fruit Tea", "Frappe", "Hot Tea", "Food & Bites"];
  const hideTemperature = isFood || (isSearching
    ? checkIsFrappe(selectedProduct || "")
    : drinkCategoriesHideTemp.includes(activeCategory));

  const categoriesWithAddOns = ["Coffee", "Non Coffee", "Milktea", "Yakult Mix", "Fruit Tea", "Frappe"];
  const showAddOns = isSearching
    ? !checkIsFood(selectedProduct || "")
    : categoriesWithAddOns.includes(activeCategory);

  // Sort categories alphabetically for display
  const sortedAllCategories = sortAlphabetically(Object.keys(allProducts));

  // Sort food subcategories alphabetically
  const sortedFoodSubCategories = sortAlphabetically(["All", ...Object.keys(foodProducts)]);

  // Sort frappe types alphabetically
  const sortedFrappeTypes = sortAlphabetically(Object.keys(frappeProducts));

  // ---------------------------------------------------------
  // MERGED RECIPES: hardcoded + Firestore dynamic
  // ---------------------------------------------------------
  const mergedRecipes: Recipes = { ...RECIPES, ...dynamicRecipes };

  // ---------------------------------------------------------
  // RESERVED STOCK & STOCK CHECKER
  // ---------------------------------------------------------
  const alreadyInCartReserved: Record<string, number> = {};
  tabs.forEach(tab => {
    tab.orderItems.forEach(cartItem => {
      const cSizeKey = cartItem.size === "Large" ? "Large" : "Medium";
      const catLabel = cartItem.category.split(" · ")[0];
      const cSpecificRecipeKey = `${catLabel} - ${cartItem.name}`;
      const cRecipe = mergedRecipes[cSpecificRecipeKey]?.[cSizeKey] || mergedRecipes[cartItem.name]?.[cSizeKey];
      
      if (cRecipe) {
        Object.entries(cRecipe).forEach(([ing, amt]) => {
          alreadyInCartReserved[ing] = (alreadyInCartReserved[ing] || 0) + ((amt as number) * cartItem.quantity);
        });
      }
      if (cartItem.addOns) {
        cartItem.addOns.forEach(addOn => {
          alreadyInCartReserved[addOn] = (alreadyInCartReserved[addOn] || 0) + ((ADD_ON_SERVING_SIZES[addOn] || 1) * cartItem.quantity);
        });
      }
    });
  });

  const getItemStockStatus = (item: string, categoryLabel?: string): "Available" | "Low Stock" | "Not Available" | "No Ingredients" => {
    const catLabel = categoryLabel ? categoryLabel.split(" · ")[0] : "";
    const specificRecipeKey = `${catLabel} - ${item}`;
    const recipe = mergedRecipes[specificRecipeKey]?.["Medium"] || mergedRecipes[item]?.["Medium"];
    
    if (!recipe) {
      if (catLabel === "Food & Bites") return "Available"; 
      return "No Ingredients"; 
    }

    let isLow = false;

    for (const [ingredient, neededAmount] of Object.entries(recipe)) {
      const stockData = inventoryStock[ingredient];
      const stockAvailable = stockData?.quantity || 0;
      
      const reorderLvl = stockData?.reorderLevel || ((neededAmount as number) * 3); 
      const reserved = alreadyInCartReserved[ingredient] || 0;
      const remaining = stockAvailable - reserved;

      if (remaining < (neededAmount as number)) {
        return "Not Available"; 
      } else if (remaining <= reorderLvl) {
        isLow = true; 
      }
    }
    return isLow ? "Low Stock" : "Available";
  };

  // ---------------------------------------------------------
  // REAL-TIME OOS CHECKER
  // ---------------------------------------------------------
  const currentMissingIngredients: string[] = [];
  if (selectedProduct) {
    const requiredForThisItem: Record<string, number> = {};
    const sizeKey = sizeOption === "Large" ? "Large" : "Medium";
    const catLabel = selectedProductCategory.split(" · ")[0];
    const specificRecipeKey = `${catLabel} - ${selectedProduct}`;
    
    const recipe = mergedRecipes[specificRecipeKey]?.[sizeKey] || mergedRecipes[selectedProduct]?.[sizeKey]; 
    
    if (recipe) {
      Object.entries(recipe).forEach(([ingredientName, amount]) => {
        requiredForThisItem[ingredientName] = (requiredForThisItem[ingredientName] || 0) + (amount as number);
      });
    }

    if (selectedAddOns.length > 0) {
      selectedAddOns.forEach(addOn => {
        requiredForThisItem[addOn] = (requiredForThisItem[addOn] || 0) + (ADD_ON_SERVING_SIZES[addOn] || 1);
      });
    }

    Object.entries(requiredForThisItem).forEach(([ingredient, neededAmount]) => {
      const stockAvailable = inventoryStock[ingredient]?.quantity || 0;
      const reserved = alreadyInCartReserved[ingredient] || 0;
      const unit = inventoryStock[ingredient]?.unit || "units";
      
      if ((reserved + neededAmount) > stockAvailable) {
        currentMissingIngredients.push(`${ingredient} (Need: ${neededAmount}${unit}, Available: ${Math.max(0, stockAvailable - reserved)}${unit})`);
      }
    });
  }

  const getModalPrice = (): number => {
  if (!selectedProduct) return 0;
  if (isFood) {
    if (selectedProduct === "Quesadillas") {
      const variantKey = selectedVariant ? `Quesadillas (${selectedVariant})` : "Quesadillas";
      return (foodPrices[variantKey] ?? 0) + (selectedAddOns.length * ADD_ON_PRICE);
    }
    return (foodPrices[selectedProduct] ?? 0) + (selectedAddOns.length * ADD_ON_PRICE);
  }
  const cat = isSearching ? selectedProductCategory.split(" · ")[0] : activeCategory;
  const fType = isSearching ? getFrappeType(selectedProduct) : activeFrappeType;
  const base = getDrinkPrice(selectedProduct, sizeOption, cat, fType);
  return base + (selectedAddOns.length * ADD_ON_PRICE);  // ← Add this back
};

  const modalPrice = getModalPrice();

  const handleAddToOrder = () => {
  if (!selectedProduct) return;
  if (selectedProduct === "Quesadillas" && !selectedVariant) return;
  if (currentMissingIngredients.length > 0) return;

  let basePrice: number;
  let displayName = selectedProduct;

  if (isFood) {
    if (selectedProduct === "Quesadillas" && selectedVariant) {
      displayName = `Quesadillas (${selectedVariant})`;
      basePrice = (foodPrices[displayName] ?? 0);
    } else {
      basePrice = (foodPrices[selectedProduct] ?? 0);
    }
  } else {
    const cat = isSearching ? selectedProductCategory.split(" · ")[0] : activeCategory;
    const fType = isSearching ? getFrappeType(selectedProduct) : activeFrappeType;
    basePrice = getDrinkPrice(selectedProduct, sizeOption, cat, fType);
  }

  const newItem: OrderItem = {
    name: displayName,
    category: selectedProductCategory,
    temperature: isFood ? "" : tempOption,
    size: isFood ? "" : sizeOption,
    sugar: isFood ? "" : sugarOption,
    quantity: 1,
    price: basePrice,
    addOns: selectedAddOns.length > 0 ? selectedAddOns : undefined,
    discountType: "None",
    discountCustomerName: "",
    discountCustomerID: "",
  };

  updateActiveTabOrderItems([...orderItems, newItem]);
  setSelectedProduct(null);
  setTempOption("Hot");
  setSizeOption("Medium");
  setSugarOption("100%");
  setSelectedAddOns([]);
  setSelectedVariant(null);
  setSelectedProductIsFood(false);
  setSelectedProductCategory("");
  setModalError(null);
};

  const handleToggleAddOn = (addOn: string) => {
    setSelectedAddOns(prev => prev.includes(addOn) ? prev.filter(i => i !== addOn) : [...prev, addOn]);
  };
  const handleClearAddOns = () => setSelectedAddOns([]);

  // Calculate subtotal with individual item discounts
 const calculateSubtotal = () => {
  let total = 0;
  orderItems.forEach(item => {
    const addOnsTotal = (item.addOns?.length || 0) * ADD_ON_PRICE;
    let itemTotal = (item.price + addOnsTotal) * item.quantity;
    if (item.discountType === "PWD" || item.discountType === "Senior") {
      itemTotal = itemTotal * 0.8;
    }
    total += itemTotal;
  });
  return total;
};

  const subtotal = calculateSubtotal();

  let discountAmount = 0;
  let total = subtotal;

  if (bulkDiscount === "5%") {
    discountAmount = subtotal * 0.05;
    total = subtotal - discountAmount;
  } else if (bulkDiscount === "10%") {
    discountAmount = subtotal * 0.10;
    total = subtotal - discountAmount;
  }

  discountAmount = +discountAmount.toFixed(2);
  total = +total.toFixed(2);

  const generateTransactionNumber = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    return `TXN-${date}-${seq}`;
  };

  const processCheckout = async (paymentMethod: "Cash" | "Non Cash", senderNumber?: string, senderName?: string) => {
    if (orderItems.length === 0) {
      setCheckoutMessage("No items in the cart to checkout.");
      return;
    }

    setIsProcessing(true);

    try {
      const transactionNumber = generateTransactionNumber();

      const sanitizedItems = orderItems.map(item => {
  const cleaned: Record<string, unknown> = {
    name: item.name,
    category: item.category ?? "",
    temperature: item.temperature ?? "",
    size: item.size ?? "",
    sugar: item.sugar ?? "",
    quantity: item.quantity,
    price: item.price,
  };
  
  if (Array.isArray(item.addOns) && item.addOns.length > 0) cleaned.addOns = item.addOns;
  if (typeof item.variant !== "undefined") cleaned.variant = item.variant;
  
  // IMPORTANT: Save discountType directly on the item
  if (item.discountType && item.discountType !== "None") {
    cleaned.discountType = item.discountType;  // ← ADD THIS
    cleaned.discountCustomerName = item.discountCustomerName;
    cleaned.discountCustomerID = item.discountCustomerID;
    cleaned.discount = {
      type: item.discountType,
      rate: 0.20,
      amount: (item.price + (item.addOns?.length || 0) * ADD_ON_PRICE) * item.quantity * 0.2,
      customerName: item.discountCustomerName,
      customerID: item.discountCustomerID
    };
  }
  
  return cleaned;
});

      const orderPayload = {
        transactionNumber,
        items: sanitizedItems,
        subtotal: subtotal,
        discount: bulkDiscount !== "None" ? { type: bulkDiscount, rate: bulkDiscount === "5%" ? 0.05 : 0.10, amount: discountAmount } : null,
        totalAmount: total,
        paymentMethod,
        nonCashSenderName: paymentMethod === "Non Cash" ? (senderName ?? null) : null,
        nonCashNumber: paymentMethod === "Non Cash" ? (senderNumber ?? null) : null,
        baristaName: user?.displayName ?? "Unknown",
        createdAt: serverTimestamp(),
      };

      const requiredIngredients: Record<string, number> = {};
      orderItems.forEach(item => {
        const sizeKey = item.size === "Large" ? "Large" : "Medium";
        const catLabel = item.category.split(" · ")[0];
        const specificRecipeKey = `${catLabel} - ${item.name}`;
        const recipe = mergedRecipes[specificRecipeKey]?.[sizeKey] || mergedRecipes[item.name]?.[sizeKey]; 
        
        if (recipe) {
          Object.entries(recipe).forEach(([ingredientName, amount]) => {
            requiredIngredients[ingredientName] = (requiredIngredients[ingredientName] || 0) + ((amount as number) * item.quantity);
          });
        }
        if (Array.isArray(item.addOns) && item.addOns.length > 0) {
          item.addOns.forEach(addOn => {
            requiredIngredients[addOn] = (requiredIngredients[addOn] || 0) + ((ADD_ON_SERVING_SIZES[addOn] || 1) * item.quantity);
          });
        }
      });

      const ingredientNames = Object.keys(requiredIngredients);

      if (ingredientNames.length === 0) {
        await addDoc(collection(db, "orders"), orderPayload);
        // Log the sale transaction to activity_logs
        await logSaleTransaction(
          {
            uid: user?.uid || "unknown",
            email: user?.email || undefined,
            name: user?.displayName || undefined,
          },
          transactionNumber,
          orderItems as any,
          total,
          paymentMethod,
          bulkDiscount !== "None" ? {
            type: bulkDiscount,
            amount: discountAmount,
            percentage: bulkDiscount === "5%" ? 5 : 10,
          } : undefined
        );
      } else {
        const q = query(collection(db, "inventory"), where("name", "in", ingredientNames));
        const querySnapshot = await getDocs(q);

        const foundNames = querySnapshot.docs.map(d => d.data().name);
        const missingInDb = ingredientNames.filter(name => !foundNames.includes(name));
        
        if (missingInDb.length > 0) {
            throw new Error(`DB_MISSING|${missingInDb.join(", ")}`);
        }

        const inventoryRefs: { ref: DocumentReference; name: string; needed: number }[] = [];
        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (requiredIngredients[data.name]) {
            inventoryRefs.push({ ref: docSnap.ref, name: data.name, needed: requiredIngredients[data.name] });
          }
        });

        await runTransaction(db, async (transaction) => {
          const outOfStockItems: string[] = [];
          const stockUpdates: { ref: DocumentReference, newQty: number, newBatches: any[] }[] = [];

          for (const item of inventoryRefs) {
            const docSnap = await transaction.get(item.ref);
            if (docSnap.exists()) {
              const data = docSnap.data();
              const currentStock = parseFloat(data.quantity) || 0;
              const unit = data.unit || "units";
              
              if (currentStock < item.needed) {
                outOfStockItems.push(`${item.name} (Need: ${item.needed}${unit}, Stock: ${currentStock}${unit})`);
              } else {
                let remainingNeeded = item.needed;
                const batches = Array.isArray(data.stockBatches) ? [...data.stockBatches] : [];

                batches.sort((a, b) => {
                  const dateA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
                  const dateB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
                  return dateA - dateB;
                });

                const updatedBatches = batches.map(batch => {
                  if (remainingNeeded <= 0) return batch;

                  let batchQty = parseFloat(batch.quantity) || 0;
                  if (batchQty > 0) {
                    if (batchQty >= remainingNeeded) {
                      batch.quantity = batchQty - remainingNeeded;
                      remainingNeeded = 0;
                    } else {
                      remainingNeeded -= batchQty;
                      batch.quantity = 0;
                    }
                  }
                  return batch;
                });

                stockUpdates.push({ 
                  ref: item.ref, 
                  newQty: currentStock - item.needed,
                  newBatches: updatedBatches
                });
              }
            }
          }

          if (outOfStockItems.length > 0) {
            throw new Error(`OUT_OF_STOCK|${outOfStockItems.join(" | ")}`);
          }

          const orderDocRef = doc(collection(db, "orders"));
          transaction.set(orderDocRef, orderPayload);
          
          for (const update of stockUpdates) {
            transaction.update(update.ref, { 
              quantity: update.newQty,
              stockBatches: update.newBatches
            });
          }
        });
      }

      // Log the sale transaction to activity_logs
      await logSaleTransaction(
        {
          uid: user?.uid || "unknown",
          email: user?.email || undefined,
          name: user?.displayName || undefined,
        },
        transactionNumber,
        orderItems as any,
        total,
        paymentMethod,
        bulkDiscount !== "None" ? {
          type: bulkDiscount,
          amount: discountAmount,
          percentage: bulkDiscount === "5%" ? 5 : 10,
        } : undefined
      );

      setLastTransaction({
  number: transactionNumber,
  method: paymentMethod,
  total,
  discountAmount,
  amountTendered: paymentMethod === "Cash" ? amountTendered : "",
  nonCashSenderName: paymentMethod === "Non Cash" ? senderName : undefined,
  nonCashNumber: paymentMethod === "Non Cash" ? senderNumber : undefined,
  items: orderItems,
  subtotal: subtotal,
  discount: bulkDiscount !== "None" ? {
    type: bulkDiscount,
    amount: discountAmount
  } : undefined
});
      
      updateActiveTabOrderItems([]);
      updateActiveTabBulkDiscount("None");
      setAmountTendered("");
      setCashModal(false);
      setNonCashModal(false);
      setNonCashName("");
      setNonCashNumber("");
      setCheckoutMessage(null);
      setIsSuccessModalOpen(true);
    } catch (error: any) {
      console.error("Checkout failed:", error);
      if (error.message?.includes("OUT_OF_STOCK")) {
        const missingItems = error.message.split("|")[1].split(" | ").join("\n• ");
        setCheckoutMessage(`Checkout failed. Not enough stock:\n• ${missingItems}`);
      } else if (error.message?.includes("DB_MISSING")) {
        const missingItems = error.message.split("|")[1];
        setCheckoutMessage(`Database mismatch! Please check spelling in inventory, missing:\n• ${missingItems}`);
      } else {
        setCheckoutMessage("Checkout failed. Please check your connection or try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const activeOptStyle = { background: "#3b2212", color: "white" };
  const inactiveOptStyle = { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" };

  const getCardColors = (category: string) => {
    const parts = category.split(" · ");
    const topLevel = parts[0];
    const sub = parts[1];
    
    if (dynamicItemColors[category]) {
      return {
        bg: dynamicItemColors[category].bg,
        hoverBg: dynamicItemColors[category].bg,
        activeBg: dynamicItemColors[category].activeBg,
        text: dynamicItemColors[category].text,
      };
    }
    
    if (topLevel === "Frappe" && sub && frappeSubColors[sub]) {
      return frappeSubColors[sub];
    }
    return categoryColors[topLevel] ?? { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
  };

  const baseCategory = selectedProductCategory ? selectedProductCategory.split(" · ")[0] : "";
  const allowedAddOns = CATEGORY_ADD_ONS[baseCategory] || [];

  const handleSaveRecipe = async (itemName: string, sizes: Record<string, Record<string, number>>) => {
    try {
      const slug = itemName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      // Find which category this item belongs to — check all products including hardcoded
      const allCats = Object.keys(allProducts);
      let categoryName = "";
      for (const cat of allCats) {
        if (allProducts[cat]?.includes(itemName)) {
          categoryName = cat;
          break;
        }
      }
      if (!categoryName) throw new Error("Category not found for: " + itemName);

      const catQuery = query(collection(db, "categories"), where("name", "==", categoryName));
      const catSnap = await getDocs(catQuery);
      if (catSnap.empty) throw new Error("Category doc not found");

      const categoryDocId = catSnap.docs[0].id;
      const menuItemRef = doc(db, "categories", categoryDocId, "menuItems", slug);
      await updateDoc(menuItemRef, {
        recipes: sizes,
        hasRecipes: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to save recipe:", err);
      throw err;
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Redirecting to login...</div>;

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "#ede8e3" }}>
      {/* Left Panel - Product Selection with Tabs */}
      <div className="flex-1 flex flex-col h-full min-w-0" style={{ background: "#ede8e3" }}>
        {/* Tab Bar - FIXED at top */}
        <div className="flex-shrink-0 px-5 pt-5 pb-2">
          <div className="flex justify-between items-center mb-2">
            <div 
              ref={tabsContainerRef}
              className="flex items-center gap-1 pb-2 overflow-x-auto flex-1"
              style={{ 
                borderBottom: "2px solid #e8ddd4",
                scrollbarWidth: "thin",
              }}
            >
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`group flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all shrink-0 ${
                    activeTabId === tab.id 
                      ? "bg-[#3b2212] text-white shadow-sm" 
                      : "bg-white text-[#6b4c30] border border-[#e8ddd4] hover:bg-[#f5efe8]"
                  }`}
                >
                  {editingTabId === tab.id ? (
                    <input
                      type="text"
                      value={editingTabName}
                      onChange={(e) => setEditingTabName(e.target.value)}
                      onBlur={saveTabName}
                      onKeyDown={handleTabNameKeyDown}
                      className="text-sm font-medium bg-transparent outline-none border-b-2 border-white px-1 min-w-[80px] text-white"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className="text-sm font-medium truncate" style={{ maxWidth: "100px" }}>
                        {tab.name}
                      </span>
                      {tab.orderItems.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                          activeTabId === tab.id 
                            ? "bg-white text-[#3b2212]" 
                            : "bg-[#3b2212] text-white"
                        }`}>
                          {tab.orderItems.length}
                        </span>
                      )}
                      <button
                        onClick={(e) => startEditingTabName(tab.id, tab.name, e)}
                        className="opacity-0 group-hover:opacity-100 text-xs px-1 hover:bg-black/10 rounded transition-all shrink-0 min-h-[30px]"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => closeTab(tab.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-xs px-1 hover:bg-black/10 rounded transition-all shrink-0 min-h-[30px]"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              ))}
              
              <button
                onClick={createNewTab}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[#e8e0d8] border border-[#e8ddd4] bg-white whitespace-nowrap min-h-[44px]"
                style={{ color: "#5a3d28" }}
                title="New customer tab"
              >
                + New Tab
              </button>
            </div>
            
            {(userRole === "admin" || userRole === "manager") && (
            <button
              onClick={() => setIsManageModalOpen(true)}
              className="shrink-0 ml-3 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[#e8e0d8] border border-[#e8ddd4] bg-white whitespace-nowrap flex items-center gap-2 min-h-[44px]"
              style={{ color: "#5a3d28" }}
              title="Manage Categories & Items"
            >
              <img 
                src="/settings.png" 
                alt="Menu Icon" 
                className="w-5 h-5"
              />
              Manage Menu
            </button>
            )}

            <button
              onClick={() => setIsGenerateReportModalOpen(true)}
              className="shrink-0 ml-3 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[#e8e0d8] border border-[#e8ddd4] bg-white whitespace-nowrap flex items-center gap-2 min-h-[44px]"
              style={{ color: "#5a3d28" }}
              title="Generate Sales Report"
            >
              
              Generate Report
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* Search Bar */}
          <div className="relative mb-5">
            <span className="absolute left-4 top-1/2 -translate-y-1/2">🔎︎</span>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl px-4 py-4 pl-11 text-base outline-none min-h-[48px]"
              style={{ background: "white", border: "1.5px solid #e8ddd4", color: "#3b2212" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-base w-10 h-10 flex items-center justify-center rounded-full active:scale-95 touch-manipulation"
                style={{ color: "#a07850", minHeight: "40px" }}>
                ✕
              </button>
            )}
          </div>

          {isSearching ? (
            <>
              <p className="text-sm mb-3" style={{ color: "#a07850" }}>
                {searchResults.length > 0
                  ? `${searchResults.length} result${searchResults.length > 1 ? "s" : ""} for "${searchQuery}"`
                  : `No results for "${searchQuery}"`}
              </p>
              <div className="grid grid-cols-4 gap-4">
                {searchResults.map((entry, i) => {
                  const colors = getCardColors(entry.category);
                  const stockStatus = getItemStockStatus(entry.name, entry.category);
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setSelectedProduct(entry.name);
                        setSelectedProductIsFood(checkIsFood(entry.name));
                        setSelectedProductCategory(entry.category);
                      }}
                      className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1 min-h-[100px]"
                      style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}` }}
                    >
                      <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{entry.name}</p>
                      {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                      {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                      {stockStatus === "No Ingredients" && <p className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>(no ingredients applied)</p>}
                      <p className="text-xs text-center font-medium mt-1" style={{ color: colors.text }}>{entry.category}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                {sortedAllCategories.map((cat) => {
                  const colors = categoryColors[cat] || { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setActiveFrappeType(null); setActiveFoodSubCategory("All"); }}
                      className="px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px]"
                      style={{
                        fontSize: "18px",
                        background: activeCategory === cat ? colors.activeBg : colors.bg,
                        color: activeCategory === cat ? "white" : colors.text,
                        border: activeCategory === cat ? "none" : "1.5px solid #e8ddd4",
                        boxShadow: activeCategory === cat ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {activeCategory === "Frappe" && (
                <div className="flex gap-2 mb-5 p-3 rounded-xl flex-wrap" style={{ background: "#ede4db" }}>
                  {sortedFrappeTypes.map((type) => {
                    const fc = frappeSubColors[type] ?? { bg: "#faf7f4", hoverBg: "#f0e8e0", activeBg: "#3b2212", text: "#3b2212" };
                    const isActive = activeFrappeType === type;
                    return (
                      <button key={type}
                        onClick={() => setActiveFrappeType(type)}
                        className="px-5 py-3 rounded-lg font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px]"
                        style={{
                          fontSize: "16px",
                          background: isActive ? fc.activeBg : fc.bg,
                          color: isActive ? "white" : fc.text,
                          border: isActive ? "none" : `1.5px solid ${fc.hoverBg}`,
                          boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
                        }}>
                        {type}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeCategory === "Food & Bites" && (
                <div className="flex gap-2 mb-5 p-3 rounded-xl flex-wrap" style={{ background: "#ede4db" }}>
                  {sortedFoodSubCategories.map((sub) => (
                    <button key={sub}
                      onClick={() => setActiveFoodSubCategory(sub)}
                      className="px-5 py-3 rounded-lg font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px]"
                      style={{ fontSize: "16px", ...(activeFoodSubCategory === sub ? activeOptStyle : inactiveOptStyle) }}>
                      {sub}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 gap-4">
                {activeCategory !== "Frappe" && activeCategory !== "Food & Bites" &&
                  allProducts[activeCategory]?.map((item, i) => {
                    const colors = categoryColors[activeCategory] ?? { bg: "#f5f5f5", hoverBg: "#eeeeee", activeBg: "#3b2212", text: "#6b4c30" };
                    const itemColors = dynamicItemColors[item];
                    const cardColors = itemColors || colors;
                    const stockStatus = getItemStockStatus(item, activeCategory);
                    
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(false);
                        setSelectedProductCategory(activeCategory);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1 min-h-[100px]"
                        style={{ background: cardColors.bg, border: `1.5px solid ${cardColors.hoverBg || colors.hoverBg}` }}>
                        <p className="font-normal text-center" style={{ color: cardColors.activeBg, fontSize: "18px" }}>{item}</p>
                        {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                        {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                        {stockStatus === "No Ingredients" && <p className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>(no ingredients applied)</p>}
                      </div>
                    );
                  })}

                {activeCategory === "Frappe" && activeFrappeType &&
                  frappeProducts[activeFrappeType as keyof typeof frappeProducts]?.map((item, i) => {
                    const colors = frappeSubColors[activeFrappeType] ?? categoryColors["Frappe"];
                    const stockStatus = getItemStockStatus(item, `Frappe · ${activeFrappeType}`);
                    
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(false);
                        setSelectedProductCategory(`Frappe · ${activeFrappeType}`);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1 min-h-[100px]"
                        style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}` }}>
                        <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{item}</p>
                        {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                        {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                        {stockStatus === "No Ingredients" && <p className="text-[10px] font-medium mt-0.5" style={{ color: "#9ca3af" }}>(no ingredients applied)</p>}
                      </div>
                    );
                  })}

                {activeCategory === "Food & Bites" && activeFoodSubCategory &&
                  (activeFoodSubCategory === "All"
                    ? Object.values(foodProducts).flat()
                    : foodProducts[activeFoodSubCategory]
                  )?.map((item, i) => {
                    const colors = categoryColors["Food & Bites"];
                    const stockStatus = getItemStockStatus(item, `Food & Bites · ${activeFoodSubCategory}`);
                    
                    return (
                      <div key={i} onClick={() => {
                        setSelectedProduct(item);
                        setSelectedProductIsFood(true);
                        const sub = activeFoodSubCategory === "All"
                          ? Object.entries(foodProducts).find(([, items]) => items.includes(item))?.[0] ?? "Food & Bites"
                          : activeFoodSubCategory;
                        setSelectedProductCategory(`Food & Bites · ${sub}`);
                      }}
                        className="rounded-2xl p-5 cursor-pointer transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1 min-h-[100px]"
                        style={{ background: colors.bg, border: `1.5px solid ${colors.hoverBg}` }}>
                        <p className="font-normal text-center" style={{ color: colors.activeBg, fontSize: "18px" }}>{item}</p>
                        {stockStatus === "Not Available" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#c0392b" }}>(Not Available)</p>}
                        {stockStatus === "Low Stock" && <p className="text-[11px] font-bold mt-0.5" style={{ color: "#d35400" }}>(Low Stock)</p>}
                        {item === "Quesadillas" && <p className="text-xs" style={{ color: colors.text }}>Beef / Cheese</p>}
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Panel - Order Panel */}
      <div className="w-96 flex flex-col h-full overflow-y-hidden"
        style={{ background: "white", borderLeft: "1.5px solid #e8ddd4" }}>
        
        <div className="flex-1 flex flex-col overflow-hidden p-5">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-2xl font-bold" style={{ color: "#3b2212" }}>Order</h2>
            {orderItems.length > 0 && (
              <span className="text-xs px-2 py-1 rounded-full font-normal"
                style={{ background: "#3b2212", color: "white" }}>{orderItems.length}</span>
            )}
          </div>

          {orderItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-6xl mb-3 opacity-20">🛒</div>
              <p className="text-sm" style={{ color: "#b09070" }}>No items added yet</p>
              <p className="text-xs mt-2" style={{ color: "#c0b090" }}>Current: {activeTab?.name}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0" style={{ WebkitOverflowScrolling: "touch" }}>
              {orderItems.map((item, index) => {
  const addOnsTotal = (item.addOns?.length || 0) * ADD_ON_PRICE;
  const itemTotal = (item.price + addOnsTotal) * item.quantity;
  const discountedTotal = (item.discountType === "PWD" || item.discountType === "Senior") 
    ? itemTotal * 0.8 
    : itemTotal;
  const discountApplied = item.discountType !== "None";  // ← ADD THIS LINE
  
  return (
                
                  <div key={index} className="p-3 relative" style={{ borderBottom: "0.5px solid #e8ddd4" }}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-base" style={{ color: "#3b2212" }}>{item.name}</p>
                        {item.category && !item.category.includes("Food & Bites") && (
                          <p className="text-xs mt-0.5 font-medium" style={{ color: "#3b2212", opacity: 0.5 }}>{item.category}</p>
                        )}
                        {(item.temperature || item.size || item.sugar) && (
                          <p className="text-xs mt-0.5" style={{ color: "#a07850" }}>
                            {[item.temperature, item.size, item.sugar && `Sugar ${item.sugar}`].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {item.addOns && item.addOns.length > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: "#5a8a5a" }}>+ {item.addOns.join(", ")}</p>
                        )}
                        {discountApplied && (
                          <p className="text-xs mt-1 font-semibold" style={{ color: "#2d7a38" }}>
                            {item.discountType} Discount Applied
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-2">
                        <div className="text-right">
                          {discountApplied ? (
                            <>
                              <p className="text-xs line-through" style={{ color: "#a07850" }}>₱{itemTotal.toFixed(0)}</p>
                              <p className="font-semibold text-base" style={{ color: "#2d7a38" }}>₱{discountedTotal.toFixed(0)}</p>
                            </>
                          ) : (
                            <p className="font-normal text-base" style={{ color: "#3b2212" }}>₱{itemTotal.toFixed(0)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => handleDecreaseQty(index)}
                            className="w-12 h-12 rounded-full flex items-center justify-center font-bold active:scale-95 touch-manipulation min-h-[44px]"
                            style={{ background: "#f0e8e0", color: "#3b2212", fontSize: "20px" }}>−</button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={qtyInputs[index] !== undefined ? qtyInputs[index] : String(item.quantity)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setQtyInputs(prev => ({ ...prev, [index]: raw }));
                              const val = parseInt(raw);
                              if (!isNaN(val) && val >= 1) {
                                const newOrderItems = orderItems.map((o, i) => i === index ? { ...o, quantity: val } : o);
                                updateActiveTabOrderItems(newOrderItems);
                              }
                            }}
                            onBlur={() => {
                              const raw = qtyInputs[index];
                              const val = parseInt(raw);
                              if (!raw || isNaN(val) || val < 1) {
                                const newOrderItems = orderItems.map((o, i) => i === index ? { ...o, quantity: 1 } : o);
                                updateActiveTabOrderItems(newOrderItems);
                              }
                              setQtyInputs(prev => { const next = { ...prev }; delete next[index]; return next; });
                            }}
                            className="text-lg font-semibold text-center outline-none rounded-lg min-h-[44px]"
                            style={{ width: "65px", color: "#3b2212", background: "#faf7f4", border: "1.5px solid #e8ddd4", padding: "8px 4px" }}
                          />
                          <button onClick={() => handleIncreaseQty(index)}
                            className="w-12 h-12 rounded-full flex items-center justify-center font-bold active:scale-95 touch-manipulation min-h-[44px]"
                            style={{ background: "#3b2212", color: "white", fontSize: "20px" }}>+</button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDiscountModalItem({ index, item })}
                            className={`text-sm rounded-lg px-4 py-2 font-semibold transition-all active:scale-95 touch-manipulation min-h-[40px] ${
                              discountApplied ? "bg-[#2d7a38] text-white" : "bg-[#f0e8e0] text-[#3b2212]"
                            }`}
                          >
                            {discountApplied ? "✎ Discount" : "Add Discount"}
                          </button>
                          <button onClick={() => handleRemoveItem(index)}
                            className="text-sm rounded-full w-10 h-10 flex items-center justify-center active:scale-95 touch-manipulation min-h-[40px]"
                            style={{ background: "#fee2e2", color: "#c0392b" }}>✕</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {orderItems.length > 0 && (
            <div className="py-4 space-y-2 mt-2" style={{ borderTop: "1.5px solid #e8ddd4" }}>
              
             <div className="mb-1">
  <p className="text-xs mb-2" style={{ color: "#a07850" }}>Discount Options (tap to apply, tap again to remove)</p>
  <div className="flex gap-2">
    <button
      onClick={() => {
        if (bulkDiscount === "5%") {
          updateActiveTabBulkDiscount("None");
        } else {
          updateActiveTabBulkDiscount("5%");
        }
      }}
      className="flex-1 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px] text-sm"
      style={bulkDiscount === "5%"
        ? { background: "#3b2212", color: "white", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }
        : { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
      5%
    </button>
    <button
      onClick={() => {
        if (bulkDiscount === "10%") {
          updateActiveTabBulkDiscount("None");
        } else {
          updateActiveTabBulkDiscount("10%");
        }
      }}
      className="flex-1 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px] text-sm"
      style={bulkDiscount === "10%"
        ? { background: "#3b2212", color: "white", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }
        : { background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
      10%
    </button>
    <button
  onClick={() => {
    if (orderItems.length === 0) return;
    if ((bulkDiscount as string) === "PWD") {
      updateActiveTabBulkDiscount("None");
      const newOrderItems = orderItems.map(item => ({
        ...item,
        discountType: "None" as const,
        discountCustomerName: "",
        discountCustomerID: ""
      }));
      updateActiveTabOrderItems(newOrderItems);
    } else {
      if (bulkDiscount !== "None") {
        updateActiveTabBulkDiscount("None");
        const newOrderItems = orderItems.map(item => ({
          ...item,
          discountType: "None" as const,
          discountCustomerName: "",
          discountCustomerID: ""
        }));
        updateActiveTabOrderItems(newOrderItems);
      }
      setPwdModalOpen(true);
    }
  }}
  className="flex-1 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px] text-sm"
  style={{
    background: (bulkDiscount as string) === "PWD" ? "#2d7a38" : "#faf7f4",
    color: (bulkDiscount as string) === "PWD" ? "white" : "#3b2212",
    border: "1.5px solid #e8ddd4"
  }}
>
  PWD
</button>
    
    <button
  onClick={() => {
    if (orderItems.length === 0) return;
    if ((bulkDiscount as string) === "Senior") {
      // Turn off bulk Senior discount
      updateActiveTabBulkDiscount("None");
      // Remove Senior from all items
      const newOrderItems = orderItems.map(item => ({
        ...item,
        discountType: "None" as const,
        discountCustomerName: "",
        discountCustomerID: ""
      }));
      updateActiveTabOrderItems(newOrderItems);
    } else {
      // Turn off any existing bulk discount first
      if (bulkDiscount !== "None") {
        updateActiveTabBulkDiscount("None");
        // Remove any existing bulk discounts from items
        const newOrderItems = orderItems.map(item => ({
          ...item,
          discountType: "None" as const,
          discountCustomerName: "",
          discountCustomerID: ""
        }));
        updateActiveTabOrderItems(newOrderItems);
      }
      // Open Senior modal for bulk discount
      setSeniorModalOpen(true);
    }
  }}
  className="flex-1 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px] text-sm"
  style={{
    // ONLY check bulkDiscount, NOT item.discountType
    background: (bulkDiscount as string) === "Senior" ? "#e67e22" : "#faf7f4",
    color: (bulkDiscount as string) === "Senior" ? "white" : "#3b2212",
    border: "1.5px solid #e8ddd4"
  }}
>
  Senior
</button>
  </div>
</div>
              <div className="flex justify-between text-sm" style={{ color: "#a07850" }}>
                <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
              </div>
              {bulkDiscount !== "None" && (
                <div className="flex justify-between text-sm" style={{ color: "#2d7a38" }}>
                  <span>Bulk Discount ({bulkDiscount})</span>
                  <span>− ₱{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-normal text-base" style={{ color: "#3b2212" }}>
                <span>Total</span><span>₱{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2 mt-2">
            <button
              disabled={orderItems.length === 0 || isProcessing}
              onClick={() => { if (orderItems.length > 0 && !isProcessing) setConfirmModal({ open: true, method: "Cash" }); }}
              className="w-full py-4 rounded-xl font-normal transition-all active:scale-95 touch-manipulation min-h-[56px]"
              style={{ fontSize: "16px", ...(orderItems.length === 0 || isProcessing
                ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
                : { background: "#3b2212", color: "white" }) }}>
              Cash {orderItems.length > 0 && `— ₱${total.toFixed(2)}`}
            </button>

            <button
              disabled={orderItems.length === 0 || isProcessing}
              onClick={() => { if (orderItems.length > 0 && !isProcessing) setConfirmModal({ open: true, method: "Non Cash" }); }}
              className="w-full py-4 rounded-xl font-normal transition-all active:scale-95 touch-manipulation min-h-[56px]"
              style={{ fontSize: "16px", ...(orderItems.length === 0 || isProcessing
                ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
                : { background: "#0070ba", color: "white" }) }}>
              Non Cash {orderItems.length > 0 && `— ₱${total.toFixed(2)}`}
            </button>
          </div>

          {checkoutMessage && (
            <p className="text-center text-sm mt-2 p-3 rounded-lg" style={{ 
              background: checkoutMessage.includes("failed") || checkoutMessage.includes("mismatch") ? "#fff0f0" : "#f0faf0",
              color: checkoutMessage.includes("failed") || checkoutMessage.includes("mismatch") ? "#c0392b" : "#2d7a38",
              border: `1px solid ${checkoutMessage.includes("failed") || checkoutMessage.includes("mismatch") ? "#f5c6c6" : "#b6e2b6"}`
            }}>
              {checkoutMessage.split('\n').map((line, i) => (
                <span key={i} className="block text-left">{line}</span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* Individual Discount Modal (for per-item Add Discount) */}
      {discountModalItem && (
        <IndividualDiscountModal
          isOpen={true}
          onClose={() => setDiscountModalItem(null)}
          onApply={(discountType, name, id) => {
            updateItemDiscount(discountModalItem.index, discountType, name, id);
            setDiscountModalItem(null);
          }}
          itemName={discountModalItem.item.name}
          currentDiscount={{
            type: discountModalItem.item.discountType || "None",
            name: discountModalItem.item.discountCustomerName || "",
            id: discountModalItem.item.discountCustomerID || ""
          }}
        />
      )}

      {/* PWD Modal (for bulk PWD button) */}
      {pwdModalOpen && (
        <PWDDiscountModal
          isOpen={true}
          onClose={() => setPwdModalOpen(false)}
          onApply={(name, id) => {
            const newOrderItems = orderItems.map(item => ({
              ...item,
              discountType: "PWD" as const,
              discountCustomerName: name,
              discountCustomerID: id
            }));
            updateActiveTabOrderItems(newOrderItems as any);
            updateActiveTabBulkDiscount("None");
            setPwdModalOpen(false);
          }}
          itemName="ALL ITEMS"
          currentName={orderItems.length > 0 && orderItems[0].discountType === "PWD" ? orderItems[0].discountCustomerName || "" : ""}
          currentID={orderItems.length > 0 && orderItems[0].discountType === "PWD" ? orderItems[0].discountCustomerID || "" : ""}
        />
      )}

      {/* Senior Modal (for bulk Senior button) */}
      {seniorModalOpen && (
        <SeniorDiscountModal
          isOpen={true}
          onClose={() => setSeniorModalOpen(false)}
          onApply={(name, id) => {
            const newOrderItems = orderItems.map(item => ({
              ...item,
              discountType: "Senior" as const,
              discountCustomerName: name,
              discountCustomerID: id
            }));
            updateActiveTabOrderItems(newOrderItems as any);
            updateActiveTabBulkDiscount("None");
            setSeniorModalOpen(false);
          }}
          itemName="ALL ITEMS"
          currentName={orderItems.length > 0 && orderItems[0].discountType === "Senior" ? orderItems[0].discountCustomerName || "" : ""}
          currentID={orderItems.length > 0 && orderItems[0].discountType === "Senior" ? orderItems[0].discountCustomerID || "" : ""}
        />
      )}

      <ManageModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        onAddCategory={handleAddCategory}
        onAddItem={handleAddItem}
        onDeleteCategory={handleDeleteCategory}
        onDeleteItem={handleDeleteItem}
        categories={sortedAllCategories}
        itemsByCategory={allProducts}
        categoryColors={categoryColors}
        inventoryStock={inventoryStock}
        mergedRecipes={mergedRecipes}
        onSaveRecipe={handleSaveRecipe}
      />

      <GenerateReportModal
        isOpen={isGenerateReportModalOpen}
        onClose={() => setIsGenerateReportModalOpen(false)}
        dateFilter={reportDateFilter}
        onDateFilterChange={setReportDateFilter}
      />

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="bg-white rounded-3xl p-14 shadow-2xl mx-6 w-full max-w-2xl">
            <h2 className="text-4xl font-bold mb-3" style={{ color: "#3b2212" }}>Confirm Order</h2>
            <p className="text-xl mb-8" style={{ color: "#a07850" }}>
              Payment via <strong style={{ color: "#3b2212" }}>{confirmModal.method}</strong>
            </p>
            <div className="rounded-2xl p-7 mb-8" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4" }}>
              <div className="flex justify-between items-center">
                <span className="text-xl" style={{ color: "#a07850" }}>Total Amount</span>
                <span className="font-bold text-4xl" style={{ color: "#3b2212" }}>₱{total.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-5">
              <button
                onClick={() => setConfirmModal({ open: false, method: null })}
                className="flex-1 py-5 rounded-2xl font-bold text-xl active:scale-95 touch-manipulation min-h-[56px]"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmModal({ open: false, method: null });
                  if (confirmModal.method === "Cash") {
                    setCashModal(true);
                  } else if (confirmModal.method === "Non Cash") {
                    setNonCashModal(true);
                  }
                }}
                className="flex-1 py-5 rounded-2xl font-bold text-xl text-white active:scale-95 touch-manipulation min-h-[56px]"
                style={{ background: confirmModal.method === "Cash" ? "#3b2212" : "#0070ba" }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Tendered Modal with improved tablet support */}
      {cashModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
          <div className={`bg-white rounded-3xl p-6 shadow-2xl w-full max-w-xl ${isLandscape ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#3b2212" }}>Cash Payment</h2>
            <div className="rounded-2xl p-4 mb-4" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4" }}>
              <div className="flex justify-between items-center">
                <span className="text-base" style={{ color: "#a07850" }}>Total Due</span>
                <span className="font-bold text-2xl" style={{ color: "#3b2212" }}>₱{total.toFixed(2)}</span>
              </div>
            </div>
            
            {/* Amount display with larger touch area */}
            <div 
              className="rounded-2xl px-5 py-4 mb-4 text-right min-h-[80px]"
              style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4" }}
            >
              <p className="text-xs mb-1" style={{ color: "#a07850" }}>Amount Received</p>
              <p className="font-bold" style={{ color: amountTendered ? "#3b2212" : "#c0b090", fontSize: "2rem", lineHeight: 1 }}>
                {amountTendered ? `₱${amountTendered}` : "₱0"}
              </p>
            </div>
            
            {/* Numeric keypad with larger buttons for tablet */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {["7","8","9","4","5","6","1","2","3"].map((num) => (
                <button key={num}
                  onClick={() => setAmountTendered(prev => prev === "0" ? num : prev + num)}
                  className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[64px]"
                  style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>
                  {num}
                </button>
              ))}
              <button
                onClick={() => setAmountTendered(prev => prev.endsWith(".") ? prev : prev.includes(".") ? prev : prev + ".")}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[64px]"
                style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>.</button>
              <button
                onClick={() => setAmountTendered(prev => prev === "0" ? "0" : prev + "0")}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[64px]"
                style={{ background: "#faf7f4", color: "#3b2212", border: "1.5px solid #e8ddd4" }}>0</button>
              <button
                onClick={() => setAmountTendered(prev => prev.length <= 1 ? "" : prev.slice(0, -1))}
                className="py-5 rounded-2xl font-bold text-2xl transition-all active:scale-95 touch-manipulation min-h-[64px]"
                style={{ background: "#fee2e2", color: "#c0392b", border: "1.5px solid #f5c6c6" }}>⌫</button>
            </div>
            
            {amountTendered && parseFloat(amountTendered) >= total && (
              <div className="rounded-2xl p-4 mb-4" style={{ background: "#f0faf0", border: "1.5px solid #b6e2b6" }}>
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold" style={{ color: "#2d7a38" }}>Change</span>
                  <strong className="text-3xl" style={{ color: "#2d7a38" }}>₱{(parseFloat(amountTendered) - total).toFixed(2)}</strong>
                </div>
              </div>
            )}
            {amountTendered && parseFloat(amountTendered) < total && (
              <div className="rounded-2xl p-3 mb-4" style={{ background: "#fff0f0", border: "1.5px solid #f5c6c6" }}>
                <span className="text-lg font-semibold" style={{ color: "#c0392b" }}>Insufficient amount</span>
              </div>
            )}
            
            <div className="flex gap-4">
              <button
                onClick={() => { setCashModal(false); setAmountTendered(""); }}
                className="flex-1 py-4 rounded-2xl font-bold text-lg active:scale-95 touch-manipulation min-h-[56px]"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>Cancel</button>
              <button
                disabled={!amountTendered || parseFloat(amountTendered) < total || isProcessing}
                onClick={() => processCheckout("Cash")}
                className="flex-1 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 touch-manipulation min-h-[56px]"
                style={{
                  background: !amountTendered || parseFloat(amountTendered) < total || isProcessing ? "#e8e0d8" : "#3b2212",
                  color: !amountTendered || parseFloat(amountTendered) < total || isProcessing ? "#b09070" : "white",
                  cursor: !amountTendered || parseFloat(amountTendered) < total || isProcessing ? "not-allowed" : "pointer",
                }}>
                {isProcessing ? (
                  <>
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Processing...
                  </>
                ) : "Confirm Cash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non Cash Payment Modal - Simplified with native keyboards */}
      {nonCashModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
          <div className={`bg-white rounded-3xl p-6 shadow-2xl w-full max-w-2xl ${isLandscape ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "#0070ba" }}>Non Cash Payment</h2>
            <p className="text-sm mb-5" style={{ color: "#a07850" }}>
              Enter the customer's name and payment reference number.
            </p>

            <div className="rounded-2xl p-4 mb-5" style={{ background: "#f0f7ff", border: "1.5px solid #b3d9f7" }}>
              <div className="flex justify-between items-center">
                <span className="text-base" style={{ color: "#0070ba" }}>Total Due</span>
                <span className="font-bold text-2xl" style={{ color: "#0070ba" }}>₱{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-4">
              {/* Left Column - Customer Name - uses native keyboard */}
              <div>
                <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                  Customer Name <span style={{ color: "#c0392b" }}>*</span>
                </label>
                <input
                  type="text"
                  value={nonCashName}
                  onChange={(e) => setNonCashName(e.target.value.slice(0, 50))}
                  maxLength={50}
                  className="w-full rounded-xl px-4 py-3 text-base outline-none min-h-[52px]"
                  style={{
                    background: "#f0f7ff",
                    border: "1.5px solid #b3d9f7",
                    color: "#0070ba",
                  }}
                  placeholder="Enter customer name"
                />
              </div>

              {/* Right Column - Reference Number - uses native keyboard */}
              <div>
                <label className="text-sm font-semibold block mb-2" style={{ color: "#3b2212" }}>
                  Reference Number <span style={{ color: "#c0392b" }}>*</span>
                </label>
                <input
                  type="text"
                  value={nonCashNumber}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 25);
                    setNonCashNumber(val);
                  }}
                  maxLength={25}
                  className="w-full rounded-xl px-4 py-3 text-base font-mono font-bold outline-none min-h-[52px]"
                  style={{
                    background: "#f0f7ff",
                    border: nonCashNumber.length >= 10 && nonCashNumber.length <= 25 ? "2px solid #0070ba" : "1.5px solid #b3d9f7",
                    color: "#0070ba",
                  }}
                  placeholder="Enter reference number"
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs" style={{ color: nonCashNumber.length >= 10 && nonCashNumber.length <= 25 ? "#2d7a38" : "#c0b090" }}>
                    {nonCashNumber.length >= 10 && nonCashNumber.length <= 25 ? "✓ Valid" : nonCashNumber.length > 25 ? "Maximum 25 characters" : "10-25 characters required"}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: nonCashNumber.length >= 10 && nonCashNumber.length <= 25 ? "#0070ba" : "#c0b090" }}>
                    {nonCashNumber.length}/25
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => { setNonCashModal(false); setNonCashName(""); setNonCashNumber(""); }}
                className="flex-1 py-4 rounded-xl font-bold text-lg active:scale-95 touch-manipulation min-h-[56px]"
                style={{ background: "#f0e8e0", color: "#3b2212" }}>
                Cancel
              </button>
              <button
                disabled={nonCashNumber.length < 10 || nonCashNumber.length > 25 || !nonCashName.trim() || isProcessing}
                onClick={() => processCheckout("Non Cash", nonCashNumber.trim(), nonCashName.trim())}
                className="flex-1 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 active:scale-95 touch-manipulation min-h-[56px]"
                style={{
                  background: nonCashNumber.length < 10 || nonCashNumber.length > 25 || !nonCashName.trim() || isProcessing ? "#e8e0d8" : "#0070ba",
                  color: nonCashNumber.length < 10 || nonCashNumber.length > 25 || !nonCashName.trim() || isProcessing ? "#b09070" : "white",
                  cursor: nonCashNumber.length < 10 || nonCashNumber.length > 25 || !nonCashName.trim() || isProcessing ? "not-allowed" : "pointer",
                }}>
                {isProcessing ? (
                  <>
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Processing...
                  </>
                ) : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal with Print Button */}
      {isSuccessModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
          <div className={`bg-white rounded-3xl p-8 shadow-2xl text-center w-full max-w-2xl ${isLandscape ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
            <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white text-3xl mx-auto mb-4">
              ✓
            </div>
            <h2 className="text-3xl font-bold mb-6" style={{ color: "#3b2212" }}>Order Completed!</h2>
            {lastTransaction && (
              <div className="rounded-2xl p-6 mb-6 text-left space-y-4" style={{ background: "#faf7f4", border: "1.5px solid #e8ddd4" }}>
                <div className="flex justify-between items-center">
                  <span className="text-base" style={{ color: "#a07850" }}>Transaction No.</span>
                  <span className="font-bold text-base" style={{ color: "#3b2212" }}>{lastTransaction.number}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-base" style={{ color: "#a07850" }}>Payment Method</span>
                  <span className="font-bold text-base" style={{ color: "#3b2212" }}>{lastTransaction.method}</span>
                </div>
                {lastTransaction.method === "Non Cash" && (lastTransaction.nonCashSenderName || lastTransaction.nonCashNumber) && (
                  <div className="rounded-2xl p-4 space-y-3"
                    style={{ background: "#f0f7ff", border: "1.5px solid #b3d9f7" }}>
                    {lastTransaction.nonCashSenderName && (
                      <div className="flex justify-between items-center">
                        <span className="text-base" style={{ color: "#0070ba" }}>Customer Name</span>
                        <span className="font-bold text-base" style={{ color: "#0070ba" }}>
                          {lastTransaction.nonCashSenderName}
                        </span>
                      </div>
                    )}
                    {lastTransaction.nonCashNumber && (
                      <div className="flex justify-between items-center">
                        <span className="text-base" style={{ color: "#0070ba" }}>Reference Number</span>
                        <span className="font-bold text-base tracking-widest" style={{ color: "#0070ba" }}>
                          {lastTransaction.nonCashNumber}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center" style={{ borderTop: "1.5px solid #e8ddd4", paddingTop: "16px" }}>
                  <span className="text-base" style={{ color: "#a07850" }}>Total Paid</span>
                  <span className="font-bold text-2xl" style={{ color: "#3b2212" }}>₱{lastTransaction.total.toFixed(2)}</span>
                </div>
                {lastTransaction.method === "Cash" && lastTransaction.amountTendered && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-base" style={{ color: "#a07850" }}>Amount Received</span>
                      <span className="font-bold text-xl" style={{ color: "#3b2212" }}>₱{parseFloat(lastTransaction.amountTendered).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center rounded-2xl p-4" style={{ background: "#f0faf0" }}>
                      <span className="text-lg font-semibold" style={{ color: "#2d7a38" }}>Change</span>
                      <span className="font-bold text-2xl" style={{ color: "#2d7a38" }}>₱{(parseFloat(lastTransaction.amountTendered) - lastTransaction.total).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* SIDE-BY-SIDE BUTTONS */}
            <div className="flex gap-4" style={{ flexDirection: isLandscape ? 'row' : 'column' }}>
              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (printWindow && lastTransaction) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Receipt - ${lastTransaction.number}</title>
                          <style>
                            * { margin: 0; padding: 0; box-sizing: border-box; }
                            body { 
                              font-family: monospace; 
                              padding: 20px; 
                              display: flex; 
                              justify-content: center; 
                              background: white;
                            }
                            @media print {
                              body { padding: 0; }
                            }
                          </style>
                        </head>
                        <body>
                          ${getReceiptHTML(lastTransaction)}
                          <script>
                            window.onload = function() {
                              window.print();
                              window.onafterprint = function() { window.close(); };
                            };
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }
                }}
                className="flex-1 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 touch-manipulation min-h-[56px]"
                style={{ background: "white", border: "1.5px solid #cbd5e1", color: "#1e293b" }}
              >
                Print
              </button>
              <button
                onClick={() => setIsSuccessModalOpen(false)}
                className="flex-1 py-4 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2 active:scale-95 touch-manipulation min-h-[56px]"
                style={{ background: "#3b2212" }}
              >
                New Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className={`rounded-3xl p-6 relative ${isLandscape ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}
            style={{ background: "white", border: "2px solid #e8ddd4", width: "fit-content", minWidth: "500px", maxWidth: "85vw" }}>
            <button
              className="absolute top-4 right-4 w-12 h-12 rounded-full flex items-center justify-center text-xl active:scale-95 touch-manipulation min-h-[44px]"
              style={{ background: "#f7f3ef", color: "#3b2212", border: "1px solid #e8ddd4" }}
              onClick={() => {
                setSelectedProduct(null);
                setSelectedAddOns([]);
                setSelectedVariant(null);
                setSelectedProductIsFood(false);
                setSelectedProductCategory("");
                setModalError(null);
              }}>✕</button>

            <h2 className="text-2xl font-bold mb-1 pr-10 text-center" style={{ color: "#3b2212" }}>{selectedProduct}</h2>
            {selectedProductCategory && (
              <p className="text-sm text-center mb-6" style={{ color: "#a07850" }}>{selectedProductCategory}</p>
            )}

            <div className="space-y-6">
              {selectedProduct === "Quesadillas" && (
                <div>
                  <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Choose Variant</p>
                  <div className="flex gap-4">
                    {quesadillasVariants.map((v) => (
                      <button key={v} onClick={() => setSelectedVariant(v)}
                        className="flex-1 px-4 py-4 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation flex flex-col items-center gap-1 min-h-[64px]"
                        style={selectedVariant === v ? activeOptStyle : inactiveOptStyle}>
                        <span style={{ fontSize: "16px" }}>{v}</span>
                        <span style={{ fontSize: "14px", opacity: 0.75 }}>₱{v === "Beef" ? "200" : "170"}</span>
                      </button>
                    ))}
                  </div>
                  {!selectedVariant && <p className="text-sm mt-2" style={{ color: "#c0392b" }}>Please select a variant.</p>}
                </div>
              )}

              {!isFood && (
                <div className="grid grid-cols-2 gap-6">
                  {!hideTemperature && (
                    <div>
                      <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Temperature</p>
                      <div className="flex gap-3">
                        {["Hot", "Ice"].map((t) => (
                          <button key={t} onClick={() => setTempOption(t)}
                            className="flex-1 px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px]"
                            style={{ fontSize: "16px", ...(tempOption === t ? activeOptStyle : inactiveOptStyle) }}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Size</p>
                    <div className="flex gap-3">
                      {(activeCategory === "Hot Tea" || selectedProductCategory === "Hot Tea" ? ["M - 220ml", "Pot"] : ["Medium", "Large"]).map((s) => (
                        <button key={s} onClick={() => setSizeOption(s)}
                          className="flex-1 px-5 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px]"
                          style={{ fontSize: "16px", ...(sizeOption === s ? activeOptStyle : inactiveOptStyle) }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!isFood && (
                <div>
                  <p className="font-semibold mb-3 text-base" style={{ color: "#3b2212" }}>Sugar Level</p>
                  <div className="flex gap-3">
                    {["0%", "50%", "75%", "100%"].map((sugar) => (
                      <button key={sugar} onClick={() => setSugarOption(sugar)}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[48px]"
                        style={{ fontSize: "16px", ...(sugarOption === sugar ? activeOptStyle : inactiveOptStyle) }}>
                        {sugar}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showAddOns && allowedAddOns.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="font-semibold text-base" style={{ color: "#3b2212" }}>
                      Add Ons <span style={{ color: "#a07850" }}>(+₱30 each)</span>
                    </p>
                    <button onClick={handleClearAddOns} className="text-sm underline py-2 px-3 rounded-lg active:scale-95 touch-manipulation min-h-[36px]" style={{ color: "#a07850" }}>Clear all</button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <button onClick={handleClearAddOns}
                      className="px-2 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation flex flex-col items-center justify-center gap-1 min-h-[56px]"
                      style={{ fontSize: "14px", ...(selectedAddOns.length === 0 ? activeOptStyle : inactiveOptStyle) }}>
                      <span>None</span>
                    </button>
                    {allowedAddOns.map((addOn) => {
                      const needed = ADD_ON_SERVING_SIZES[addOn] || 1;
                      const stockAvailable = inventoryStock[addOn]?.quantity || 0;
                      const reserved = alreadyInCartReserved[addOn] || 0;
                      const isOOS = (stockAvailable - reserved) < needed;
                      const isSelected = selectedAddOns.includes(addOn);

                      return (
                        <button 
                          key={addOn} 
                          disabled={isOOS}
                          onClick={() => handleToggleAddOn(addOn)}
                          className="px-2 py-3 rounded-xl font-semibold transition-all touch-manipulation flex flex-col items-center justify-center gap-1 min-h-[56px]"
                          style={{
                            ...(isOOS
                              ? { background: "#f5f5f5", color: "#c0b090", border: "1.5px solid #e8ddd4", cursor: "not-allowed", opacity: 0.7 }
                              : isSelected ? activeOptStyle : inactiveOptStyle)
                          }}>
                          <span style={{ fontSize: "14px" }}>{addOn}</span>
                          {isOOS && <span style={{ fontSize: "10px", color: "#c0392b" }}>(Not Available)</span>}
                        </button>
                      );
                    })}
                  </div>
                  {selectedAddOns.length > 0 && (
                    <div className="mt-4 p-4 rounded-xl text-sm" style={{ background: "#faf7f4", color: "#6b4c30" }}>
                      <span className="font-semibold">Selected:</span> {selectedAddOns.join(", ")}
                      <span className="ml-2 font-semibold" style={{ color: "#a07850" }}>+₱{(selectedAddOns.length * ADD_ON_PRICE).toFixed(0)}</span>
                    </div>
                  )}
                </div>
              )}

              {currentMissingIngredients.length > 0 && (
                 <div className="mt-2 mb-4 p-4 rounded-xl border" 
                 style={{ background: "#fff0f0", borderColor: "#f5c6c6", color: "#c0392b" }}>
                 <p className="text-sm font-bold mb-2">Item Unavailable. Missing Ingredients:</p>
                 <ul className="text-xs list-disc pl-5 space-y-1">
                   {currentMissingIngredients.map((err, idx) => (
                     <li key={idx}>{err}</li>
                   ))}
                 </ul>
               </div>
              )}

              <button
                disabled={(selectedProduct === "Quesadillas" && !selectedVariant) || currentMissingIngredients.length > 0}
                onClick={handleAddToOrder}
                className="w-full py-4 rounded-xl font-semibold text-lg transition-all active:scale-95 touch-manipulation mt-4 min-h-[56px]"
                style={
                  currentMissingIngredients.length > 0 
                  ? { background: "#e8e0d8", color: "#c0392b", cursor: "not-allowed" } : 
                  (selectedProduct === "Quesadillas" && !selectedVariant)
                  ? { background: "#e8e0d8", color: "#b09070", cursor: "not-allowed" }
                  : { background: "#3b2212", color: "white" }}>
                {currentMissingIngredients.length > 0 ? "Not Available" : `Add to Order — ₱${modalPrice.toFixed(0)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}