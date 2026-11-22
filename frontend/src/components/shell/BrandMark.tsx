import React from "react";

/** FOS mark: indigo tile with a green route stroke. Original artwork, not another company's logo. */
export default function BrandMark({ size = 36, withText = true, light = false }: { size?: number; withText?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill={light ? "#FFFFFF" : "#393185"} />
        <path d="M11 28c4-1 5-6 9-8s7 0 9-5" fill="none" stroke="#00A651" strokeWidth="4" strokeLinecap="round" />
        <circle cx="11" cy="28" r="3.2" fill={light ? "#393185" : "#FFFFFF"} />
        <circle cx="29" cy="15" r="3.2" fill={light ? "#393185" : "#FFFFFF"} />
      </svg>
      {withText && (
        <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-[#393185]"}`}>
          FOS
        </span>
      )}
    </span>
  );
}
