import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  icon: LucideIcon;
  accentColor?: "olive" | "terracotta" | "amber" | "default";
}

export default function MetricCard({
  title,
  value,
  trend,
  trendType = "positive",
  subtitle,
  icon: Icon,
  accentColor = "default",
}: MetricCardProps) {
  const getIconStyles = () => {
    switch (accentColor) {
      case "olive":
        return "bg-beige-olive-subtle text-beige-olive";
      case "terracotta":
        return "bg-beige-terracotta-subtle text-beige-terracotta";
      case "amber":
        return "bg-beige-amber-subtle text-beige-amber";
      default:
        return "bg-beige-sand text-beige-text";
    }
  };

  const getTrendStyles = () => {
    switch (trendType) {
      case "positive":
        return "text-beige-olive bg-beige-olive-subtle/80";
      case "negative":
        return "text-[#9E3F3F] bg-[#FBEBEB]";
      default:
        return "text-beige-muted bg-beige-sand";
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-[0_1px_3px_rgba(48,45,40,0.04)] hover:border-beige-border-dark transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-beige-muted uppercase tracking-wider block">
            {title}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-beige-text tracking-tight">
              {value}
            </span>
          </div>
        </div>
        <div className={`p-2.5 rounded-xl ${getIconStyles()}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(trend || subtitle) && (
        <div className="mt-4 pt-3 border-t border-beige-border/60 flex items-center justify-between text-xs">
          {trend && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-medium ${getTrendStyles()}`}>
              {trend}
            </span>
          )}
          {subtitle && (
            <span className="text-beige-muted truncate ml-auto">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
