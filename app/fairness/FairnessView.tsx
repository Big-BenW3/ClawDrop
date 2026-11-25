"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { explorerAddress, findCircleTarget, gripBps, rollBps, SLOT_TABLE } from "@clawdrop/sdk/model";
import { CREATURES, creatureBySlot, pct } from "../game/creatures";
import { useGameStore } from "../game/gameStore";
import type { AuditEntry } from "../game/types";
import { CardEffects } from "../ui/CardEffects";
import { GlassCard } from "../ui/GlassCard";
import { Icon } from "../ui/Icon";
import { PracticeBadge } from "../ui/PracticeBadge";
import { loadLiveMachine, type LiveMachine } from "./liveMachine";

const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const geos = SLOT_TABLE.map((s) => s.circles.map((c) => ({ x: c.x, z: c.z, radius: c.radius })));

/** Recompute a play from first principles: the drop point and the stored randomness. */
function recompute(e: AuditEntry) {
  const t = findCircleTarget(geos, e.dropX, e.dropZ);
  const slot = t ? t.index : null;
  const grip = t ? gripBps(t.d2, t.r2, SLOT_TABLE[t.index].baseGripBps, SLOT_TABLE[t.index].minGripBps) : 0;
  const roll = t && e.randomnessHex ? rollBps(unhex(e.randomnessHex)) : 0;
  const won = t !== null && roll < grip;
  return { slot, grip, roll, won, match: slot === e.slot && grip === e.gripBps && roll === e.rollBps && won === e.won };
}

type Live = { status: "idle" } | { status: "loading" } | { status: "ok"; machine: LiveMachine } | { status: "error"; message: string };

