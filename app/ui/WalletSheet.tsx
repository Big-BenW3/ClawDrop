"use client";

import { useEffect } from "react";
import { getDriver } from "../game";
import { useGameStore } from "../game/gameStore";
import { Icon } from "./Icon";

/** Pick a wallet. Real wallets announce themselves; the test wallet is always there so nobody hits a dead end. */
export function WalletSheet() {
  const open = useGameStore((s) => s.walletSheet);
  const options = useGameStore((s) => s.walletOptions);
  const busy = useGameStore((s) => s.walletBusy);
  const error = useGameStore((s) => s.walletError);
  const d = getDriver();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") d.closeWalletSheet(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, d]);

  if (!open) return null;
  const real = options.filter((o) => o.kind === "standard");
  const test = options.find((o) => o.kind === "test");
  const here = typeof location === "undefined" ? "" : location.href;
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="Connect a wallet" className="spring-sheet w-full max-w-md rounded-t-[32px] sm:rounded-[32px] glass-card p-6 sm:p-7 border border-white/15 shadow-glass">
        <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-5" />
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-2xl text-ink">Connect a wallet</h3>
          <button onClick={() => d.closeWalletSheet()} aria-label="Close" className="w-8 h-8 rounded-full bg-panel text-muted hover:text-ink flex items-center justify-center cursor-pointer"><Icon name="x" sw={2.5} /></button>
        </div>
        <p className="mt-1 text-xs text-muted">Solana devnet. The game asks your wallet to approve three things: the credit, the claim and a sell back.</p>

        <div className="mt-5 space-y-2.5">
          {real.map((o) => (
            <button key={o.id} disabled={busy} onClick={() => void d.connectWallet(o.id)}
              className="spring-btn w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-panel hover:bg-panelHover border border-white/10 text-left cursor-pointer disabled:opacity-60">
              {o.icon ? <img src={o.icon} alt="" className="w-8 h-8 rounded-lg" /> : <span className="w-8 h-8 rounded-lg bg-accent/20" />}
              <span className="font-display font-semibold text-ink">{o.name}</span>
            </button>
          ))}
          {real.length === 0 && (
            <div className="px-4 py-3 rounded-2xl bg-base/80 border border-white/10 text-xs text-muted leading-relaxed">
              No wallet found in this browser.
              {mobile ? (
                <> Open this page inside your wallet app:
                  <span className="block mt-2 space-x-3">
                    <a className="text-link hover:underline" href={`https://phantom.app/ul/browse/${encodeURIComponent(here)}`}>Phantom</a>
                    <a className="text-link hover:underline" href={`https://solflare.com/ul/v1/browse/${encodeURIComponent(here)}`}>Solflare</a>
                  </span>
                </>
              ) : " Install a Solana wallet extension, or use the test wallet below."}
            </div>
          )}
          {test && (
            <button disabled={busy} onClick={() => void d.connectWallet(test.id)}
              className="spring-btn w-full px-4 py-3 rounded-2xl bg-accent/15 hover:bg-accent/25 border border-accent/40 text-left cursor-pointer disabled:opacity-60">
              <span className="block font-display font-semibold text-ink">{test.name}</span>
              <span className="block text-[11px] text-muted mt-0.5">A throwaway wallet saved in this browser. Devnet only: never send real funds to it.</span>
            </button>
          )}
        </div>

        {busy && <div role="status" className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-muted"><span className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" /> Waiting for your wallet…</div>}
        {error && <div role="alert" className="mt-4 p-3.5 rounded-2xl bg-alert/15 border border-alert/40 text-xs font-medium text-ink">{error}</div>}

        <a href="?practice=1" className="mt-5 block text-center text-xs text-muted hover:text-ink">Just looking? Try practice mode, no wallet needed</a>
      </div>
    </div>
  );
}
