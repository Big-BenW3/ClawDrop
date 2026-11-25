"use client";

import { useEffect } from "react";
import { CREATURES, gripRangeLabel } from "../game/creatures";
import { CREATURE_SVG } from "../game/creatureSvgs";
import { patch, useGameStore } from "../game/gameStore";
import { Icon } from "./Icon";

export function OddsModal() {
  const open = useGameStore((s) => s.oddsOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") patch({ oddsOpen: false }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Machine odds" className="w-full max-w-md rounded-[32px] glass-card p-6 border border-white/15 shadow-glass">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-xl text-ink">Machine odds</h3>
          <button onClick={() => patch({ oddsOpen: false })} aria-label="Close odds" className="w-8 h-8 rounded-full bg-panel text-muted hover:text-ink flex items-center justify-center cursor-pointer"><Icon name="x" sw={2.5} /></button>
        </div>
        <div className="space-y-2.5">
          {CREATURES.map((c) => (
            <div key={c.id} className="p-3 rounded-2xl bg-base/80 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9" dangerouslySetInnerHTML={{ __html: CREATURE_SVG[c.id] }} />
                <div>
                  <div className="text-sm font-bold text-ink">{c.name}</div>
                  <div className="text-[11px] font-mono" style={{ color: c.color }}>{c.rarity}</div>
                </div>
              </div>
              <span className="font-mono text-sm font-bold text-ink" title="Grip at the creature's centre → at the edge of its ring">{gripRangeLabel(c)}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted text-center">Grip is highest at a creature&apos;s centre and falls to its minimum at the edge of its ring.</p>
      </div>
    </div>
  );
}
