import React from "react";

/** SK Finance logo mark ("sk") with the FOS app name. On indigo bars it sits on a white tile. */
export default function BrandMark({ size = 36, withText = true, light = false }: { size?: number; withText?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${light ? "ring-1 ring-white/40" : "ring-1 ring-[#E3E2EE]"}`}
        style={{ width: size, height: size }}
      >
        <img src="/brand/sk-mark.png" alt="SK Finance" width={size} height={size} className="h-full w-full object-contain" />
      </span>
      {withText && (
        <span className="leading-none">
          <span className={`block text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-[#393185]"}`}>FOS</span>
          <span className={`block text-[10px] font-semibold ${light ? "text-white/75" : "text-[#62607A]"}`}>SK Finance</span>
        </span>
      )}
    </span>
  );
}
