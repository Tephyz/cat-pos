"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { collection, query, onSnapshot, getDocs, where } from "firebase/firestore";
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

export default function RefundedOrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [refundedOrders, setRefundedOrders] = useState<OrderRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("All"); 

  // AUTH GUARD & FETCH DATA
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
      return;
    }

    if (user) {
      // Get only orders with status "refunded"
      const q = query(collection(db, "orders"), where("status", "==", "refunded"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderRecord));
        
        // Sort from latest to oldest
        records.sort((a, b) => {
          const dateA = a.createdAt?.toDate()?.getTime() || 0;
          const dateB = b.createdAt?.toDate()?.getTime() || 0;
          return dateB - dateA;
        });

        setRefundedOrders(records);
      }, (error) => {
        console.error("Error fetching refunded orders:", error);
      });

      return () => unsubscribe();
    }
  }, [user, loading, router]);

  // ---------------------------------------------------------
  // FILTERING LOGIC (Search Bar + Date Dropdown)
  // ---------------------------------------------------------
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(now.getDate() - now.getDay()); 
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredOrders = refundedOrders.filter(o => {
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

  if (loading) return <div className="p-8 text-[#a07850]">Loading refunded orders...</div>;
  if (!user) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full p-8 relative" style={{ background: "#ede8e3" }}>
      
      <div className="mb-6 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#c0392b]">Refunded Orders</h1>
          <p className="text-[#a07850] mt-1">View voided transactions and returned items.</p>
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
              className="w-full bg-white border-[1.5px] border-[#e8ddd4] p-3 pl-11 text-base text-[#3b2212] focus:outline-none focus:border-[#c0392b] rounded-xl shadow-sm transition-all" 
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
            className="bg-white border-[1.5px] border-[#e8ddd4] p-3 pr-8 text-base text-[#3b2212] focus:outline-none focus:border-[#c0392b] rounded-xl shadow-sm transition-all cursor-pointer font-medium"
          >
            <option value="All">All Time</option>
            <option value="Today">Today</option>
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
          </select>
        </div>
      </div>

      {/* Orders Grid - 4 columns layout */}
      <div className="flex-1 overflow-y-auto pr-2 pb-10">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border-[1.5px] border-[#e8ddd4]">
            <div className="w-16 h-16 mb-4 text-[#e8ddd4] rounded-full border-2 border-dashed border-[#e8ddd4] flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <p className="text-[#a07850] text-lg font-medium">No refunded orders yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl p-5 shadow-sm border-[1.5px] border-[#e8ddd4] hover:shadow-md hover:border-[#f5c6c6] transition-all flex flex-col h-full">
                
                {/* Order Header */}
                <div className="mb-4 pb-3 border-b border-[#e8ddd4]">
                  <h3 className="text-lg font-bold text-[#c0392b] line-through decoration-2 decoration-[#f5c6c6] truncate">#{order.transactionNumber}</h3>
                  <p className="text-sm text-[#a07850] mt-1.5">
                    {order.createdAt ? new Date(order.createdAt.toDate()).toLocaleString() : "Unknown Date"}
                  </p>
                </div>
                
                {/* Order Total */}
                <div className="mb-4">
                  <p className="text-2xl font-bold text-[#c0392b]">₱{order.totalAmount.toFixed(2)}</p>
                </div>
                
                {/* Order Meta Info */}
                <div className="flex gap-2 items-center mb-3 flex-wrap">
                  <span className={`text-sm px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${
                    order.paymentMethod === 'Cash' ? 'bg-[#3b2212] text-white' : 'bg-[#0070ba] text-white'
                  }`}>
                    {order.paymentMethod}
                  </span>
                  <span className="text-sm text-[#a07850] bg-[#faf7f4] px-2.5 py-1 rounded-md border border-[#e8ddd4] font-medium">
                    {order.items?.length || 0} item(s)
                  </span>
                </div>

                {/* Cashier Name */}
                <p className="text-sm text-[#6b4c30] mb-4 font-medium">
                  Cashier: {order.cashierName || 'Unknown'}
                </p>

                {/* Order Items List */}
                <div className="flex-1 mb-4">
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {order.items?.slice(0, 4).map((item, idx) => (
                      <div key={idx} className="text-sm opacity-75">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <span className="font-bold text-[#a07850] text-base">{item.quantity}x</span>{' '}
                            <span className="font-semibold text-[#3b2212] text-base">{item.name}</span>
                            {item.size && (
                              <span className="text-xs text-[#6b4c30] ml-1 font-medium">
                                ({item.size})
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-[#6b4c30] whitespace-nowrap text-base">
                            ₱{(item.price * item.quantity).toFixed(0)}
                          </span>
                        </div>
                        {item.addOns && item.addOns.length > 0 && (
                          <div className="ml-5 mt-1">
                            <span className="text-xs text-[#2d7a38] font-medium">
                              + {item.addOns.slice(0, 2).join(', ')}{item.addOns.length > 2 ? '...' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                    {order.items && order.items.length > 4 && (
                      <p className="text-sm text-[#a07850] text-center pt-1 font-medium">
                        +{order.items.length - 4} more item(s)
                      </p>
                    )}
                  </div>
                </div>

                {/* Refund Status Badge */}
                <div className="mt-auto pt-4 border-t border-[#e8ddd4]">
                  <span className="block text-center text-sm font-bold bg-[#fff0f0] text-[#c0392b] border border-[#f5c6c6] px-3 py-2 rounded-lg uppercase tracking-wide">
                    Refunded
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}