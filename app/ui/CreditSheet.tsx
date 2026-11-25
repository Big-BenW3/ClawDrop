"use client";

import { useEffect } from "react";
import { GAME } from "@clawdrop/sdk/model";
import { getDriver } from "../game";
import { useGameStore } from "../game/gameStore";

const CREDIT_SOL = GAME.creditLamports / 1e9;

/** Section 3.4: price, balance, one sentence on what the single approval does, inline funding. */
export function CreditSheet() {
  const sheet = useGameStore((s) => s.creditSheet);
  const balance = useGameStore((s) => s.wallet.balanceSol);
  const error = useGameStore((s) => s.sheetError);
  const kind = useGameStore((s) => s.driverKind);
  const phase = useGameStore((s) => s.phase);
  const required = useGameStore((s) => s.requiredSol);
  const busy = useGameStore((s) => s.fundBusy);
  const d = getDriver();
  const low = balance < required;

  useEffect(() => {
    if (sheet !== "open") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") d.closeCredit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, d]);

  if (sheet === "closed") return null;
  return (
    <div className="fixed inset-0 z-30 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="Insert credit" className="spring-sheet w-full max-w-md rounded-t-[32px] sm:rounded-[32px] glass-card p-6 sm:p-7 border border-white/15 shadow-glass">
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-5" />

        {sheet === "open" && (
          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="font-display font-bold text-2xl text-ink">One credit</h3>
              <span className="font-display font-bold text-2xl text-accent">{CREDIT_SOL.toFixed(2)} SOL</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs font-mono text-muted">
              <span>{GAME.windowSecs}s live rollup session</span>
              <span>Your balance: <strong className="text-ink">{balance.toFixed(2)} SOL</strong></span>
            </div>

            <div className="mt-5 p-4 rounded-2xl bg-base/85 border border-white/10">
              <div className="text-xs font-semibold text-ink mb-1">Exactly what the one approval does</div>
              <p className="text-xs text-muted leading-relaxed">
                Pays for your drop (<span className="font-mono text-ink">{CREDIT_SOL.toFixed(2)} SOL</span>), covers the rollup fee (<span className="font-mono text-win">0.00 SOL</span>), one approval and nothing else.
              </p>
              {kind === "mock" && <p className="mt-2 text-xs text-legendary">Practice mode: no real SOL moves and nothing is sent to the chain.</p>}
            </div>

            {low && (
              <div className="mt-4 p-3.5 rounded-2xl bg-alert/15 border border-alert/40 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-ink">You need {required.toFixed(2)} SOL to play: the credit plus a little for fees and rent.</span>
                <button onClick={() => void d.fundForTesting()} disabled={busy} className="px-3.5 py-1.5 rounded-full bg-alert text-[1rem] font-display font-bold text-xs cursor-pointer disabled:opacity-60">
                  {busy ? "Funding…" : "Fund for testing"}
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="mt-4 p-3.5 rounded-2xl bg-alert/15 border border-alert/40 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-ink">{error}</span>
                <button onClick={() => void d.approveAndPlay()} className="px-3.5 py-1.5 rounded-full bg-alert text-[1rem] font-display font-bold text-xs cursor-pointer">Retry</button>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => d.closeCredit()} className="px-5 py-3.5 rounded-full bg-panel hover:bg-panelHover border border-white/10 text-sm font-semibold text-muted hover:text-ink cursor-pointer">Cancel</button>
              <button onClick={() => void d.approveAndPlay()} disabled={low}
                className={`spring-btn flex-1 py-3.5 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-bold text-[1rem] shadow-neon-violet cursor-pointer ${low ? "opacity-40 cursor-not-allowed" : ""}`}>
                Approve &amp; play
              </button>
            </div>
          </div>
        )}

        {sheet === "handoff" && (
          <div className="py-10 text-center space-y-4" role="status">
            <div className="w-12 h-12 rounded-full border-4 border-accent border-t-transparent animate-spin mx-auto" />
            <div className="font-display font-bold text-xl text-ink">{phase ?? "Handing your game to the rollup…"}</div>
            <div className="font-mono text-xs text-muted">Delegated session · 0.00 SOL gas</div>
          </div>
        )}
      </div>
    </div>
  );
}
