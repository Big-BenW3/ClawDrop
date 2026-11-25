"use client";

import { useState } from "react";
import { getDriver } from "../game";
import { patch, showToast, useGameStore } from "../game/gameStore";
import { GAME } from "@clawdrop/sdk/model";

/**
 * Dev-only: forces each edge/error state so they can be inspected (handoff §3.6). It is rendered
 * only with NEXT_PUBLIC_QA=1 or ?qa=1, never by default, and it only drives the practice driver.
 */
export function QaMenu() {
  const [open, setOpen] = useState(false);
  const d = getDriver();
  const run = async (state: string) => {
    setOpen(false);
    const s = useGameStore.getState();
    if (state === "no-wallet") d.disconnectWallet();
    else if (state === "rejected") { await d.connectWallet(); d.openCredit(); patch({ sheetError: "You cancelled the approval. Approve it to start the game." }); }
    else if (state === "low-balance") { await d.connectWallet(); patch((x) => ({ wallet: { ...x.wallet, balanceSol: 0.01 } })); d.openCredit(); }
    else if (state === "network-down") { await d.connectWallet(); patch((x) => ({ qa: { ...x.qa, networkDown: true } })); d.openCredit(); patch({ sheetError: "The rollup isn't answering. Try again in a moment." }); }
    else if (state === "slow-vrf") { patch((x) => ({ qa: { ...x.qa, slowVrf: true } })); showToast("Slow randomness is on. Drop the claw to see it."); }
    else if (state === "sold-out") { patch((x) => ({ qa: { ...x.qa, soldOutSlot: s.aim.slot ?? 0 } })); patch({ banner: { message: "That creature is gone. Pick another.", action: "Back", kind: "dismiss" } }); }
    else if (state === "reset") {
      patch((x) => ({ qa: { networkDown: false, slowVrf: false, soldOutSlot: null }, banner: null, creditSheet: "closed", sheetError: null, wallet: { ...x.wallet, connected: true, balanceSol: 1.25 } }));
      showToast("Back to a healthy practice state");
    }
  };
  const items: [string, string][] = [
    ["no-wallet", "1. No wallet connected"], ["rejected", "2. Rejected approval"], ["low-balance", `3. Low balance (<${GAME.creditLamports / 1e9} SOL)`],
    ["network-down", "4. Rollup unreachable"], ["slow-vrf", "5. Slow randomness"], ["sold-out", "6. Prize sold out"],
  ];
  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button onClick={() => setOpen((o) => !o)} className="px-3 py-1.5 rounded-full glass-panel border border-white/15 font-mono text-[11px] text-muted hover:text-ink shadow-glass flex items-center gap-1.5 cursor-pointer">
        <span className="w-2 h-2 rounded-full bg-accent" /><span>QA states</span>
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 w-64 rounded-2xl glass-card p-3.5 border border-white/15 shadow-glass space-y-1.5 text-xs">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted px-2 pb-1 border-b border-white/10">Simulate edge and error states</div>
          {items.map(([k, label]) => (
            <button key={k} onClick={() => void run(k)} className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-ink cursor-pointer">{label}</button>
          ))}
          <button onClick={() => void run("reset")} className="w-full text-left px-2.5 py-1.5 rounded-xl bg-accent/20 text-accent font-semibold mt-1 cursor-pointer">Reset healthy state</button>
        </div>
      )}
    </div>
  );
}
