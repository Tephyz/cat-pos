"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { collection, query, orderBy, onSnapshot, runTransaction, doc, increment, getDocs, where, limit } from "firebase/firestore";
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
}

interface OrderRecord {
  id: string;
  transactionNumber: string;
  createdAt: any;
  paymentMethod: string;
  totalAmount: number;
  cashierName: string;
  status?: string; 
  items: OrderItem[];
}

// ---------------------------------------------------------
// RECIPES & INVENTORY LOGIC
// ---------------------------------------------------------
type Recipes = Record<string, Record<string, Record<string, number>>>;

const RECIPES: Recipes = {
  "Milktea - Okinawa": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Okinawa Powder": 15 }, "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Okinawa Powder": 25 } },
  "Milktea - Dark Choco": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Dark Choco Powder": 20 }, "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Dark Choco Powder": 30 } },
  "Milktea - Strawberry": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Strawberry Powder": 20 }, "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Strawberry Powder": 30 } },
  "Milktea - Capuccino": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Fructose": 25, "Cappuccino Powder": 20 }, "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Fructose": 35, "Cappuccino Powder": 30 } },
  "Milktea - Wintermelon": { "Medium": { "Assam Black Tea": 200, "Creamer": 20, "Wintermelon": 30 }, "Large":  { "Assam Black Tea": 300, "Creamer": 30, "Wintermelon": 40 } },
  "Mocha": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20 }, "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 30 } },
  "Dark Mocha": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 20, "Dark Chocolate Powder": 10 }, "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 30, "Dark Chocolate Powder": 15 } },
  "Caramel": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 10, "Caramel Syrup": 30 }, "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20, "Caramel Syrup": 40 } },
  "Vanilla": { "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 20, "Water": 50 }, "Large":  { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 30, "Water": 70 } },
  "Coffee Jelly": { "Medium": { "Coffee": 80, "Creamer": 20, "Vanilla Powder": 10, "Fructose": 15 }, "Large":  { "Coffee": 120, "Creamer": 30, "Vanilla Powder": 15, "Fructose": 20 } },
  "Chocolate Chip": { "Medium": { "Creamer": 10, "Vanilla Powder": 20, "Fructose": 15, "Chocolate Syrup": 40, "Chocolate Chip": 10, "Water": 50 }, "Large":  { "Creamer": 15, "Vanilla Powder": 30, "Fructose": 25, "Chocolate Syrup": 50, "Chocolate Chip": 15, "Water": 70 } },
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

export default function OrderHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("All"); 
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  
  // Custom Modal States
  const [orderToRefund, setOrderToRefund] = useState<OrderRecord | null>(null);
  const [refundSuccessMsg, setRefundSuccessMsg] = useState<string | null>(null);

  // AUTH GUARD & FETCH DATA
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

        if (orderToRefund.paymentMethod === "Cash") {
          const shiftQ = query(collection(db, "shifts"), where("status", "==", "active"), limit(1));
          const shiftSnap = await getDocs(shiftQ);
          if (!shiftSnap.empty) {
            const shiftRef = shiftSnap.docs[0].ref;
            t.update(shiftRef, {
              refunds: increment(orderToRefund.totalAmount),
              expectedCash: increment(-orderToRefund.totalAmount)
            });
          }
        }
      });
      
      setRefundSuccessMsg(`Order #${orderToRefund.transactionNumber} has been refunded.`);
      setTimeout(() => setRefundSuccessMsg(null), 3000);
      setOrderToRefund(null);

    } catch (e) {
      console.error("Refund error:", e);
      setRefundSuccessMsg("Failed to refund order. Please try again.");
      setTimeout(() => setRefundSuccessMsg(null), 3000);
    } finally {
      setIsProcessing(null);
    }
  };

  // ---------------------------------------------------------
  // FILTERING LOGIC (Search Bar + Date Dropdown)
  // ---------------------------------------------------------
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(now.getDate() - now.getDay()); 
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      (o.transactionNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (o.cashierName || "").toLowerCase().includes(searchQuery.toLowerCase());

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
      
      {/* SUCCESS TOAST NOTIFICATION */}
      {refundSuccessMsg && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-[#3b2212] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50 animate-fade-in-down">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          <span className="font-medium">{refundSuccessMsg}</span>
        </div>
      )}

      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-[#3b2212]">Order History</h1>
          <p className="text-[#a07850] mt-1">View past transactions and manage refunds.</p>
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
              placeholder="Search ID or Cashier..." 
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

      {/* Orders Grid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-10 space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border-[1.5px] border-[#e8ddd4]">
            <svg className="w-16 h-16 mb-4 text-[#e8ddd4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
            </svg>
            <p className="text-[#a07850] text-lg font-medium">No orders found.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="bg-white rounded-3xl p-6 shadow-sm border-[1.5px] border-[#e8ddd4] flex justify-between items-start hover:shadow-md transition-all">
              
              <div className="flex-1">
                <h3 className="text-xl font-bold text-[#3b2212]">#{order.transactionNumber}</h3>
                <p className="text-sm text-[#a07850] mb-4">{order.createdAt ? new Date(order.createdAt.toDate()).toLocaleString() : "Unknown Date"}</p>
                
                <div className="flex gap-2 items-center mb-4">
                  <span className={`text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${order.paymentMethod === 'Cash' ? 'bg-[#3b2212] text-white' : 'bg-[#0070ba] text-white'}`}>
                    {order.paymentMethod}
                  </span>
                  <span className="text-xs text-[#a07850] bg-[#faf7f4] px-2.5 py-1 rounded-md border border-[#e8ddd4] font-medium">
                    Cashier: {order.cashierName || 'Unknown'}
                  </span>
                  <span className="text-xs text-[#a07850] bg-[#faf7f4] px-2.5 py-1 rounded-md border border-[#e8ddd4] font-medium">
                    {order.items?.length || 0} items
                  </span>
                </div>

                <div className="space-y-2 mt-2 pt-4 border-t border-dashed border-[#e8ddd4] max-w-xl">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="text-sm text-[#3b2212] flex items-start justify-between gap-4">
                      <div className="flex gap-2">
                        <span className="font-bold text-[#a07850] min-w-[24px]">{item.quantity}x</span> 
                        <div>
                          <span className="font-semibold">{item.name}</span>
                          {item.size && <span className="text-xs text-[#6b4c30] ml-1.5">({item.size})</span>}
                          {item.variant && <span className="text-xs text-[#6b4c30] ml-1.5">({item.variant})</span>}
                          {item.addOns && item.addOns.length > 0 && (
                            <span className="text-[11px] font-bold text-[#2d7a38] block mt-0.5 uppercase tracking-wide">
                              + {item.addOns.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-semibold text-[#6b4c30]">
                        ₱{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-right flex flex-col items-end gap-3 ml-6 shrink-0">
                <p className="text-3xl font-bold text-[#3b2212]">₱{order.totalAmount.toFixed(2)}</p>
                
                <div className="flex gap-3 mt-2">
                  <button className="text-sm font-semibold text-[#6b4c30] hover:text-[#3b2212] underline decoration-[#e8ddd4] hover:decoration-[#3b2212] transition-colors py-1.5 px-2">
                    View Receipt
                  </button>
                  
                  {order.status === 'refunded' ? (
                    <span className="text-sm font-bold bg-[#fff0f0] text-[#c0392b] border border-[#f5c6c6] px-4 py-1.5 rounded-xl cursor-not-allowed opacity-80 uppercase tracking-wide">
                      Refunded
                    </span>
                  ) : (
                    <button 
                      onClick={() => setOrderToRefund(order)} 
                      disabled={isProcessing === order.id}
                      className={`text-sm font-bold text-white px-5 py-2 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2 ${isProcessing === order.id ? 'bg-[#e8e0d8] text-[#a07850] cursor-not-allowed' : 'bg-[#c0392b] hover:bg-[#a93226]'}`}
                    >
                      Refund Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CUSTOM REFUND CONFIRMATION MODAL */}
      {orderToRefund && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-[#fff0f0] text-[#c0392b] flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-[#3b2212]">Refund Order</h3>
            </div>
            
            <p className="text-base text-[#a07850] mb-8 leading-relaxed">
              Are you sure you want to void and refund Order <strong className="text-[#3b2212]">#{orderToRefund.transactionNumber}</strong>? <br/><br/>
              This action cannot be undone, and all <strong className="text-[#3b2212]">{orderToRefund.items?.length} items</strong> (including ingredients) will be immediately returned to your inventory.
            </p>
            
            <div className="flex gap-4">
              <button
                disabled={isProcessing === orderToRefund.id}
                onClick={() => setOrderToRefund(null)}
                className="flex-1 py-3.5 rounded-xl font-bold text-lg transition-all active:scale-95 text-[#3b2212] bg-[#f0e8e0] hover:bg-[#e8d8c8] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isProcessing === orderToRefund.id}
                onClick={executeRefund}
                className="flex-1 py-3.5 rounded-xl font-bold text-lg transition-all active:scale-95 text-white bg-[#c0392b] hover:bg-[#a93226] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isProcessing === orderToRefund.id ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
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