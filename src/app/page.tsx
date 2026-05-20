"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function SigninPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [iconsReady, setIconsReady] = useState(false); // NEW: track when icons are ready

  const { signIn, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push("/dashboard");
  }, [user, router]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  // NEW: Delay showing icons to prevent reload glitch
  useEffect(() => {
    const t = setTimeout(() => setIconsReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!form.username || !form.password) {
      setError("Please enter your username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signIn(form.username, form.password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return <div className="min-h-screen flex items-center justify-center">Redirecting...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 relative overflow-hidden">
      {/* Layered coffee-themed background */}
      <div className="absolute inset-0 -z-20 coffee-gradient" />

      {/* Soft vignette and texture */}
      <div className="absolute inset-0 -z-10 coffee-vignette" />

      {/* Decorative SVG icons - FIXED: only show when iconsReady is true AND mounted */}
      {iconsReady && mounted && (
        <>
          <svg className="bg-icon icon-1" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 8c0-3 3-5 6-5s6 2 6 5v1H3V8z" stroke="currentColor" strokeWidth="1.2" />
            <rect x="4" y="9" width="12" height="7" rx="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>

          <svg className="bg-icon icon-2" viewBox="0 0 24 24" fill="none" aria-hidden>
            <ellipse cx="12" cy="12" rx="7" ry="10" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9 9c1.5 1 3 1 4.5 0" stroke="currentColor" strokeWidth="1.2" />
          </svg>

          <svg className="bg-icon icon-3" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 2c2 3 6 3 8 6 2 3 0 6-3 8s-6 2-8 0-4-6-2-9 3-6 5-5z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </>
      )}
      
      {/* Main card */}
      <div
        className={`w-full max-w-5xl rounded-2xl grid grid-cols-1 md:grid-cols-2 overflow-hidden shadow-2xl transition-all duration-600
          ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)" }}
      >
        {/* LEFT - Branding */}
        <div
          className={`hidden md:flex items-center justify-center p-10 transition-transform duration-700
            ${mounted ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"}`}
          style={{ background: "linear-gradient(180deg,#3B2F2F 0%, #5C4033 100%)" }}
        >
          <div className="relative flex flex-col items-center text-center text-white">
            <div className="w-64 h-64 bg-white/8 rounded-full flex items-center justify-center mb-6 backdrop-blur-sm transition-transform duration-500 hover:scale-105">
              <Image src="/2nd.png" alt="Logo" width={220} height={220} className="object-contain" priority />
            </div>
            <h2 className="text-2xl font-bold mb-2 font-serif">Coffee & Tea</h2>
            <p className="text-white/80 max-w-xs leading-relaxed">
              Elegant POS for artisan cafes — fast, reliable, and designed for busy shifts.
            </p>
            <div className="mt-6 flex gap-3">
              <span className="px-3 py-1 rounded-full border border-white/20 text-sm text-white/90">Premium Tools</span>
              <span className="px-3 py-1 rounded-full border border-white/20 text-sm text-white/90">Artisan Focus</span>
            </div>
          </div>
        </div>

        {/* RIGHT - Form */}
        <div
          className={`p-6 md:p-8 xl:p-10 flex flex-col justify-center transition-transform duration-700
            ${mounted ? "translate-x-0 opacity-100" : "-translate-x-6 opacity-0"}`}
        >
          <h1 className="text-2xl md:text-3xl xl:text-4xl font-extrabold mb-2 text-[#3B2F2F]">Welcome Back</h1>
          <p className="text-gray-700 mb-6 text-sm md:text-base">Sign in to your POS account</p>

          <form onSubmit={handleSubmit} className="space-y-5" aria-live="polite">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={form.username}
                onChange={handleChange}
                placeholder="Enter your username"
                required
                className="w-full rounded-lg px-5 py-4 md:py-3 border border-gray-300 bg-white text-gray-900 text-base outline-none transition duration-300 focus:ring-2 focus:ring-offset-1 focus:ring-[#C9A66B] focus:border-transparent"
                autoComplete="off"
                aria-label="Username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-lg px-5 py-4 md:py-3 border border-gray-300 bg-white text-gray-900 text-base outline-none transition duration-300 focus:ring-2 focus:ring-offset-1 focus:ring-[#C9A66B] focus:border-transparent pr-14"
                  autoComplete="off"
                  aria-label="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 min-h-[44px]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10a9.96 9.96 0 012.175-5.625M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" aria-live="assertive" className="bg-red-100 text-red-700 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-4 md:py-3 rounded-lg text-white font-semibold shadow-md transform transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation min-h-[52px]"
              style={{ background: "linear-gradient(90deg,#3B2F2F 0%, #5C4033 70%)" }}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Inline CSS - KEPT EXACTLY THE SAME */}
      <style jsx>{`
        .coffee-gradient {
          background: radial-gradient(1200px 600px at 10% 10%, rgba(255,240,220,0.04), transparent 8%),
                      radial-gradient(900px 500px at 90% 90%, rgba(0,0,0,0.04), transparent 10%),
                      linear-gradient(135deg,#3B2F2F 0%, #5C4033 55%, #7B4B3A 100%);
        }

        .coffee-vignette {
          background-image: radial-gradient(ellipse at center, rgba(0,0,0,0.06), transparent 40%);
          mix-blend-mode: multiply;
        }

        .bg-icon {
          position: absolute;
          color: rgba(255,255,255,0.06);
          pointer-events: none;
          will-change: transform, opacity;
        }
        .icon-1 { left: 1.5rem; top: 2.5rem; width: 9rem; height: 9rem; }
        .icon-2 { right: 2rem; top: 7rem; width: 7rem; height: 7rem; color: rgba(255,255,255,0.05); }
        .icon-3 { left: 5rem; bottom: 4.5rem; width: 10rem; height: 10rem; color: rgba(255,255,255,0.06); }

        @keyframes float {
          0% { transform: translateY(0px); opacity: 0.9; }
          50% { transform: translateY(-10px); opacity: 1; }
          100% { transform: translateY(0px); opacity: 0.9; }
        }
        @keyframes float-slow {
          0% { transform: translateY(0px); opacity: 0.85; }
          50% { transform: translateY(-16px); opacity: 1; }
          100% { transform: translateY(0px); opacity: 0.85; }
        }
        @keyframes rotate-slow {
          0% { transform: rotate(0deg) scale(1); opacity: 0.85; }
          50% { transform: rotate(6deg) scale(1.02); opacity: 1; }
          100% { transform: rotate(0deg) scale(1); opacity: 0.85; }
        }

        .icon-1 { animation: float 6s ease-in-out infinite; }
        .icon-2 { animation: float-slow 9s ease-in-out infinite; }
        .icon-3 { animation: rotate-slow 12s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .icon-1, .icon-2, .icon-3 { animation: none !important; }
        }

        @media (max-width: 768px) {
          .icon-1, .icon-2, .icon-3 { display: none; }
        }
      `}</style>
    </div>
  );
}