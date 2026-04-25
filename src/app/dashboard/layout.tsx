"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

const navItems = [
  {
    label: "Ordering",
    href: "/dashboard",
  },
  {
    label: "Order History",
    href: "/dashboard/history-order",
  },
  {
    label: "Refunded",
    href: "/dashboard/refund",
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {

  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (loading) return null;
  if (!user) return null;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: "#ede8e3" }}>

      {/* HEADER */}
      <header
        className="flex justify-between items-center px-6 py-4 sticky top-0 z-40"
        style={{
          background: "linear-gradient(135deg, #3b2212 0%, #6b3f22 100%)",
          boxShadow: "0 2px 16px rgba(59,34,18,0.18)",
        }}
      >

        {/* LEFT SIDE - Cashier Info (replaces brand) */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
            style={{ background: "#f7f3ef", color: "#3b2212" }}
          >
            {(user?.displayName || "U")[0].toUpperCase()}
          </div>
          <div>
            <p className="text-white font-medium text-sm">
              {user?.displayName || "User"}
            </p>
            <p className="text-xs" style={{ color: "#d4a97a" }}>
              Cashier
            </p>
          </div>
        </div>

        {/* CENTER - Navigation */}
        <nav className="flex gap-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: active ? "white" : "transparent",
                  color: active ? "#3b2212" : "white",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* RIGHT SIDE - Time and Logout */}
        <div className="flex items-center gap-4">

          {/* TIME */}
          <div className="text-right hidden sm:block">
            <p className="text-xs" style={{ color: "#d4a97a" }}>
              Current Time
            </p>
            <p className="text-white text-sm font-medium">
              {currentTime.toLocaleString()}
            </p>
          </div>

          {/* LOGOUT */}
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "#c0392b", color: "white" }}
          >
            Logout
          </button>

        </div>

      </header>

      <main className="flex-1 min-h-0 h-full">
        {children}
      </main>

    </div>
  );
}