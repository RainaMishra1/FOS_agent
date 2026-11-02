"use client";

import React, { useState, useContext } from "react";
import { AgentContext } from "@/context/AgentContext";
import { Power, Check, Pause, Loader2 } from "lucide-react";

interface DutyToggleButtonProps {
  size?: "sm" | "md" | "lg";
  showSubtext?: boolean;
  className?: string;
}

export default function DutyToggleButton({
  size = "md",
  showSubtext = false,
  className = "",
}: DutyToggleButtonProps) {
  const agentContext = useContext(AgentContext);
  const isOnDuty = agentContext?.isOnDuty ?? true;
  const toggleDuty = agentContext?.toggleDuty;
  const [isUpdating, setIsUpdating] = useState(false);

  const handleClick = async () => {
    if (isUpdating || !toggleDuty) return;
    setIsUpdating(true);
    try {
      await toggleDuty();
    } finally {
      setIsUpdating(false);
    }
  };

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3.5 py-1.5 text-xs gap-2",
    lg: "px-4 py-2 text-sm gap-2.5",
  }[size];

  const dotSize = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  }[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOnDuty}
      aria-label={isOnDuty ? "Switch to Off Duty" : "Switch to On Duty"}
      onClick={handleClick}
      disabled={isUpdating}
      title={isOnDuty ? "Click to go Off Duty (pause tracking)" : "Click to go On Duty (enable tracking)"}
      className={`group relative inline-flex items-center rounded-full font-bold transition-all duration-200 shadow-2xs select-none cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-offset-1 disabled:opacity-70 ${
        isOnDuty
          ? "bg-[#EAF2EC] hover:bg-[#DFEDE2] text-[#1E3F35] border border-[#CDE1D2] hover:border-[#1E3F35]/40 focus:ring-[#1E3F35]/30 active:scale-95"
          : "bg-[#FAF3E7] hover:bg-[#F5ECD9] text-[#9E6924] border border-[#F0E4D0] hover:border-[#9E6924]/40 focus:ring-[#9E6924]/30 active:scale-95"
      } ${sizeClasses} ${className}`}
    >
      {/* Status Dot with pulse ring when on duty */}
      <span className="relative flex items-center justify-center shrink-0">
        <span
          className={`rounded-full transition-colors ${dotSize} ${
            isOnDuty ? "bg-[#1E3F35]" : "bg-[#9E6924]"
          }`}
        />
        {isOnDuty && (
          <span className="absolute -inset-1 rounded-full bg-[#1E3F35]/25 animate-ping" />
        )}
      </span>

      {/* Status Text */}
      <span className="leading-none tracking-tight">
        {isOnDuty ? "On Duty • Active" : "Off Duty • Paused"}
      </span>

      {/* Visual Toggle Switch Track */}
      <span
        aria-hidden="true"
        className={`ml-1 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
          isOnDuty ? "bg-[#1E3F35]" : "bg-[#D6C7AE]"
        }`}
      >
        <span
          className={`flex h-3 w-3 items-center justify-center rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out ${
            isOnDuty ? "translate-x-3 text-[#1E3F35]" : "translate-x-0 text-[#9E6924]"
          }`}
        >
          {isUpdating ? (
            <Loader2 className="w-2 h-2 animate-spin" />
          ) : isOnDuty ? (
            <Check className="w-2 h-2 stroke-[3]" />
          ) : (
            <Pause className="w-2 h-2 fill-current" />
          )}
        </span>
      </span>

      {showSubtext && (
        <span className="sr-only">
          {isOnDuty ? "Currently on duty. Click to switch off duty." : "Currently off duty. Click to switch on duty."}
        </span>
      )}
    </button>
  );
}

