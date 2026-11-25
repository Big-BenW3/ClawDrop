"use client";

import { useGameStore } from "../game/gameStore";

/** While the claw hangs closed and the VRF result is on its way: a small, non-blocking caption. */
export function VerifyingPill() {
  const awaiting = useGameStore((s) => s.awaitingVrf);
  const slow = useGameStore((s) => s.verifyingSlow);
  if (!awaiting) return null;
  return (
    <div role="status" className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 px-5 py-3 rounded-full glass-panel border border-accent/40 shadow-neon-violet flex items-center gap-3">
      <span className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      <span className="font-mono text-xs text-ink">{slow ? "Still verifying the roll…" : "Verifying randomness…"}</span>
    </div>
  );
}
