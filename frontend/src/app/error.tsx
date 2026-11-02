"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Client-side exception caught by error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl bg-white border border-[#E6DFD3] p-6 shadow-xl text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto shadow-2xs">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[#1E3F35]">Something went wrong</h2>
          <p className="text-xs text-beige-muted">
            {error?.message || "A client-side error occurred. You can retry or reload the page."}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-xl bg-[#1E3F35] text-white text-xs font-semibold hover:bg-[#162F27] transition flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-white border border-[#E6DFD3] text-xs font-semibold text-beige-text hover:bg-beige-sand transition shadow-2xs cursor-pointer"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

