"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { collection, query, orderBy, onSnapshot, runTransaction, doc, increment, getDocs, where, limit, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

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

interface OrderRecord {
  id: string;
  transactionNumber: string;
  createdAt: any;
  paymentMethod: string;
  totalAmount: number;
  baristaName: string;
  status?: string; 
  items: OrderItem[];
  discount?: {
    type: string;
    amount: number;
    percentage?: number;
    id?: string;
  };
  subtotal?: number;
  nonCashSenderName?: string;
  nonCashNumber?: string;
  amountTendered?: string;
}

// Price configuration for add-ons (for display calculations)
const ADD_ON_PRICES: Record<string, number> = {
  Pearl: 30,
  Nata: 30,
  Espresso: 30,
  "Coffee Jelly": 30,
  Oreo: 30,
  Caramel: 30,
  "Whip Cream": 30
};

// RECIPES for ingredient calculations (for refund inventory return)
const RECIPES: Record<string, Record<string, Record<string, number>>> = {
  "Milktea - Okinawa": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Okinawa Powder": 15 }, "Large": { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Okinawa Powder": 25 } },
  "Milktea - Dark Choco": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Dark Choco Powder": 20 }, "Large": { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Dark Choco Powder": 30 } },
  "Milktea - Strawberry": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Strawberry Powder": 20 }, "Large": { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Strawberry Powder": 30 } },
  "Milktea - Capuccino": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Cappuccino Powder": 20 }, "Large": { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Cappuccino Powder": 30 } },
  "Milktea - Wintermelon": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Wintermelon": 30 }, "Large": { "Assam Black Tea": 300, "Creamer": 30, "Wintermelon": 40 } },
  "Mocha": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20 }, "Large": { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 30 } },
  "Dark Mocha": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20, "Dark Chocolate Powder": 10 }, "Large": { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20, "Dark Chocolate Powder": 15 } },
  "Caramel": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 10, "Caramel Syrup": 30 }, "Large": { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20, "Caramel Syrup": 40 } },
  "Vanilla": { "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 20, "Water": 50 }, "Large": { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 30, "Water": 70 } },
  "Coffee Jelly": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 15 }, "Large": { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20 } },
  "Chocolate Chip": { "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 15, "Chocolate Syrup": 40, "Chocolate Chip": 10, "Water": 50 }, "Large": { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 25, "Chocolate Syrup": 50, "Chocolate Chip": 15, "Water": 70 } },
  "Yakult Mix - Strawberry": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Green Apple": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Blueberry": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Lychee": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Yakult Mix - Wintermelon": { "Medium": { "Cold Water": 80, "Syrup": 15, "Fructose": 20, "Yakult": 1 }, "Large": { "Cold Water": 175, "Syrup": 25, "Fructose": 30, "Yakult": 2 } },
  "Fruit Tea - Green Apple": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Blueberry": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Lychee": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Strawberry": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } },
  "Fruit Tea - Wintermelon": { "Medium": { "Jasmine Green Tea": 200, "Syrup": 40, "Fructose": 15 }, "Large": { "Jasmine Green Tea": 300, "Syrup": 60, "Fructose": 25 } }
};

const ADD_ON_SERVING_SIZES: Record<string, number> = {
  Pearl: 50, Nata: 40, Espresso: 30, "Coffee Jelly": 40, Oreo: 1, Caramel: 20, "Whip Cream": 20
};

