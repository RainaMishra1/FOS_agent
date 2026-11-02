"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Agent layout client error:", error);
  }, [error]);

  return (
    <div className="p-6 max-w-lg mx-auto my-12 rounded-2xl bg-white border border-[#E6DFD3] shadow-md text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-[#1E3F35]">Agent Interface Notice</h3>
        <p className="text-xs text-beige-muted">
          {error?.message || "An unexpected error occurred while loading this view."}
        </p>
      </div>
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-xl bg-[#1E3F35] text-white text-xs font-semibold hover:bg-[#162F27] transition flex items-center gap-2 cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reload View</span>
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-white border border-[#E6DFD3] text-xs font-semibold text-beige-text hover:bg-beige-sand transition shadow-2xs cursor-pointer"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
}