/** Reads the real Machine account while playing for real; practice rounds have no machine to read. */
function useLiveMachine(enabled: boolean) {
  const [live, setLive] = useState<Live>({ status: "idle" });
  const load = useCallback(() => {
    setLive({ status: "loading" });
    loadLiveMachine().then(
      (machine) => setLive({ status: "ok", machine }),
      (e) => setLive({ status: "error", message: e instanceof Error ? e.message : "Could not read the machine." }),
    );
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  return { live, reload: load };
}

const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const sol = (lamports: number) => (lamports / 1e9).toFixed(2);

/** Section 3.9: anyone can audit every play. */
export function FairnessView() {
  const audit = useGameStore((s) => s.audit);
  const kind = useGameStore((s) => s.driverKind);
  const params = useSearchParams();
  const { live, reload } = useLiveMachine(kind === "chain");
  const [query, setQuery] = useState(params.get("play") ?? "");
  const found = useMemo(() => audit.find((a) => a.id === query.trim()) ?? (query.trim() ? null : audit[0] ?? null), [audit, query]);
  const re = found ? recompute(found) : null;

  return (
    <div id="view-fairness" className="min-h-screen w-full arcade-grid pt-20 pb-16 px-4 sm:px-8">
      <CardEffects />
      <PracticeBadge className="fixed top-4 left-1/2 -translate-x-1/2 z-20" />
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <Link href="/play" className="text-xs font-mono text-accent hover:underline mb-2 inline-block cursor-pointer"><Icon name="arrow-left" sw={2.5} /> Back to arcade</Link>
          <h1 className="font-display font-bold text-3xl sm:text-5xl text-ink">Anyone can audit every play.</h1>
          <p className="text-ink/80 text-[1rem] sm:text-lg mt-3 relative z-10">Nothing about fairness is a promise; it&apos;s a cryptographic proof you can recompute.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard className="p-6 rounded-[28px] border border-white/10 space-y-3">
            <span className="font-mono text-xs text-accent uppercase tracking-wider">Grip formula</span>
            <h3 className="font-display font-bold text-xl text-ink">Skill moves the odds; it never breaks them.</h3>
            <p className="text-sm text-muted leading-relaxed">
              Each plush sits in a target ring (a creature can have up to three). Grip is highest at a ring&apos;s centre and falls in a straight line to a minimum at the ring&apos;s edge. Outside every ring there is no roll and no prize.
            </p>
            <pre className="p-3 rounded-xl bg-base/90 border border-white/10 font-mono text-xs text-win whitespace-pre-wrap">{`d² = (x − cx)² + (z − cz)²
r² = radius²
grip = min + (base − min) × (r² − d²) / r²`}</pre>
          </GlassCard>

          <GlassCard className="p-6 rounded-[28px] border border-white/10 space-y-3">
            <span className="font-mono text-xs text-link uppercase tracking-wider">Verifiable randomness</span>
            <h3 className="font-display font-bold text-xl text-ink">Every roll comes from a public VRF output</h3>
            <p className="text-sm text-muted leading-relaxed">
              Each drop asks the MagicBlock VRF oracle for 32 random bytes. The roll is those bytes, read as one big-endian number, mod 10 000. If <span className="font-mono text-win">roll &lt; grip</span>, the claw holds.
            </p>
            <pre className="p-3 rounded-xl bg-base/90 border border-white/10 font-mono text-xs text-accent whitespace-pre-wrap">{`roll = randomness mod 10000
won  = roll < grip_bps`}</pre>
          </GlassCard>
        </div>

        <GlassCard className="p-6 sm:p-8 rounded-[32px] border border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="font-display font-bold text-xl text-ink">{kind === "mock" ? "Machine odds" : "Live machine account odds"}</h3>
            <span className="font-mono text-xs text-win flex items-center gap-1.5" aria-live="polite">
              <span className={`w-2 h-2 rounded-full ${live.status === "error" ? "bg-alert" : "bg-win animate-pulse"}`} />
              {kind === "mock" ? "Practice: the table the machine is configured with"
                : live.status === "ok" ? "Read from the machine account just now"
                : live.status === "error" ? "Couldn't read the machine account"
                : "Reading the machine account…"}
            </span>
          </div>
          {kind === "chain" && live.status === "ok" && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <a href={explorerAddress(live.machine.address)} target="_blank" rel="noreferrer" className="p-3 rounded-2xl bg-base/90 border border-white/10 hover:border-accent/50 cursor-pointer">
                <div className="text-muted text-[10px]">MACHINE ACCOUNT</div><div className="text-link">{shortAddr(live.machine.address)} ↗</div>
              </a>
              <a href={explorerAddress(live.machine.vault)} target="_blank" rel="noreferrer" className="p-3 rounded-2xl bg-base/90 border border-white/10 hover:border-accent/50 cursor-pointer">
                <div className="text-muted text-[10px]">VAULT (PAYS SELL-BACKS)</div><div className="text-link">{sol(live.machine.vaultLamports)} SOL ↗</div>
              </a>
              <div className="p-3 rounded-2xl bg-base/90 border border-white/10">
                <div className="text-muted text-[10px]">CREDIT · STATUS</div><div className="text-ink">{sol(live.machine.creditLamports)} SOL · {live.machine.paused ? "paused" : "open"}</div>
              </div>
            </div>
          )}
          {kind === "chain" && live.status === "error" && (
            <div role="alert" className="mb-4 p-3 rounded-2xl bg-alert/10 border border-alert/30 text-xs text-ink flex flex-wrap items-center justify-between gap-2">
              <span>{live.message} The table below is the configuration this app was built with, not a live read.</span>
              <button onClick={reload} className="px-3 py-1.5 rounded-full bg-panel hover:bg-panelHover border border-white/15 font-mono cursor-pointer">Try again</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                  <th className="pb-2 font-normal">Creature</th><th className="pb-2 font-normal">Grip centre → edge</th>
                  <th className="pb-2 font-normal">Circles × radius</th><th className="pb-2 font-normal">Sell back</th><th className="pb-2 font-normal text-right">Minted / cap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {CREATURES.map((c) => {
                  const cfg = SLOT_TABLE[c.slot];
                  const l = live.status === "ok" ? live.machine.slots[c.slot] : null;
                  const circles = l ? l.circles : cfg.circles;
                  const base = l ? l.baseGripBps : cfg.baseGripBps, min = l ? l.minGripBps : cfg.minGripBps;
                  const sell = l ? l.sellbackLamports : cfg.sellbackLamports, cap = l ? l.supplyCap : cfg.supplyCap;
                  return (
                    <tr key={c.id}>
                      <td className="py-3.5"><span className="inline-flex items-center gap-3"><span className="w-3 h-3 rounded-full" style={{ background: c.color }} /><span className="font-semibold text-ink">{c.name}</span><span className="text-xs text-muted hidden sm:inline">({c.rarity})</span></span></td>
                      <td className="py-3.5 font-mono text-xs sm:text-sm font-bold text-ink">{pct(base)} <span className="text-muted font-normal">→ {pct(min)}</span></td>
                      <td className="py-3.5 font-mono text-xs text-muted">{circles.length} × {circles[0]?.radius ?? 0} / 1000</td>
                      <td className="py-3.5 font-mono text-xs text-ink">{sol(sell)} SOL</td>
                      <td className="py-3.5 font-mono text-xs text-muted text-right">{l ? `${l.minted.toLocaleString()} / ` : ""}{cap.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {kind === "chain" && live.status === "ok" && (
            <p className="mt-4 text-xs text-muted">
              Every plush in the machine is one of these circles. Circles: {live.machine.slots.map((s) => `${s.name} ${s.circles.map((c) => `(${c.x}, ${c.z})`).join(" ")}`).join(" · ")}.
            </p>
          )}
        </GlassCard>

        <GlassCard className="p-6 sm:p-8 rounded-[32px] border border-accent/30 shadow-neon-violet space-y-4">
          <h3 className="font-display font-bold text-xl text-ink">Audit a play</h3>
          <p className="text-xs sm:text-sm text-muted">Pick a recent play or paste its id. The page recomputes the target, the grip and the roll from the drop point and the stored randomness, and checks they match.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Play id" placeholder="Paste a play id…"
              className="flex-1 px-4 py-3 rounded-2xl bg-base border border-white/15 font-mono text-xs text-ink focus:outline-none focus:border-accent" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-muted">Recent:</span>
            {audit.slice(0, 4).map((a) => (
              <button key={a.id} onClick={() => setQuery(a.id)} className="px-2.5 py-1 rounded-full bg-panel hover:bg-panelHover border border-white/10 text-link cursor-pointer">{a.id} ({a.won ? "WIN" : "MISS"})</button>
            ))}
            {audit.length === 0 && <span className="text-muted">none yet</span>}
          </div>

          <div className="p-4 rounded-2xl bg-base/90 border border-white/10 font-mono text-xs space-y-2" aria-live="polite">
            {!found || !re ? (
              <p className="text-muted">{audit.length === 0 ? "No plays yet. Play a round, then verify it here." : "No play with that id."}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                  <span className="text-ink font-bold">{found.id}</span>
                  <span className={`${re.match ? "text-win" : "text-alert"} font-bold`}>{re.match ? <>RECOMPUTED, MATCHES <Icon name="check" sw={3} /></> : "DOES NOT MATCH"}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div><div className="text-muted text-[10px]">TARGET</div><div className="text-ink">{found.slot === null ? "none (no roll)" : creatureBySlot(found.slot).name}</div></div>
                  <div><div className="text-muted text-[10px]">GRIP</div><div className="text-ink">{found.slot === null ? "n/a" : pct(found.gripBps, 2)}</div></div>
                  <div><div className="text-muted text-[10px]">ROLL</div><div className="text-accent">{found.slot === null ? "n/a" : pct(found.rollBps, 2)}</div></div>
                  <div><div className="text-muted text-[10px]">RESULT</div><div className={found.won ? "text-win" : "text-alert"}>{found.won ? "WIN" : "MISS"}</div></div>
                </div>
                <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-muted">
                  <div>drop point ({found.dropX}, {found.dropZ}) → recomputed target {re.slot === null ? "none" : creatureBySlot(re.slot).name}, grip {re.slot === null ? "n/a" : pct(re.grip, 2)}</div>
                  {found.randomnessHex && <div className="break-all">randomness {found.randomnessHex}</div>}
                  {found.randomnessHex && <div>randomness mod 10000 = {re.roll} → {re.won ? "roll < grip: win" : "roll ≥ grip: miss"}</div>}
                  {found.simulated && <div className="text-legendary">Practice round: simulated, nothing was sent to the chain, so there is no signature to open.</div>}
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
