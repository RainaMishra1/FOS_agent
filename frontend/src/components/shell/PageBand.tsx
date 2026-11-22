import React from "react";

/** Indigo title band. Content below can overlap it with a negative top margin. */
export default function PageBand({ title, right, compact = false }: { title: string; right?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-[#393185] text-white ${compact ? "pb-14 pt-6" : "pb-20 pt-8"}`}>
      {/* Soft moving shapes */}
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/[0.06] animate-floaty" />
      <span aria-hidden className="pointer-events-none absolute right-40 top-10 h-40 w-40 rounded-full bg-[#00843E]/25 blur-2xl animate-floaty [animation-delay:-3s]" />
      <span aria-hidden className="pointer-events-none absolute -left-10 bottom-0 h-24 w-80 -skew-x-12 bg-white/[0.04]" />
      <div className="relative mx-auto flex w-full max-w-[1400px] items-end justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <h1 key={title} className="text-2xl font-extrabold tracking-tight sm:text-3xl animate-rise">
          {title}
        </h1>
        {right}
      </div>
    </div>
  );
}
