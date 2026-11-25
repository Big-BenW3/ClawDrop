"use client";

import { getDriver } from "../game";
import { patch, useGameStore } from "../game/gameStore";

/** An inline, contextual error banner over the machine (error catalogue: what happened, what to do). */
export function EdgeBanner() {
  const banner = useGameStore((s) => s.banner);
  if (!banner) return null;
  const act = () => {
    const d = getDriver();
    if (banner.kind === "connect") d.requestConnect();
    else if (banner.kind === "fund") void d.fundForTesting();
    else patch({ banner: null });
  };
  return (
    <div role="alert" className="absolute top-28 sm:top-20 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-md">
      <div className="px-4 py-3 rounded-2xl glass-card border border-alert/50 shadow-neon-alert flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-alert shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-ink">{banner.message}</span>
        </div>
        <button onClick={act} className="px-3.5 py-1.5 rounded-full bg-alert text-[1rem] font-display font-bold text-xs shrink-0 cursor-pointer">{banner.action}</button>
      </div>
    </div>
  );
}