// Helper function to generate receipt HTML for reprinting
const getReprintReceiptHTML = (order: OrderRecord) => {
  const now = new Date();
  const dateTime = order.createdAt ? new Date(order.createdAt.toDate()).toLocaleString() : now.toLocaleString();
  
  // Calculate subtotal from items
  const subtotal = order.subtotal || order.items.reduce((sum, item) => {
    const addOnsTotal = (item.addOns || []).reduce((total, addon) => total + (ADD_ON_PRICES[addon] || 0), 0);
    return sum + (item.price + addOnsTotal) * item.quantity;
  }, 0);
  
  const discountAmount = order.discount?.amount || 0;
  const totalPaid = order.totalAmount;
  
  return `
    <div style="font-family: monospace; max-width: 300px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0 0 5px 0; font-size: 16px;">Coffee and Tea Connection</h2>
        <p style="margin: 0; font-size: 11px;">Est. 2016</p>
        <p style="margin: 5px 0 0 0; font-size: 10px;">${dateTime}</p>
      </div>
      <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
        <span>Transaction No:</span>
        <span>${order.transactionNumber}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
        <span>Payment Method:</span>
        <span>${order.paymentMethod}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
        <span>Barista:</span>
        <span>${order.baristaName || 'Unknown'}</span>
      </div>
      ${order.paymentMethod === "Non Cash" && order.nonCashSenderName ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Customer Name:</span>
          <span>${order.nonCashSenderName}</span>
        </div>
      ` : ''}
      ${order.paymentMethod === "Non Cash" && order.nonCashNumber ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Reference No:</span>
          <span>${order.nonCashNumber}</span>
        </div>
      ` : ''}
      <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
      <div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">ORDER SUMMARY:</div>
      ${order.items.map(item => {
        const addOnsTotal = (item.addOns || []).reduce((total, addon) => total + (ADD_ON_PRICES[addon] || 0), 0);
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
                    const addonPrice = ADD_ON_PRICES[addon] || 0;
                    return `
                      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #2d7a38; margin-left: 10px;">
                        <span>    • ${addon}</span>
                        <span>₱${(addonPrice * item.quantity).toFixed(2)}</span>
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
      }).join('')}
      <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
        <span>Subtotal:</span>
        <span>₱${subtotal.toFixed(2)}</span>
      </div>
      ${discountAmount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px; color: #c0392b;">
          <span>Discount (${order.discount?.type || 'Discount'}):</span>
          <span>- ₱${discountAmount.toFixed(2)}</span>
        </div>
      ` : ''}
      <div style="border-top: 1px double #000; margin: 10px 0;"></div>
      <div style="display: flex; justify-content: space-between; margin: 5px 0; font-weight: bold; font-size: 14px;">
        <span>TOTAL PAID:</span>
        <span>₱${totalPaid.toFixed(2)}</span>
      </div>
      ${order.paymentMethod === "Cash" && order.amountTendered ? `
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Amount Received:</span>
          <span>₱${parseFloat(order.amountTendered).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-size: 12px;">
          <span>Change:</span>
          <span>₱${(parseFloat(order.amountTendered) - totalPaid).toFixed(2)}</span>
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

// Helper function to calculate item total with add-ons AND discounts
const calculateItemBreakdown = (item: OrderItem) => {
  const addOnsTotal = (item.addOns || []).reduce((total, addon) => {
    return total + (ADD_ON_PRICES[addon] || 0);
  }, 0);
  
  const itemOriginalTotal = (item.price + addOnsTotal) * item.quantity;
  
  // Check if item has individual discount (PWD/Senior)
  const hasDiscount = item.discountType && item.discountType !== "None";
  const discountedTotal = hasDiscount ? itemOriginalTotal * 0.8 : itemOriginalTotal;
  const discountAmount = hasDiscount ? itemOriginalTotal - discountedTotal : 0;
  
  return {
    basePrice: item.price,
    addOnsTotal,
    itemOriginalTotal,
    discountedTotal,
    discountAmount,
    hasDiscount,
    discountType: item.discountType || null,
    addOnsBreakdown: (item.addOns || []).map(addon => ({
      name: addon,
      price: ADD_ON_PRICES[addon] || 0
    }))
  };
};

export default function OrderHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("All"); 
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  
  const [orderToRefund, setOrderToRefund] = useState<OrderRecord | null>(null);
  const [orderToReprint, setOrderToReprint] = useState<OrderRecord | null>(null);
  const [refundSuccessMsg, setRefundSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
      return;
    }

    if (user) {
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderRecord));
        setOrders(records);
      }, (error) => {
        console.error("Error fetching orders:", error);
      });

      return () => unsubscribe();
    }
  }, [user, loading, router]);

  const executeRefund = async () => {
    if (!orderToRefund) return;
    
    setIsProcessing(orderToRefund.id);

    try {
      await runTransaction(db, async (t) => {
        const orderRef = doc(db, "orders", orderToRefund.id);
        t.update(orderRef, { status: "refunded" });

        const ingredientsToReturn: Record<string, number> = {};
        
        orderToRefund.items.forEach(item => {
          const sizeKey = item.size === "Large" ? "Large" : "Medium";
          const catLabel = item.category?.split(" · ")[0] || "";
          const specificRecipeKey = `${catLabel} - ${item.name}`;
          const recipe = RECIPES[specificRecipeKey]?.[sizeKey] || RECIPES[item.name]?.[sizeKey]; 
          
          if (recipe) {
            Object.entries(recipe).forEach(([ing, amt]) => {
              ingredientsToReturn[ing] = (ingredientsToReturn[ing] || 0) + ((amt as number) * item.quantity);
            });
          }
          if (Array.isArray(item.addOns)) {
            item.addOns.forEach(addOn => {
              ingredientsToReturn[addOn] = (ingredientsToReturn[addOn] || 0) + ((ADD_ON_SERVING_SIZES[addOn] || 1) * item.quantity);
            });
          }
        });

        const ingNames = Object.keys(ingredientsToReturn);
        if (ingNames.length > 0) {
          const q = query(collection(db, "inventory"), where("name", "in", ingNames));
          const invSnap = await getDocs(q); 
          
          invSnap.forEach(invDoc => {
             const data = invDoc.data();
             const returningAmount = ingredientsToReturn[data.name];
             
             if (returningAmount) {
                const currentStock = parseFloat(data.quantity) || 0;
                const batches = Array.isArray(data.stockBatches) ? [...data.stockBatches] : [];
                
                if(batches.length > 0) {
                    batches[batches.length - 1].quantity = (parseFloat(batches[batches.length - 1].quantity) || 0) + returningAmount;
                }
                
                t.update(invDoc.ref, {
                  quantity: currentStock + returningAmount,
                  stockBatches: batches
                });
             }
          });
        }

        // Handle refund based on payment method - Cash vs Non Cash
        if (orderToRefund.paymentMethod === "Cash") {
          // Cash refund - update shift expected cash
          const shiftQ = query(collection(db, "shifts"), where("status", "==", "active"), limit(1));
          const shiftSnap = await getDocs(shiftQ);
          if (!shiftSnap.empty) {
            const shiftRef = shiftSnap.docs[0].ref;
            t.update(shiftRef, {
              refunds: increment(orderToRefund.totalAmount),
              expectedCash: increment(-orderToRefund.totalAmount)
            });
          }
        } else if (orderToRefund.paymentMethod === "Non Cash") {
          // Non Cash refund (digital payments) - create a refund record
          const refundRef = doc(collection(db, "non_cash_refunds"));
          t.set(refundRef, {
            orderId: orderToRefund.id,
            transactionNumber: orderToRefund.transactionNumber,
            amount: orderToRefund.totalAmount,
            status: "pending",
            createdAt: new Date(),
            processedBy: orderToRefund.baristaName,
            originalPaymentMethod: "Non Cash"
          });
          
          // Track refund in shifts separately
          const shiftQ = query(collection(db, "shifts"), where("status", "==", "active"), limit(1));
          const shiftSnap = await getDocs(shiftQ);
          if (!shiftSnap.empty) {
            const shiftRef = shiftSnap.docs[0].ref;
            t.update(shiftRef, {
              nonCashRefunds: increment(orderToRefund.totalAmount),
              refunds: increment(orderToRefund.totalAmount)
            });
          }
        }
      });
      
      const refundMessage = orderToRefund.paymentMethod === "Non Cash" 
        ? `Order #${orderToRefund.transactionNumber} has been refunded. Non-cash refund of ₱${orderToRefund.totalAmount.toFixed(2)} has been initiated.`
        : `Order #${orderToRefund.transactionNumber} has been refunded. Cash refund of ₱${orderToRefund.totalAmount.toFixed(2)} has been processed.`;
      
      setRefundSuccessMsg(refundMessage);
      setTimeout(() => setRefundSuccessMsg(null), 4000);
      setOrderToRefund(null);

    } catch (e) {
      console.error("Refund error:", e);
      setRefundSuccessMsg(`Failed to refund order #${orderToRefund.transactionNumber}. Please try again.`);
      setTimeout(() => setRefundSuccessMsg(null), 3000);
    } finally {
      setIsProcessing(null);
    }
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(now.getDate() - now.getDay()); 
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      (o.transactionNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (o.baristaName || "").toLowerCase().includes(searchQuery.toLowerCase());

    let matchesDate = true;
    if (dateFilter !== "All" && o.createdAt) {
      const orderDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date();
      
      if (dateFilter === "Today") {
        matchesDate = orderDate >= startOfToday;
      } else if (dateFilter === "This Week") {
        matchesDate = orderDate >= startOfWeek;
      } else if (dateFilter === "This Month") {
        matchesDate = orderDate >= startOfMonth;
      }
    }

    return matchesSearch && matchesDate;
  });

  if (loading) return <div className="p-8 text-[#a07850]">Loading history...</div>;
  if (!user) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full p-8 relative" style={{ background: "#ede8e3" }}>
      
      {refundSuccessMsg && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-[#3b2212] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50 animate-fade-in-down">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          <span className="font-medium">{refundSuccessMsg}</span>
        </div>
      )}

      <div className="mb-6 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#3b2212]">Order History</h1>
          <p className="text-[#a07850] mt-1">View past transactions with complete price breakdowns.</p>
        </div>
        
        <div className="flex gap-3 items-center">
          <div className="relative w-72">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a07850]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e)=>setSearchQuery(e.target.value)} 
              placeholder="Search ID or Barista..." 
              className="w-full bg-white border-[1.5px] border-[#e8ddd4] p-3 pl-11 text-base text-[#3b2212] focus:outline-none focus:border-[#3b2212] rounded-xl shadow-sm transition-all" 
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#a07850] hover:text-[#3b2212]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            )}
          </div>

          <select 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-white border-[1.5px] border-[#e8ddd4] p-3 pr-8 text-base text-[#3b2212] focus:outline-none focus:border-[#3b2212] rounded-xl shadow-sm transition-all cursor-pointer font-medium"
          >
            <option value="All">All Time</option>
            <option value="Today">Today</option>
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-10">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border-[1.5px] border-[#e8ddd4]">
            <svg className="w-16 h-16 mb-4 text-[#e8ddd4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
            </svg>
            <p className="text-[#a07850] text-lg font-medium">No orders found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOrders.map((order) => {
              const orderSubtotal = order.subtotal || order.items.reduce((sum, item) => {
                const breakdown = calculateItemBreakdown(item);
                return sum + breakdown.discountedTotal; // Use discountedTotal instead of itemOriginalTotal
              }, 0);
              
              const discountAmount = order.discount?.amount || 0;
              const discountType = order.discount?.type || "None";
              const discountPercentage = order.discount?.percentage;
              
              const isNonCash = order.paymentMethod === "Non Cash";
              
              return (
                <div 
                  key={order.id} 
                  onClick={() => setOrderToReprint(order)}
                  className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#e8ddd4] hover:shadow-md transition-all overflow-hidden flex flex-col h-full cursor-pointer hover:border-[#3b2212]/30"
                >
                  
                  <div className="p-4 bg-gradient-to-r from-[#faf7f4] to-white border-b border-[#e8ddd4]">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-lg font-bold text-[#3b2212]">#{order.transactionNumber}</h3>
                        <p className="text-xs text-[#a07850] mt-1">
                          {order.createdAt ? new Date(order.createdAt.toDate()).toLocaleString() : "Unknown Date"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-[#3b2212]">₱{order.totalAmount.toFixed(2)}</p>
                        <p className="text-xs text-[#a07850]">Total Paid</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 items-center flex-wrap mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                        order.paymentMethod === 'Cash' ? 'bg-[#3b2212] text-white' : 'bg-[#0070ba] text-white'
                      }`}>
                        {order.paymentMethod}
                      </span>
                      <span className="text-xs text-[#a07850] bg-[#faf7f4] px-2 py-0.5 rounded-md border border-[#e8ddd4] font-medium">
                        {order.items?.length || 0} item(s)
                      </span>
                      <span className="text-xs text-[#6b4c30] bg-[#faf7f4] px-2 py-0.5 rounded-md border border-[#e8ddd4] font-medium truncate">
                        Barista: {order.baristaName || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[500px]">
                    <div>
                      <h4 className="font-bold text-[#3b2212] mb-2 text-sm border-b border-[#e8ddd4] pb-1">Items Breakdown</h4>
                      <div className="space-y-2">
                        {order.items.map((item, idx) => {
                          const breakdown = calculateItemBreakdown(item);
                          return (
                            <div key={idx} className="bg-[#faf7f4] p-2 rounded-lg text-sm">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-1 flex-wrap mb-1">
                                    <span className="font-bold text-[#a07850]">{item.quantity}x</span>
                                    <span className="font-semibold text-[#3b2212]">{item.name}</span>
                                    {item.size && (
                                      <span className="text-xs text-[#6b4c30] font-medium bg-white px-1.5 py-0.5 rounded">
                                        {item.size}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="mt-1 ml-4 space-y-0.5 text-xs">
                                    <div className="flex justify-between text-[#6b4c30]">
                                      <span>Base price:</span>
                                      <span>₱{item.price.toFixed(2)}</span>
                                    </div>
                                    
                                    {item.addOns && item.addOns.length > 0 && (
                                      <>
                                        <div className="text-[#2d7a38] font-medium mt-0.5">Add-ons:</div>
                                        {breakdown.addOnsBreakdown.map((addon, addonIdx) => (
                                          <div key={addonIdx} className="flex justify-between text-[#2d7a38] ml-3">
                                            <span>• {addon.name}</span>
                                            <span>₱{addon.price.toFixed(2)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between text-[#2d7a38] font-medium border-t border-[#e8ddd4] mt-0.5 pt-0.5">
                                          <span>Add-ons total:</span>
                                          <span>₱{breakdown.addOnsTotal.toFixed(2)}</span>
                                        </div>
                                      </>
                                    )}
                                    
                                    {/* SHOW DISCOUNT IF APPLIED */}
                                   {breakdown.hasDiscount && (
  <div className="flex justify-between text-[#c0392b] font-medium mt-1">
    <span>{breakdown.discountType} Discount (20%):</span>  {/* Shows "Senior Discount" or "PWD Discount" */}
    <span>-₱{breakdown.discountAmount.toFixed(2)}</span>
  </div>
)}
                                    
                                    <div className="flex justify-between font-bold text-[#3b2212] border-t border-[#d4c5b8] mt-1 pt-1">
                                      <span>Item total:</span>
                                      <span>₱{breakdown.discountedTotal.toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-[#f0e8e0] to-[#faf7f4] p-3 rounded-lg">
                      <h4 className="font-bold text-[#3b2212] mb-2 text-sm">Summary</h4>
                      <div className="space-y-1 text-sm">
                        {order.items.map((item, idx) => {
                          const breakdown = calculateItemBreakdown(item);
                          return (
                            <div key={idx} className="flex justify-between text-xs text-[#6b4c30]">
                              <span className="truncate">{item.quantity}x {item.name}{item.size ? ` (${item.size})` : ''}</span>
                              <span>₱{breakdown.discountedTotal.toFixed(2)}</span>
                            </div>
                          );
                        })}
                        
                        <div className="border-t border-[#d4c5b8] my-1"></div>
                        
                        <div className="flex justify-between font-semibold text-[#3b2212]">
                          <span>Subtotal:</span>
                          <span>₱{orderSubtotal.toFixed(2)}</span>
                        </div>
                        
 {/* Calculate total individual discounts */}
{(() => {
  // Calculate total discount from individual per-item discounts
  const totalIndividualDiscount = order.items.reduce((sum, item) => {
    const breakdown = calculateItemBreakdown(item);
    return sum + breakdown.discountAmount;
  }, 0);
  
  // Check if ALL items have the SAME discount type (this indicates a BULK discount)
  const allItemsHaveDiscount = order.items.length > 0 && 
    order.items.every(item => item.discountType && item.discountType !== "None");
  
  const allSameDiscountType = allItemsHaveDiscount && 
    order.items.every(item => item.discountType === order.items[0]?.discountType);
  
  // Get the discount type from the first discounted item
  const firstDiscountedItem = order.items.find(item => item.discountType && item.discountType !== "None");
  const discountTypeName = firstDiscountedItem?.discountType || "";
  
  // Determine if this is a BULK discount (all items have same discount)
  const isBulkDiscount = allSameDiscountType && totalIndividualDiscount > 0;
  
  const totalDiscount = discountAmount + totalIndividualDiscount;
  
  return totalDiscount > 0 ? (
    <>
      <div className="flex justify-between text-xs text-[#c0392b]">
        <span>Discount:</span>
        <span>- ₱{totalDiscount.toFixed(2)}</span>
      </div>
      
      {/* Show BULK discount if all items have same discount */}
      {isBulkDiscount && (
        <div className="flex justify-between text-xs text-[#a07850] ml-4">
          <span>({discountTypeName} bulk - 20% off all items)</span>
          <span>-₱{totalIndividualDiscount.toFixed(2)}</span>
        </div>
      )}
      
      {/* Show INDIVIDUAL per-item discounts if not all items have same discount */}
      {!isBulkDiscount && totalIndividualDiscount > 0 && (
        <div className="flex justify-between text-xs text-[#a07850] ml-4">
          <span>({discountTypeName} per item)</span>
          <span>-₱{totalIndividualDiscount.toFixed(2)}</span>
        </div>
      )}
      
      {/* Show 5%/10% bulk discount if present */}
      {discountAmount > 0 && discountType !== "PWD" && discountType !== "Senior" && (
        <div className="flex justify-between text-xs text-[#a07850] ml-4">
          <span>({discountType} bulk)</span>
          <span>-₱{discountAmount.toFixed(2)}</span>
        </div>
      )}
    </>
  ) : (
    <div className="flex justify-between text-xs text-[#a07850]">
      <span>Discount:</span>
      <span>₱0.00</span>
    </div>
  );
})()}
                        
                        <div className="flex justify-between font-bold text-base text-[#3b2212] border-t-2 border-[#d4c5b8] pt-1 mt-1">
                          <span>TOTAL:</span>
                          <span>₱{order.totalAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0 mt-auto" onClick={(e) => e.stopPropagation()}>
                    {order.status === 'refunded' ? (
                      <span className="block text-center text-xs font-bold bg-[#fff0f0] text-[#c0392b] border border-[#f5c6c6] px-3 py-1.5 rounded-lg uppercase tracking-wide">
                        Refunded
                      </span>
                    ) : (
                      <button 
                        onClick={() => setOrderToRefund(order)} 
                        disabled={isProcessing === order.id}
                        className={`w-full text-sm font-bold text-white px-3 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                          isProcessing === order.id 
                            ? 'bg-[#e8e0d8] text-[#a07850] cursor-not-allowed' 
                            : isNonCash ? 'bg-[#0070ba] hover:bg-[#005a8c]' : 'bg-[#c0392b] hover:bg-[#a93226]'
                        }`}
                      >
                        {isProcessing === order.id ? (
                          <>
                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"></circle>
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"></path>
                            </svg>
                            Processing...
                          </>
                        ) : (
                          'Refund Order'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* REPRINT RECEIPT MODAL */}
      {orderToReprint && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#f0e8e0] flex items-center justify-center">
                <svg className="w-5 h-5 text-[#3b2212]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#3b2212]">Reprint Receipt</h3>
            </div>
            
            <p className="text-sm text-[#a07850] mb-4 leading-relaxed">
              Do you want to reprint the receipt for Order <strong className="text-[#3b2212]">#{orderToReprint.transactionNumber}</strong>?
            </p>
            
            <div className={`p-3 rounded-lg mb-6 ${orderToReprint.paymentMethod === 'Non Cash' ? 'bg-[#e6f3ff]' : 'bg-[#faf7f4]'}`}>
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#3b2212] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-[#3b2212]">
                  <strong>Amount:</strong> ₱{orderToReprint.totalAmount.toFixed(2)}<br />
                  <strong>Payment:</strong> {orderToReprint.paymentMethod}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setOrderToReprint(null)}
                className="flex-1 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-[#3b2212] bg-[#f0e8e0] hover:bg-[#e8d8c8]"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (printWindow && orderToReprint) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Receipt - ${orderToReprint.transactionNumber}</title>
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
                          ${getReprintReceiptHTML(orderToReprint)}
                          <script>
                            window.onload = function() {
                              window.print();
                              window.onafterprint = function() { window.close(); };
                            };
                          <\/script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }
                  setOrderToReprint(null);
                }}
                className="flex-1 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-white bg-[#3b2212] hover:bg-[#2d1a0e] flex items-center justify-center gap-2"
              >
                Reprint Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REFUND CONFIRMATION MODAL */}
      {orderToRefund && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                orderToRefund.paymentMethod === 'Non Cash' ? 'bg-[#0070ba]' : 'bg-[#fff0f0]'
              }`}>
                {orderToRefund.paymentMethod === 'Non Cash' ? (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-[#c0392b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                )}
              </div>
              <h3 className="text-xl font-bold text-[#3b2212]">Refund Order</h3>
            </div>
            
            <p className="text-sm text-[#a07850] mb-4 leading-relaxed">
              Are you sure you want to void and refund Order <strong className="text-[#3b2212]">#{orderToRefund.transactionNumber}</strong>?
            </p>
            
            <div className={`p-3 rounded-lg mb-6 ${
              orderToRefund.paymentMethod === 'Non Cash' ? 'bg-[#e6f3ff]' : 'bg-[#faf7f4]'
            }`}>
              {orderToRefund.paymentMethod === 'Non Cash' ? (
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#0070ba] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <p className="text-sm text-[#3b2212]">
                    <strong className="text-[#0070ba]">Non-Cash Refund:</strong> The amount of <strong>₱{orderToRefund.totalAmount.toFixed(2)}</strong> will be processed back through the original digital payment method.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[#c0392b] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm0 0V9z"></path>
                  </svg>
                  <p className="text-sm text-[#3b2212]">
                    <strong className="text-[#c0392b]">Cash Refund:</strong> The amount of <strong>₱{orderToRefund.totalAmount.toFixed(2)}</strong> will be deducted from the shift's expected cash.
                  </p>
                </div>
              )}
            </div>
            
            <p className="text-sm text-[#a07850] mb-6 leading-relaxed">
              This action cannot be undone, and all <strong className="text-[#3b2212]">{orderToRefund.items?.length} items</strong> will be returned to inventory.
            </p>
            
            <div className="flex gap-3">
              <button
                disabled={isProcessing === orderToRefund.id}
                onClick={() => setOrderToRefund(null)}
                className="flex-1 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-[#3b2212] bg-[#f0e8e0] hover:bg-[#e8d8c8] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isProcessing === orderToRefund.id}
                onClick={executeRefund}
                className="flex-1 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-white bg-[#c0392b] hover:bg-[#a93226] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isProcessing === orderToRefund.id ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"></circle>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Confirm Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}