"use client";

import Link from "next/link";
import { SLOT_TABLE } from "@clawdrop/sdk/model";
import { getDriver } from "../game";
import { CREATURES, pct } from "../game/creatures";
import { useGameStore } from "../game/gameStore";
import { CreatureCanvas } from "../scene/CreatureCanvas";
import { Lottie } from "../scene/Lottie";
import { CardEffects } from "../ui/CardEffects";
import { GlassCard } from "../ui/GlassCard";
import { Icon } from "../ui/Icon";
import { PracticeBadge } from "../ui/PracticeBadge";
import { WalletSheet } from "../ui/WalletSheet";

/** "Your shelf" (section 3.8): a slot per creature, filled or a dashed silhouette. */
export function CollectionView() {
  const inventory = useGameStore((s) => s.inventory);
  const connected = useGameStore((s) => s.wallet.connected);
  const kind = useGameStore((s) => s.driverKind);
  const shelf = useGameStore((s) => s.shelf);
  const owned = CREATURES.filter((c) => (inventory[c.id] ?? 0) > 0);
  const d = getDriver();

  return (
    <div id="view-collection" className="min-h-screen w-full arcade-grid pt-20 pb-16 px-4 sm:px-8">
      <CardEffects />
      <PracticeBadge className="fixed top-4 left-1/2 -translate-x-1/2 z-20" />
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/play" className="text-xs font-mono text-accent hover:underline mb-2 inline-block cursor-pointer"><Icon name="arrow-left" sw={2.5} /> Back to arcade</Link>
            <h1 className="font-display font-bold text-3xl sm:text-5xl text-ink flex items-center gap-2">
              Your shelf <Lottie name="monstersCute" className="-my-3 block shrink-0" style={{ width: "5rem", height: "5rem", minWidth: "5rem" }} />
            </h1>
            <p className="font-mono text-sm text-muted mt-1"><span className="text-accent font-bold">{owned.length}</span> of {CREATURES.length} creatures collected</p>
          </div>
          <Link href="/play" className="spring-btn px-6 py-3 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-semibold text-sm shadow-neon-violet cursor-pointer">Play to fill your shelf</Link>
        </div>

        {kind === "chain" && !connected && (
          <GlassCard className="mb-8 p-6 rounded-[28px] border border-white/10 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">Connect your wallet to see the creatures you own.</p>
            <button onClick={() => d.requestConnect()} className="spring-btn px-6 py-3 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-semibold text-sm shadow-neon-violet cursor-pointer">Connect wallet</button>
          </GlassCard>
        )}

        {kind === "chain" && connected && shelf === "loading" && (
          <GlassCard className="mb-8 p-6 rounded-[28px] border border-white/10 flex items-center gap-3" aria-live="polite">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <p className="text-sm text-muted">Reading your creatures from the chain…</p>
          </GlassCard>
        )}

        {kind === "chain" && connected && shelf === "error" && (
          <GlassCard className="mb-8 p-6 rounded-[28px] border border-alert/40 flex flex-wrap items-center justify-between gap-4">
            <p role="alert" className="text-sm text-ink">We couldn&apos;t read your creatures from the chain. They&apos;re still in your wallet; this is just the view.</p>
            <button onClick={() => void d.reloadShelf()} className="spring-btn px-6 py-3 rounded-full bg-panel hover:bg-panelHover border border-white/15 text-ink font-display font-semibold text-sm cursor-pointer">Try again</button>
          </GlassCard>
        )}

        {owned.length === 0 && connected && shelf === "ready" && (
          <GlassCard className="mb-8 p-8 rounded-[32px] border border-white/10 text-center space-y-4">
            <div className="text-3xl text-accent flex justify-center"><Icon name="joystick" sw={1.75} className="!w-[1.2em] !h-[1.2em]" /></div>
            <h3 className="font-display font-bold text-2xl text-ink">Your shelf is empty. Go play.</h3>
            <p className="text-sm text-muted max-w-md mx-auto">Catch any of the {CREATURES.length} creatures in the arcade machine to mint them straight into your Solana wallet.</p>
            <Link href="/play" className="spring-btn inline-block px-7 py-3.5 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-bold text-sm shadow-neon-violet cursor-pointer">Play to fill your shelf</Link>
          </GlassCard>
        )}

        <div id="collection-slots-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {CREATURES.map((c) => {
            const count = inventory[c.id] ?? 0;
            const slot = SLOT_TABLE[c.slot];
            return count > 0 ? (
              <GlassCard key={c.id} className="rounded-[28px] p-5 border border-white/15 flex flex-col justify-between relative">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold" style={{ background: `${c.color}22`, color: c.color }}>{c.rarity}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-accent text-white font-mono text-xs font-bold">×{count}</span>
                </div>
                <div className="w-full h-40 mx-auto my-1"><CreatureCanvas id={c.id} /></div>
                <div>
                  <h4 className="font-display font-bold text-lg text-ink">{c.name}</h4>
                  <button onClick={() => void d.sellBackFromShelf(c.id)} className="spring-btn mt-3 w-full py-2.5 rounded-full bg-panel hover:bg-panelHover border border-white/15 text-xs font-semibold text-ink cursor-pointer">
                    Sell back · <span className="font-mono text-win">{(slot.sellbackLamports / 1e9).toFixed(2)} SOL</span>
                  </button>
                </div>
              </GlassCard>
            ) : (
              <div key={c.id} className="rounded-[28px] border-2 border-dashed border-white/15 bg-panel/30 p-5 flex flex-col items-center justify-center text-center min-h-[260px]">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center font-display font-bold text-2xl text-muted mb-3" aria-hidden="true">?</div>
                <div className="text-xs font-semibold text-muted">{c.name}</div>
                <div className="font-mono text-[11px] text-muted/70 mt-0.5">{c.rarity} · {pct(slot.baseGripBps)}</div>
              </div>
            );
          })}
        </div>
      </div>
      <WalletSheet />
    </div>
  );
}
