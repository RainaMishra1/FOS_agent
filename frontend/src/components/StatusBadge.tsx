import React from "react";
import { TaskStatus, AgentStatus, PriorityLevel } from "@/types";

interface StatusBadgeProps {
  status: TaskStatus | AgentStatus | PriorityLevel | string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const normalized = status.toLowerCase();

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  // Warm beige & earth palette badges
  const getBadgeStyle = () => {
    switch (normalized) {
      case "active":
        return "bg-beige-olive-subtle text-beige-olive border-beige-olive/30 font-medium";
      case "completed":
        return "bg-[#EBF3E8] text-[#4A6B3D] border-[#C8DEC0] font-medium";
      case "assigned":
      case "in_progress":
        return "bg-beige-terracotta-subtle text-beige-terracotta border-beige-terracotta/30 font-medium";
      case "pending":
        return "bg-beige-amber-subtle text-beige-amber border-beige-amber/30 font-medium";
      case "delayed":
        return "bg-[#FBEBEB] text-[#9E3F3F] border-[#E8C0C0] font-medium";
      case "inactive":
        return "bg-beige-sand text-beige-muted border-beige-border font-medium";
      case "busy":
        return "bg-[#F3ECDF] text-[#785E38] border-[#DFCFB6] font-medium";
      case "break":
        return "bg-beige-sidebar text-beige-text border-beige-border font-medium";
      case "high":
        return "bg-beige-terracotta-subtle text-beige-terracotta border-beige-terracotta/30 font-semibold";
      case "medium":
        return "bg-beige-amber-subtle text-beige-amber border-beige-amber/30 font-medium";
      case "low":
        return "bg-beige-olive-subtle text-beige-olive border-beige-olive/30 font-medium";
      default:
        return "bg-beige-sand text-beige-muted border-beige-border";
    }
  };

  const getDotColor = () => {
    switch (normalized) {
      case "active":
      case "completed":
      case "low":
        return "bg-beige-olive";
      case "assigned":
      case "in_progress":
      case "high":
        return "bg-beige-terracotta";
      case "pending":
      case "medium":
      case "busy":
        return "bg-beige-amber";
      case "delayed":
        return "bg-[#9E3F3F]";
      default:
        return "bg-beige-muted";
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border tracking-wide capitalize ${sizeClasses} ${getBadgeStyle()}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${getDotColor()}`} />
      {normalized.replace("_", " ")}
    </span>
  );
}
