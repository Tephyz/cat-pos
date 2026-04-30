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
      // Kukunin lang natin ang mga orders na may status na "refunded"
      const q = query(collection(db, "orders"), where("status", "==", "refunded"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderRecord));
        
        // Sinu-sort natin from latest to oldest sa frontend para hindi na hingan ng index sa Firebase
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
      
      <div className="mb-6 flex justify-between items-end">
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

      {/* Orders Grid */}
      <div className="flex-1 overflow-y-auto pr-2 pb-10 space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border-[1.5px] border-[#e8ddd4]">
            <div className="w-16 h-16 mb-4 text-[#e8ddd4] rounded-full border-2 border-dashed border-[#e8ddd4] flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <p className="text-[#a07850] text-lg font-medium">No refunded orders yet.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="bg-white rounded-3xl p-6 shadow-sm border-[1.5px] border-[#e8ddd4] flex justify-between items-start hover:shadow-md hover:border-[#f5c6c6] transition-all">
              
              <div className="flex-1">
                <h3 className="text-xl font-bold text-[#c0392b] line-through decoration-2 decoration-[#f5c6c6]">#{order.transactionNumber}</h3>
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

                {/* Ordered Items List */}
                <div className="space-y-2 mt-2 pt-4 border-t border-dashed border-[#e8ddd4] max-w-xl opacity-75">
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

              {/* Price & Actions Right Panel */}
              <div className="text-right flex flex-col items-end gap-3 ml-6 shrink-0">
                <p className="text-3xl font-bold text-[#c0392b]">₱{order.totalAmount.toFixed(2)}</p>
                
                <div className="flex gap-3 mt-2">
                  <span className="text-sm font-bold bg-[#fff0f0] text-[#c0392b] border border-[#f5c6c6] px-5 py-2 rounded-xl uppercase tracking-widest shadow-sm">
                    Refunded
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}