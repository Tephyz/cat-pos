"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
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

const ADD_ON_PRICES: Record<string, number> = {
  Pearl: 30, Nata: 30, Espresso: 30, "Coffee Jelly": 30, Oreo: 30, Caramel: 30, "Whip Cream": 30
};

export default function GenerateReportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [dateFilter, setDateFilter] = useState("Today");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

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

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const getFilteredOrders = () => {
    return orders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = o.createdAt.toDate ? o.createdAt.toDate() : new Date();

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

  // Calculate total sales (including completed and refunded orders)
  const totalSales = filteredOrders.reduce((sum, order) => {
    return sum + (order.totalAmount || 0);
  }, 0);

  // Count by status
  const completedCount = filteredOrders.filter(o => !o.status || o.status !== "refunded").length;
  const refundedCount = filteredOrders.filter(o => o.status === "refunded").length;

  // Calculate refunded amount
  const refundedAmount = filteredOrders.filter(o => o.status === "refunded").reduce((sum, order) => {
    return sum + (order.totalAmount || 0);
  }, 0);

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString();
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="p-8 text-[#a07850]">Loading...</div>;
  if (!user) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full p-8" style={{ background: "#ede8e3" }}>
      <div className="mb-6">
        <div className="flex justify-between items-end gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#3b2212]">Sales Report</h1>
            <p className="text-[#a07850] mt-1">Generate comprehensive sales reports with order details.</p>
          </div>
          <button
            onClick={handlePrint}
            className="px-6 py-3 rounded-xl font-semibold transition-all active:scale-95 touch-manipulation min-h-[44px]"
            style={{ background: "#3b2212", color: "white" }}
          >
            🖨️ Print Report
          </button>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <span className="text-sm font-semibold text-[#3b2212]">Filter by:</span>
          {["Today", "This Week", "This Month"].map((filter) => (
            <button
              key={filter}
              onClick={() => setDateFilter(filter)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                dateFilter === filter
                  ? "bg-[#3b2212] text-white shadow-md"
                  : "bg-white text-[#3b2212] border border-[#e8ddd4] hover:border-[#3b2212]"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 border-[1.5px] border-[#e8ddd4] shadow-sm">
          <p className="text-[#a07850] text-sm font-semibold">Total Orders</p>
          <p className="text-3xl font-bold text-[#3b2212] mt-2">{filteredOrders.length}</p>
          <p className="text-xs text-[#c0b090] mt-1">{filteredOrders.length} transaction{filteredOrders.length !== 1 ? "s" : ""}</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border-[1.5px] border-[#e8ddd4] shadow-sm">
          <p className="text-[#2d7a38] text-sm font-semibold">Completed</p>
          <p className="text-3xl font-bold text-[#2d7a38] mt-2">{completedCount}</p>
          <p className="text-xs text-[#c8e6c9] mt-1">Completed orders</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border-[1.5px] border-[#e8ddd4] shadow-sm">
          <p className="text-[#c0392b] text-sm font-semibold">Refunded</p>
          <p className="text-3xl font-bold text-[#c0392b] mt-2">{refundedCount}</p>
          <p className="text-xs text-[#fce4e4] mt-1">Refunded orders</p>
        </div>

        <div className="bg-gradient-to-br from-[#3b2212] to-[#6b3f22] rounded-2xl p-4 shadow-md">
          <p className="text-[#d4a97a] text-sm font-semibold">Total Sales</p>
          <p className="text-3xl font-bold text-white mt-2">₱{totalSales.toFixed(2)}</p>
          {refundedAmount > 0 && <p className="text-xs text-[#fce4e4] mt-1">Refunded: -₱{refundedAmount.toFixed(2)}</p>}
        </div>
      </div>

      {/* ORDERS TABLE */}
      <div className="flex-1 overflow-y-auto rounded-2xl border-[1.5px] border-[#e8ddd4] bg-white shadow-sm print:shadow-none print:border-black/20">
        {filteredOrders.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-[#a07850] font-medium">No orders found for {dateFilter.toLowerCase()}</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#e8ddd4]">
            {filteredOrders.map((order) => (
              <div key={order.id} className="p-4 hover:bg-[#f7f3ef] transition-colors">
                {/* ORDER HEADER */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex gap-3 items-center mb-1">
                      <span className="text-sm font-bold text-[#3b2212]">
                        #{order.transactionNumber}
                      </span>
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-semibold ${
                          order.status === "refunded"
                            ? "bg-[#fee2e2] text-[#c0392b]"
                            : "bg-[#f0faf0] text-[#2d7a38]"
                        }`}
                      >
                        {order.status === "refunded" ? "Refunded" : "Completed"}
                      </span>
                    </div>
                    <p className="text-xs text-[#a07850]">
                      {formatDate(order.createdAt)} • {order.paymentMethod} • {order.baristaName}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    className="text-[#3b2212] hover:bg-[#e8ddd4] p-2 rounded-lg transition-colors"
                  >
                    {expandedOrder === order.id ? "▼" : "▶"}
                  </button>
                </div>

                {/* ORDER DETAILS */}
                {expandedOrder === order.id && (
                  <div className="mt-4 pl-4 border-l-2 border-[#e8ddd4] space-y-2">
                    {order.items?.map((item, idx) => {
                      const addOnsTotal = (item.addOns || []).reduce(
                        (sum, addon) => sum + (ADD_ON_PRICES[addon] || 0),
                        0
                      );
                      const itemTotal = (item.price + addOnsTotal) * item.quantity;
                      const hasDiscount = item.discountType && item.discountType !== "None";
                      const finalTotal = hasDiscount ? itemTotal * 0.8 : itemTotal;

                      return (
                        <div key={idx} className="text-xs space-y-1">
                          <p className="font-semibold text-[#3b2212]">
                            {item.quantity}x {item.name}
                            {item.size && ` (${item.size})`}
                            {item.temperature && ` - ${item.temperature}`}
                          </p>
                          <p className="text-[#a07850]">
                            ₱{item.price.toFixed(2)} × {item.quantity} = ₱{(item.price * item.quantity).toFixed(2)}
                          </p>
                          {addOnsTotal > 0 && (
                            <p className="text-[#a07850]">
                              Add-ons: ₱{(addOnsTotal * item.quantity).toFixed(2)}
                            </p>
                          )}
                          {hasDiscount && (
                            <p className="text-[#c0392b] font-semibold">
                              {item.discountType} Discount (20%): - ₱{(itemTotal - finalTotal).toFixed(2)}
                            </p>
                          )}
                          {item.discountCustomerName && (
                            <p className="text-xs text-[#a07850]">
                              {item.discountType} ID: {item.discountCustomerID}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    <div className="border-t border-[#e8ddd4] pt-2 mt-2 space-y-1">
                      <p className="text-sm text-[#a07850]">
                        Subtotal: ₱{(order.subtotal || order.totalAmount + (order.discount?.amount || 0)).toFixed(2)}
                      </p>
                      {order.discount && order.discount.amount > 0 && (
                        <p className="text-sm text-[#c0392b] font-semibold">
                          Discount ({order.discount.type}): - ₱{order.discount.amount.toFixed(2)}
                        </p>
                      )}
                      <p className="text-sm font-bold text-[#3b2212]">
                        Total: ₱{order.totalAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}

                {/* QUICK TOTAL */}
                {expandedOrder !== order.id && (
                  <div className="text-right">
                    <p className="text-lg font-bold text-[#3b2212]">
                      ₱{order.totalAmount.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER TOTAL */}
      <div className="mt-6 bg-gradient-to-r from-[#3b2212] to-[#6b3f22] rounded-2xl p-6 text-white shadow-lg flex justify-between items-center">
        <div>
          <p className="text-sm opacity-90">Total Sales for {dateFilter}</p>
          <p className="text-4xl font-bold">₱{totalSales.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm opacity-90">Orders: {filteredOrders.length}</p>
          <p className="text-sm opacity-90">Completed: {completedCount} | Refunded: {refundedCount}</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .no-print {
            display: none !important;
          }
          div[style*="background: #ede8e3"] {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
