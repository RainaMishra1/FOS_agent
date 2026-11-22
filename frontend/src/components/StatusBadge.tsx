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
        return "bg-[#F1F0F8] text-[#393185] border-[#D7D4EE] font-semibold";
      case "in_progress":
        return "bg-[#F1F0F8] text-[#393185] border-[#D7D4EE] font-semibold";
      case "assigned":
      case "pending":
      case "medium":
      case "busy":
        return "bg-[#F8EFE2] text-[#9E6924] border-[#E3E1F2] font-semibold";
      case "delayed":
      case "high":
        return "bg-[#FDF2F2] text-[#9E3F3F] border-[#F2C6C6] font-semibold";
      case "break":
        return "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE] font-semibold";
      case "inactive":
      default:
        return "bg-[#F1F0F8] text-[#62607A] border-[#E3E2EE] font-medium";
    }
  };

  const getDotColor = () => {
    switch (normalized) {
      case "active":
      case "completed":
      case "low":
      case "in_progress":
        return "bg-[#00843E]";
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
        return "bg-[#62607A]";
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
