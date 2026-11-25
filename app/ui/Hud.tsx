"use client";

import { GAME } from "@clawdrop/sdk/model";
import { creatureBySlot, pct } from "../game/creatures";
import { useGameStore } from "../game/gameStore";

/** Live rollup telemetry (left) and the 15-second timer ring (right). */
export function HudTop() {
  const txSent = useGameStore((s) => s.txSent);
  const latency = useGameStore((s) => s.avgLatencyMs);
  const timeLeft = useGameStore((s) => s.timeLeft);
  const kind = useGameStore((s) => s.driverKind);
  const C = 125.66;
  const progress = Math.max(0, Math.min(1, timeLeft / GAME.windowSecs));
  return (
    <div className="relative z-20 flex items-center justify-between px-4 sm:px-7 pt-4">
      <div className="flex items-center gap-2 sm:gap-3 px-3.5 py-2 rounded-full glass-panel font-mono text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-win animate-pulse" />
          <span className="text-muted">{kind === "mock" ? "TX simulated" : "TX sent"}</span>
          <span className="text-ink font-bold">{txSent}</span>
        </div>
        <span className="text-white/15">|</span>
        <div><span className="text-muted">Fees</span><span className="text-win font-bold ml-1">0</span></div>
        <span className="hidden sm:inline text-white/15">|</span>
        <div className="hidden sm:block">
          <span className="text-muted">avg latency</span>
          <span className="text-ink font-bold ml-1" title={latency === null ? "Not measured in practice mode" : undefined}>{latency === null ? "—" : `${Math.round(latency)}ms`}</span>
        </div>
      </div>

      <div className="relative w-14 h-14 flex items-center justify-center rounded-full glass-panel shadow-glass" role="timer" aria-label={`${Math.ceil(timeLeft)} seconds left`}>
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.12)" strokeWidth="3.5" fill="none" />
          <circle cx="24" cy="24" r="20" stroke={timeLeft <= 4 ? "#F87171" : "#A855F7"} strokeWidth="3.5" strokeLinecap="round" fill="none"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
        <span className="absolute font-mono font-bold text-xs text-ink">{Math.ceil(timeLeft)}s</span>
      </div>
    </div>
  );
}

/** Floating pill over the machine: what the claw is on, and how strong the grip is right now. */
export function TargetCallout() {
  const aim = useGameStore((s) => s.aim);
  const c = aim.slot === null ? null : creatureBySlot(aim.slot);
  return (
    <div className="pointer-events-none absolute top-28 sm:top-24 left-1/2 -translate-x-1/2 z-20 transition-all duration-150" aria-live="polite">
      <div className="px-4 py-2 rounded-full glass-panel border border-white/20 shadow-glass flex items-center gap-2.5">
        {c ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
            <span className="text-xs font-semibold text-ink">{c.name}</span>
            <span className="text-white/20">·</span>
            <span className="font-mono text-xs font-bold" style={{ color: c.color }}>{c.rarity} · {pct(aim.gripBps, 1)}</span>
          </>
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-muted/60" />
            <span className="text-xs font-semibold text-muted">Off target</span>
            <span className="text-white/20">·</span>
            <span className="font-mono text-xs text-muted">no roll</span>
          </>
        )}
      </div>
    </div>
  );
}
