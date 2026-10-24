import React from "react";
import { TaskStatus, AgentStatus, PriorityLevel } from "@/types";

interface StatusBadgeProps {
  status: TaskStatus | AgentStatus | PriorityLevel | string;
  size?: "sm" | "md";
  className?: string;
  type?: string;
}

export default function StatusBadge({ status, size = "md", className = "" }: StatusBadgeProps) {
  const normalized = (status || "").toLowerCase();

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  const getBadgeStyle = () => {
    switch (normalized) {
      case "active":
      case "completed":
      case "low":
        return "bg-[#EAF2EC] text-[#1E3F35] border-[#D0E2D5] font-semibold";
      case "in_progress":
        return "bg-[#EAF2EC] text-[#1E3F35] border-[#D0E2D5] font-semibold";
      case "assigned":
      case "pending":
      case "medium":
      case "busy":
        return "bg-[#F8EFE2] text-[#9E6924] border-[#EAD4B4] font-semibold";
      case "delayed":
      case "high":
        return "bg-[#FDF2F2] text-[#9E3F3F] border-[#F2C6C6] font-semibold";
      case "break":
        return "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE] font-semibold";
      case "inactive":
      default:
        return "bg-[#EFEBE2] text-[#756F66] border-[#E6DFD3] font-medium";
    }
  };

  const getDotColor = () => {
    switch (normalized) {
      case "active":
      case "completed":
      case "low":
      case "in_progress":
        return "bg-[#1E3F35]";
      case "assigned":
      case "pending":
      case "medium":
      case "busy":
        return "bg-[#9E6924]";
      case "delayed":
      case "high":
        return "bg-[#9E3F3F]";
      case "break":
        return "bg-[#2563EB]";
      case "inactive":
      default:
        return "bg-[#756F66]";
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border tracking-wide capitalize shadow-2xs ${sizeClasses} ${getBadgeStyle()} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${getDotColor()}`} />
      {normalized.replace("_", " ")}
    </span>
  );
}
