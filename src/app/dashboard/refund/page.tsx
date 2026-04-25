"use client";

export default function RefundedPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh]" style={{ background: "#ede8e3" }}>
      <div className="text-6xl mb-4 opacity-20">🔄</div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: "#3b2212" }}>No Refunds Yet</h2>
      <p className="text-sm" style={{ color: "#a07850" }}>Refunded orders will appear here.</p>
    </div>
  );
}