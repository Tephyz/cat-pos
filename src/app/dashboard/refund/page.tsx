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
  cashierName?: string;
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

// Price configuration for add-ons (UPDATED to ₱30)
const ADD_ON_PRICES: Record<string, number> = {
  Pearl: 30,
  Nata: 30,
  Espresso: 30,
  "Coffee Jelly": 30,
  Oreo: 30,
  Caramel: 30,
  "Whip Cream": 30
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
          const dateA = a.createdAt?.toDate?.()?.getTime() || 0;
          const dateB = b.createdAt?.toDate?.()?.getTime() || 0;
          return dateB - dateA;
        });

        setRefundedOrders(records);
      }, (error) => {
        console.error("Error fetching refunded orders:", error);
      });

      return () => unsubscribe();
    }
  }, [user, loading, router]);

  // FILTERING LOGIC
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(now.getDate() - now.getDay()); 
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredOrders = refundedOrders.filter(o => {
    const matchesSearch = 
      (o.transactionNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (o.baristaName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
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
              placeholder="Search ID or Barista..." 
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

      {/* Orders Grid - 3 columns per row */}
      <div className="flex-1 overflow-y-auto pr-2 pb-10">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border-[1.5px] border-[#e8ddd4]">
            <div className="w-16 h-16 mb-4 text-[#e8ddd4] rounded-full border-2 border-dashed border-[#e8ddd4] flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <p className="text-[#a07850] text-lg font-medium">No refunded orders yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOrders.map((order) => {
              // Calculate subtotal with discounts
              const orderSubtotal = order.subtotal || order.items.reduce((sum, item) => {
                const breakdown = calculateItemBreakdown(item);
                return sum + breakdown.discountedTotal;
              }, 0);
              
              const discountAmount = order.discount?.amount || 0;
              const discountType = order.discount?.type || "None";
              
              // Calculate individual discounts
              const totalIndividualDiscount = order.items.reduce((sum, item) => {
                const breakdown = calculateItemBreakdown(item);
                return sum + breakdown.discountAmount;
              }, 0);
              
              // Check if this is a bulk discount (all items have same discount)
              const allItemsHaveDiscount = order.items.length > 0 && 
                order.items.every(item => item.discountType && item.discountType !== "None");
              const allSameDiscountType = allItemsHaveDiscount && 
                order.items.every(item => item.discountType === order.items[0]?.discountType);
              const isBulkDiscount = allSameDiscountType && totalIndividualDiscount > 0;
              const bulkDiscountType = isBulkDiscount ? order.items[0]?.discountType : null;
              
              const totalDiscount = discountAmount + totalIndividualDiscount;
              
              return (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm border-[1.5px] border-[#e8ddd4] hover:shadow-md hover:border-[#f5c6c6] transition-all overflow-hidden flex flex-col h-full">
                  
                  {/* Order Header */}
                  <div className="p-4 bg-gradient-to-r from-[#faf7f4] to-white border-b border-[#e8ddd4]">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-lg font-bold text-[#c0392b] line-through decoration-2 decoration-[#f5c6c6]">#{order.transactionNumber}</h3>
                        <p className="text-xs text-[#a07850] mt-1">
                          {order.createdAt ? new Date(order.createdAt.toDate()).toLocaleString() : "Unknown Date"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-[#c0392b]">₱{order.totalAmount.toFixed(2)}</p>
                        <p className="text-xs text-[#a07850]">Total Refunded</p>
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
                        Barista: {order.baristaName || order.cashierName || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  {/* Detailed Price Breakdown - Always Visible */}
                  <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[500px]">
                    {/* Items List with Detailed Pricing */}
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
                                  
                                  {/* Price Breakdown with Discount */}
                                  <div className="mt-1 ml-4 space-y-0.5 text-xs">
                                    <div className="flex justify-between text-[#6b4c30]">
                                      <span>Base price:</span>
                                      <span>₱{item.price.toFixed(2)}</span>
                                    </div>
                                    
                                    {/* Add-ons with individual prices */}
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
                                      <div className="flex justify-between text-[#c0392b] font-medium">
                                        <span>{breakdown.discountType} Discount (20%):</span>
                                        <span>-₱{breakdown.discountAmount.toFixed(2)}</span>
                                      </div>
                                    )}
                                    
                                    <div className="flex justify-between font-bold text-[#c0392b] border-t border-[#d4c5b8] mt-1 pt-1">
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

                    {/* Order Summary */}
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
                        
                        {/* Discount Section - Shows both bulk and individual */}
{(() => {
  const discountedItem = order.items.find(item => item.discountType && item.discountType !== "None");
  const individualDiscountType = discountedItem?.discountType || "";
  
  return totalDiscount > 0 ? (
    <>
      <div className="flex justify-between text-xs text-[#c0392b]">
        <span>Discount:</span>
        <span>- ₱{totalDiscount.toFixed(2)}</span>
      </div>
      
      {isBulkDiscount && (
        <div className="flex justify-between text-xs text-[#a07850] ml-4">
          <span>({bulkDiscountType} bulk - 20% off all items)</span>
          <span>-₱{totalIndividualDiscount.toFixed(2)}</span>
        </div>
      )}
      
      {!isBulkDiscount && totalIndividualDiscount > 0 && (
        <div className="flex justify-between text-xs text-[#a07850] ml-4">
          <span>({individualDiscountType} per item)</span>
          <span>-₱{totalIndividualDiscount.toFixed(2)}</span>
        </div>
      )}
      
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
                        
                        <div className="flex justify-between font-bold text-base text-[#c0392b] border-t-2 border-[#d4c5b8] pt-1 mt-1">
                          <span>TOTAL REFUNDED:</span>
                          <span>₱{order.totalAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Refund Status Badge */}
                  <div className="p-4 pt-0 mt-auto">
                    <span className="block text-center text-xs font-bold bg-[#fff0f0] text-[#c0392b] border border-[#f5c6c6] px-3 py-1.5 rounded-lg uppercase tracking-wide">
                      Refunded
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}