"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { GAME } from "@clawdrop/sdk/model";
import { getDriver } from "../game";
import { CREATURES } from "../game/creatures";
import { patch, useGameStore } from "../game/gameStore";
import { input } from "../game/input";
import { aimAt } from "../game/aim";
import { MachineCanvas } from "../scene/MachineCanvas";
import { SLOT_TABLE } from "@clawdrop/sdk/model";
import { CreditSheet } from "../ui/CreditSheet";
import { EdgeBanner } from "../ui/EdgeBanner";
import { HudTop, TargetCallout } from "../ui/Hud";
import { Joystick } from "../ui/Joystick";
import { ClawMark, Wordmark } from "../ui/Logo";
import { OddsModal } from "../ui/OddsModal";
import { PracticeBadge } from "../ui/PracticeBadge";
import { QaMenu } from "../ui/QaMenu";
import { RevealOverlay } from "../ui/RevealOverlay";
import { VerifyingPill } from "../ui/VerifyingPill";
import { WalletSheet } from "../ui/WalletSheet";
import { WalletChip } from "../ui/WalletChip";

const CREDIT_SOL = GAME.creditLamports / 1e9;

/** The arcade: attract mode, the live round, the reveal and the claim, over the 3D machine. */
export function ArcadeScreen() {
  const mode = useGameStore((s) => s.mode);
  const connected = useGameStore((s) => s.wallet.connected);
  const kind = useGameStore((s) => s.driverKind);
  const owned = useGameStore((s) => CREATURES.filter((c) => (s.inventory[c.id] ?? 0) > 0).length);
  const params = useSearchParams();
  const qa = process.env.NEXT_PUBLIC_QA === "1" || params.get("qa") === "1";

  // Own the machine while this screen is mounted.
  useEffect(() => {
    const d = getDriver();
    d.enterArcade();
    return () => { input.clear(); d.leaveArcade(); };
  }, []);

  // The driver's clock. Separate from the scene's loop: the scene only reads the store.
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (t - last) / 1000; // true elapsed time: the driver caps what must be capped
      last = t;
      if (!document.hidden) getDriver().tick(dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // QA only (?qa=1): puts the claw on a creature without 15 s of steering, and exposes the test wallet.
  useEffect(() => {
    if (!qa) return;
    const hook: Record<string, unknown> = {
      store: useGameStore,
      aimTo(slot: number) {
        const d = getDriver() as unknown as { qaAimTo?: (s: number) => void };
        if (d.qaAimTo) { d.qaAimTo(slot); return; }
        const c = SLOT_TABLE[slot].circles[0];
        patch({ claw: { x: c.x, z: c.z }, aim: aimAt(c.x, c.z) });
      },
    };
    (window as unknown as Record<string, unknown>).__claw = hook;
    void import("../wallet/wallets").then((w) => { hook.testWalletAddress = () => w.testWalletKeypair().publicKey.toBase58(); });
  }, [qa]);

  // WASD / arrows steer, space drops.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === "Space" && useGameStore.getState().mode === "playing") { e.preventDefault(); void getDriver().drop(); return; }
      input.keyDown(e.key);
    };
    const up = (e: KeyboardEvent) => input.keyUp(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Deep links from the landing page: ?connect=1 connects, ?start=1 connects and opens the credit sheet.
  useEffect(() => {
    const want = params.get("start") ? "start" : params.get("connect") ? "connect" : null;
    if (!want) return;
    const d = getDriver();
    const t = setTimeout(() => {
      if (!useGameStore.getState().wallet.connected) {
        if (want === "start") patch({ pendingStart: true });
        d.requestConnect();
      } else if (want === "start") d.openCredit();
    }, 250);
    return () => clearTimeout(t);
  }, [params]);

  return (
    <div className="fixed inset-0 w-full h-full bg-base overflow-hidden select-none">
      <MachineCanvas variant="arcade" className="absolute inset-0 w-full h-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(11,14,20,0.78)_100%)]" />
      <PracticeBadge className="absolute top-[4.5rem] sm:top-3 left-1/2 -translate-x-1/2 z-20" />

      {mode === "attract" ? (
        <header className="relative z-20 flex items-center justify-between px-4 sm:px-7 pt-4 sm:pt-5">
          <Link href="/" className="flex items-center gap-2.5 px-3.5 py-2 rounded-full glass-panel hover:border-white/20 transition-colors cursor-pointer">
            <div className="w-7 h-7 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center"><ClawMark className="w-4 h-4" sw={2.4} /></div>
            <Wordmark className="text-[1rem] sm:text-lg" />
          </Link>
          <div className="flex items-center gap-2.5 relative">
            {kind === "chain" && <span className="px-3 py-1.5 rounded-full bg-win/15 border border-win/35 text-win font-mono text-xs font-semibold">Devnet</span>}
            <WalletChip />
          </div>
        </header>
      ) : (
        <HudTop />
      )}

      {mode === "playing" && <TargetCallout />}
      <EdgeBanner />

      {mode === "attract" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3.5 w-full px-4">
          <div className="px-3 py-1 rounded-full bg-base/75 border border-white/10 font-mono text-[11px] text-muted">Drag to orbit · Attract mode active</div>
          <button onClick={() => getDriver().primaryAction()} className="spring-btn px-8 py-4 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-bold text-lg sm:text-xl shadow-neon-violet flex items-center gap-3 cursor-pointer">
            <span>{connected ? `Insert credit · ${CREDIT_SOL.toFixed(2)} SOL` : "Connect wallet"}</span>
          </button>
          <div className="flex items-center gap-4 text-xs sm:text-sm font-medium text-muted">
            <button onClick={() => patch({ oddsOpen: true })} className="hover:text-ink transition-colors cursor-pointer">Odds</button>
            <span className="text-white/20">·</span>
            <Link href="/collection" className="hover:text-ink transition-colors cursor-pointer">
              Collection <span className="font-mono text-[11px] text-accent ml-0.5">({owned}/{CREATURES.length})</span>
            </Link>
            <span className="text-white/20">·</span>
            <Link href="/fairness" className="hover:text-ink transition-colors cursor-pointer">Fairness</Link>
          </div>
        </div>
      )}

      {mode === "playing" && (
        <div className="absolute bottom-6 left-0 right-0 z-20 px-6 sm:px-10 flex items-end justify-between pointer-events-none">
          <Joystick />
          <div className="pointer-events-auto flex flex-col items-center gap-2">
            <button onClick={() => void getDriver().drop()} className="drop-btn w-24 h-24 sm:w-28 sm:h-28 rounded-full font-display font-bold text-xl sm:text-2xl tracking-wide text-white flex items-center justify-center cursor-pointer">DROP</button>
            <span className="font-mono text-[11px] text-muted bg-base/75 px-2.5 py-0.5 rounded-full">Spacebar</span>
          </div>
        </div>
      )}

      <VerifyingPill />
      <WalletSheet />
      <CreditSheet />
      <RevealOverlay />
      <OddsModal />
      {qa && kind === "mock" && <QaMenu />}
    </div>
  );
}
