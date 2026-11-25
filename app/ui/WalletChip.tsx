"use client";

import { getDriver } from "../game";
import { patch, useGameStore } from "../game/gameStore";
import { Icon } from "./Icon";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function WalletChip() {
  const w = useGameStore((s) => s.wallet);
  const open = useGameStore((s) => s.walletMenuOpen);
  const busy = useGameStore((s) => s.fundBusy);
  const kind = useGameStore((s) => s.driverKind);
  const d = getDriver();
  const practice = kind === "mock";
  const label = !w.connected ? "Connect wallet" : w.address ? short(w.address) : "Practice wallet";

  const onChip = () => {
    if (!w.connected) { d.requestConnect(); return; }
    patch({ walletMenuOpen: !open });
  };

  return (
    <div className="relative">
      <button onClick={onChip} aria-haspopup="menu" aria-expanded={open}
        className="spring-btn flex items-center gap-2.5 px-4 py-2 rounded-full whitespace-nowrap glass-panel hover:border-accent/50 text-sm font-medium cursor-pointer">
        <span className={`w-2 h-2 rounded-full ${w.connected ? "bg-win" : "bg-alert"}`} />
        <span className="font-mono text-xs sm:text-sm text-ink">{label}</span>
        {w.connected && <span className="hidden sm:inline font-mono text-xs text-muted border-l border-white/10 pl-2.5">{w.balanceSol.toFixed(2)} SOL</span>}
      </button>

      {open && w.connected && (
        <div role="menu" className="absolute right-0 top-14 w-72 rounded-3xl glass-card p-5 border border-white/15 shadow-glass z-40">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-muted">{practice ? "Practice mode · no chain" : `${w.provider} · Devnet`}</span>
            <button onClick={() => patch({ walletMenuOpen: false })} aria-label="Close wallet menu" className="text-muted hover:text-ink text-sm cursor-pointer"><Icon name="x" sw={2.5} /></button>
          </div>

          <button onClick={() => void d.copyAddress()} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-base/80 hover:bg-base border border-white/10 transition-colors cursor-pointer group">
            <span className="font-mono text-xs text-ink">{w.address ? short(w.address) : "Practice wallet · no address"}</span>
            <span className="font-mono text-[11px] text-accent group-hover:underline">Copy</span>
          </button>

          <div className="my-4 px-1">
            <div className="text-xs text-muted">Available balance</div>
            <div className="font-display font-bold text-3xl text-ink mt-0.5">
              <span>{w.balanceSol.toFixed(2)}</span> <span className="text-[1rem] font-mono text-muted">SOL</span>
            </div>
          </div>

          {!busy ? (
            <button onClick={() => void d.fundForTesting()} className="spring-btn w-full py-2.5 px-4 rounded-full bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer">
              <span>{practice ? "Add practice SOL (+1.0)" : "Fund for testing (+1.0 SOL)"}</span>
            </button>
          ) : (
            <div className="w-full py-2.5 px-4 rounded-2xl bg-base/80 border border-white/10 text-xs font-mono text-muted flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span>{practice ? "Adding practice SOL…" : "Requesting devnet airdrop…"}</span>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-medium">
            {practice ? <span className="text-muted">Nothing here is on chain</span> : (
              <button className="text-link hover:underline cursor-pointer">View on explorer <Icon name="arrow-up-right" sw={2.5} /></button>
            )}
            <button onClick={() => d.disconnectWallet()} className="text-alert hover:underline cursor-pointer">Disconnect</button>
          </div>
        </div>
      )}
    </div>
  );
}
