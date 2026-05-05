"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  // Fetch the logged-in user's role and name from Firestore
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user?.uid) {
        setUserRole("");
        setUserName("");
        return;
      }
      try {
        const byIdSnap = await getDoc(doc(db, "users", user.uid));
        if (byIdSnap.exists()) {
          const data = byIdSnap.data();
          setUserRole(data.role || "");
          setUserName(data.fullname || data.username || user.displayName || "User");
          return;
        }
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setUserRole(data.role || "");
          setUserName(data.fullname || data.username || user.displayName || "User");
        }
      } catch (err) {
        console.error("Error fetching user info:", err);
      }
    };
    fetchUserInfo();
  }, [user]);

  // Capitalize role for display (e.g., "admin" -> "Admin")
  const displayRole = userRole
    ? userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
    : "Cashier";
  const displayName = userName || user?.displayName || "User";

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
            {(displayName || "U")[0].toUpperCase()}
          </div>
          <div>
            <p className="text-white font-medium text-sm">
              {displayName}
            </p>
            <p className="text-xs" style={{ color: "#d4a97a" }}>
              {displayRole}
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