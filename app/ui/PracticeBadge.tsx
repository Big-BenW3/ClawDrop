"use client";

import { useGameStore } from "../game/gameStore";

/**
 * Practice mode runs the real rules with no chain behind it. Anything it shows is simulated, so
 * it says so, always, in words (handoff: never ship unlabelled fake data).
 */
export function PracticeBadge({ className = "" }: { className?: string }) {
  const kind = useGameStore((s) => s.driverKind);
  if (kind !== "mock") return null;
  return (
    <div className={`pointer-events-none flex items-center gap-2 px-3 py-1 rounded-full bg-legendary/15 border border-legendary/35 text-legendary font-mono text-[11px] font-semibold ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-legendary" />
      <span>Practice mode</span>
      <span className="hidden md:inline text-legendary/80 font-normal">· simulated, nothing is sent to the chain</span>
    </div>
  );
}
