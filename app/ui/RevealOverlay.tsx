"use client";

import Link from "next/link";
import { explorerTx, SLOT_TABLE } from "@clawdrop/sdk/model";
import { getDriver } from "../game";
import { creatureBySlot, pct } from "../game/creatures";
import { useGameStore } from "../game/gameStore";
import { CreatureCanvas } from "../scene/CreatureCanvas";
import { ClawMark } from "./Logo";
import { Icon } from "./Icon";

/** Sections 3.6 and 3.7: verifying -> result card -> one-approval claim -> keep or sell back. */
export function RevealOverlay() {
  const reveal = useGameStore((s) => s.reveal);
  const slow = useGameStore((s) => s.verifyingSlow);
  const result = useGameStore((s) => s.result);
  const auditId = useGameStore((s) => s.audit[0]?.id);
  const claimBusy = useGameStore((s) => s.claimBusy);
  const claimError = useGameStore((s) => s.claimError);
  const settled = useGameStore((s) => s.settled);
  const d = getDriver();
  if (reveal === "closed") return null;

  const c = result && result.slot !== null ? creatureBySlot(result.slot) : null;
  const won = !!result?.won;
  const sellback = c ? SLOT_TABLE[c.slot].sellbackLamports / 1e9 : 0;

  return (
    <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      {reveal === "verifying" && (
        <div role="status" className="w-full max-w-sm rounded-[32px] glass-card p-8 border border-accent/40 text-center shadow-neon-violet space-y-4">
          <div className="w-14 h-14 rounded-full border-4 border-accent border-t-transparent animate-spin mx-auto" />
          <h3 className="font-display font-bold text-2xl text-ink">{slow ? "Still verifying the roll…" : "Verifying randomness…"}</h3>
          <div className="px-3.5 py-2 rounded-xl bg-base/90 border border-white/10 font-mono text-xs text-accent">roll = VRF output, grip = your aim</div>
          <p className="text-xs text-muted">{slow ? "Waiting for the VRF oracle. You can keep this open." : "Reading the verifiable random output"}</p>
        </div>
      )}

      {reveal === "result" && result && (
        <div role="dialog" aria-modal="true" aria-label="Result" className="w-full max-w-sm rounded-[32px] glass-card overflow-hidden border-t-4 shadow-glass" style={{ borderTopColor: c?.color ?? "#8A93A6" }}>
          <div className="p-6 sm:p-7 text-center">
            {won ? (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-win/15 border border-win/40 text-win font-mono text-xs font-bold mb-4"><Icon name="sparkles" sw={2.5} /> CAUGHT</div>
            ) : c ? (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-alert/15 border border-alert/40 text-alert font-mono text-xs font-bold mb-4">SLIPPED FROM CLAW</div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/5 border border-white/15 text-muted font-mono text-xs font-bold mb-4">NOTHING UNDER THE CLAW</div>
            )}

            <div className="w-52 h-52 mx-auto -my-1 flex items-center justify-center">
              {c ? <CreatureCanvas id={c.id} mode={won ? "celebrate" : "idle"} /> : <ClawMark className="w-24 h-24 opacity-30" sw={1.5} />}
            </div>

            <h3 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-2">{c ? c.name : "Missed"}</h3>
            <div className="font-mono text-xs font-semibold mt-0.5" style={{ color: c?.color ?? "#8A93A6" }}>
              {c ? `${c.rarity} · ${pct(SLOT_TABLE[c.slot].baseGripBps)} grip at the centre` : "No creature was in reach, so no roll was made."}
            </div>

            <div className="mt-5 p-4 rounded-2xl bg-base/90 border border-white/10 space-y-2 text-left">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-muted">grip chance</span>
                <span className="text-ink font-bold">{c ? pct(result.gripBps, 2) : "n/a"}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-muted">VRF roll</span>
                {c ? (
                  <span className={`${won ? "text-win" : "text-alert"} font-bold`}>roll {pct(result.rollBps, 2)} {won ? "<" : "≥"} {pct(result.gripBps, 2)}</span>
                ) : <span className="text-muted">none</span>}
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center justify-between font-mono text-[11px]">
                {result.signature ? (
                  <a href={explorerTx(result.signature, process.env.NEXT_PUBLIC_ROLLUP_URL || "https://devnet-eu.magicblock.app")} target="_blank" rel="noreferrer" className="text-muted hover:text-ink hover:underline">tx: {result.signature.slice(0, 4)}…{result.signature.slice(-4)}</a>
                ) : <span className="text-muted">practice, no transaction</span>}
                {auditId && (
                  <Link href={`/fairness?play=${auditId}`} onClick={() => d.closeReveal()} className="text-link hover:underline cursor-pointer">
                    Verify this roll <Icon name="arrow-up-right" sw={2.5} />
                  </Link>
                )}
              </div>
            </div>

            {won ? (
              <div className="mt-6 space-y-2.5">
                <button onClick={() => d.openClaim()} className="spring-btn w-full py-4 rounded-full bg-win hover:bg-emerald-400 text-[1rem] font-display font-bold text-lg shadow-neon-win cursor-pointer">Claim to wallet</button>
              </div>
            ) : (
              <div className="mt-6 space-y-2.5">
                <button onClick={() => d.playAgain()} className="spring-btn w-full py-4 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-bold text-lg shadow-neon-violet cursor-pointer">Play again</button>
                <button onClick={() => d.closeReveal()} className="w-full py-2 text-xs font-medium text-muted hover:text-ink cursor-pointer">Back to machine</button>
              </div>
            )}
          </div>
        </div>
      )}

      {(reveal === "claim" || reveal === "choice") && c && (
        <div role="dialog" aria-modal="true" aria-label="Claim" className="w-full max-w-sm rounded-[32px] glass-card p-6 sm:p-7 border border-win/40 shadow-neon-win text-center space-y-4">
          {reveal === "claim" ? (
            <div>
              <div className="w-12 h-12 rounded-2xl bg-win/20 border border-win/40 text-win flex items-center justify-center mx-auto mb-3 font-bold text-xl"><Icon name="check" sw={3} /></div>
              <h3 className="font-display font-bold text-2xl text-ink">Claim your NFT</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">One approval mints the {c.name} NFT straight into your wallet.</p>
              {claimError && <div role="alert" className="mt-4 p-3 rounded-2xl bg-alert/15 border border-alert/40 text-xs font-medium text-ink">{claimError}</div>}
              {claimBusy && <div role="status" className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-muted"><span className="w-3.5 h-3.5 rounded-full border-2 border-win border-t-transparent animate-spin" /> {claimBusy}</div>}
              <button onClick={() => void d.approveClaim()} disabled={!!claimBusy} className="spring-btn mt-5 w-full py-3.5 rounded-full bg-win hover:bg-emerald-400 text-[1rem] font-display font-bold shadow-neon-win cursor-pointer disabled:opacity-60">{claimError ? "Try again" : "Approve claim"}</button>
              {!settled && !claimBusy && <p className="mt-2 text-[11px] text-muted">Your game is being committed to the base layer. This takes a moment.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-win/15 text-win font-mono text-xs font-bold"><Icon name="check" sw={3} /> Minted to wallet</div>
              <h3 className="font-display font-bold text-2xl text-ink">Keep or sell back?</h3>
              <p className="text-xs text-muted">Display <strong className="text-ink">{c.name}</strong> on your shelf or sell it back to the machine.</p>
              <div className="grid grid-cols-1 gap-2.5 pt-2">
                <button onClick={() => d.keepPrize()} className="spring-btn w-full py-3.5 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-bold text-[1rem] shadow-neon-violet cursor-pointer">Keep in collection</button>
                <button onClick={() => void d.sellBackLast()} className="spring-btn w-full py-3.5 rounded-full bg-panel hover:bg-panelHover border border-white/15 text-ink font-display font-semibold text-sm cursor-pointer">
                  Sell back for <span className="font-mono text-win">{sellback.toFixed(2)} SOL</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
