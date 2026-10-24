import React from "react";
import { LucideIcon } from "lucide-react";

export type SparklineType = "wavy-green" | "bars-green" | "bars-amber" | "wavy-amber";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  badge?: string;
  badgeType?: "olive" | "amber" | "terracotta" | "default";
  icon: LucideIcon;
  accentColor?: "olive" | "terracotta" | "amber" | "default";
  sparkline?: SparklineType;
}

export default function MetricCard({
  title,
  value,
  trend,
  trendType = "positive",
  subtitle,
  badge,
  badgeType,
  icon: Icon,
  accentColor = "default",
  sparkline,
}: MetricCardProps) {
  const getIconStyles = () => {
    switch (accentColor) {
      case "olive":
      case "terracotta":
        return "bg-[#EAF2EC] text-[#1E3F35]";
      case "amber":
        return "bg-[#F8EFE2] text-[#9E6924]";
      default:
        return "bg-[#EAF2EC] text-[#1E3F35]";
    }
  };

  const effectiveBadge = badge || (trend ? trend : null);
  const effectiveBadgeType = badgeType || (accentColor === "amber" ? "amber" : "olive");

  const getBadgeStyles = () => {
    switch (effectiveBadgeType) {
      case "amber":
        return "bg-[#F8EFE2] text-[#9E6924]";
      case "olive":
      case "terracotta":
        return "bg-[#EAF2EC] text-[#1E3F35]";
      default:
        return "bg-[#EFEBE2] text-[#756F66]";
    }
  };

  const renderSparkline = (type?: SparklineType) => {
    if (!type) return null;

    if (type === "wavy-green") {
      return (
        <svg width="60" height="26" viewBox="0 0 60 26" fill="none" className="overflow-visible">
          <path
            d="M2 20C10 20 14 10 24 14C34 18 40 4 58 6"
            stroke="#4A8B6F"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M2 20C10 20 14 10 24 14C34 18 40 4 58 6V26H2Z"
            fill="url(#sparklineGreenGrad)"
            opacity="0.2"
          />
          <defs>
            <linearGradient id="sparklineGreenGrad" x1="30" y1="4" x2="30" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4A8B6F" />
              <stop offset="1" stopColor="#4A8B6F" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      );
    }

    if (type === "wavy-amber") {
      return (
        <svg width="60" height="26" viewBox="0 0 60 26" fill="none" className="overflow-visible">
          <path
            d="M2 20C10 20 14 10 24 14C34 18 40 4 58 6"
            stroke="#C07A2B"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M2 20C10 20 14 10 24 14C34 18 40 4 58 6V26H2Z"
            fill="url(#sparklineAmberGrad)"
            opacity="0.2"
          />
          <defs>
            <linearGradient id="sparklineAmberGrad" x1="30" y1="4" x2="30" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C07A2B" />
              <stop offset="1" stopColor="#C07A2B" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      );
    }

    if (type === "bars-green") {
      return (
        <div className="flex items-end gap-1 h-7">
          <div className="w-1.5 h-2 bg-[#A3C9B4] rounded-t-xs" />
          <div className="w-1.5 h-3 bg-[#A3C9B4] rounded-t-xs" />
          <div className="w-1.5 h-6 bg-[#3B7A57] rounded-t-xs" />
          <div className="w-1.5 h-4.5 bg-[#6AA884] rounded-t-xs" />
          <div className="w-1.5 h-3 bg-[#A3C9B4] rounded-t-xs" />
        </div>
      );
    }

    if (type === "bars-amber") {
      return (
        <div className="flex items-end gap-1 h-7">
          <div className="w-1.5 h-2 bg-[#EAD4B4] rounded-t-xs" />
          <div className="w-1.5 h-3.5 bg-[#DEBA87] rounded-t-xs" />
          <div className="w-1.5 h-6 bg-[#B88746] rounded-t-xs" />
          <div className="w-1.5 h-4.5 bg-[#C99E61] rounded-t-xs" />
          <div className="w-1.5 h-2.5 bg-[#EAD4B4] rounded-t-xs" />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="p-4 rounded-2xl bg-white border border-[#E6DFD3] shadow-[0_1px_3px_rgba(48,45,40,0.03)] hover:border-[#D6CDBC] transition-all duration-200 flex flex-col justify-between">
      {/* Top Row: Icon */}
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${getIconStyles()}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {/* Middle & Bottom Row: Info and Sparkline */}
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-medium text-[#756F66] block truncate">
            {title}
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-[#1A201C] tracking-tight mt-0.5 leading-tight">
            {value}
          </div>
          <div className="mt-2 min-h-[22px] flex items-center">
            {effectiveBadge ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[10px] ${getBadgeStyles()}`}>
                {effectiveBadge}
              </span>
            ) : subtitle ? (
              <span className="text-[10px] text-[#756F66] block truncate">
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>

        {/* Mini Sparkline Chart */}
        <div className="shrink-0 pb-1">
          {renderSparkline(sparkline)}
        </div>
      </div>
    </div>
  );
}
