"use client";

import { useEffect } from "react";
import { explorerTx } from "@clawdrop/sdk/model";
import { patch, useGameStore } from "../game/gameStore";

/** One toast at a time, with an explorer link when the action produced a transaction. */
export function Toaster() {
  const toast = useGameStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => patch({ toast: null }), 3600);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  const sig = toast.signature;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl glass-card px-4 py-3.5 border border-win/40 shadow-neon-win flex items-center gap-3">
      <span className="w-2.5 h-2.5 rounded-full bg-win shrink-0" />
      <div className="text-xs">
        <div className="font-medium text-ink">{toast.message}</div>
        {sig && (
          <a href={explorerTx(sig)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-link mt-0.5 inline-block hover:underline">
            TX: {sig.slice(0, 4)}…{sig.slice(-4)} <span aria-hidden>↗</span>
          </a>
        )}
      </div>
    </div>
  );
}
