import { resolve, SLOT_TABLE, GAME } from "@clawdrop/sdk/model";
import { aimAt } from "./aim";
import type { GameDriver } from "./driver";
import { patch, showToast, useGameStore } from "./gameStore";
import { creatureById, creatureBySlot } from "./creatures";
import type { AuditEntry, RoundResult } from "./types";

/**
 * Practice driver: plays a whole game with no chain, so the UI can be built and demoed offline.
 *
 * It plays by the real rules. Grip comes from the same maths the program runs (grip.ts), the roll
 * comes from the browser's cryptographic RNG, and a win is `roll < grip`, with no boost and no
 * back-computed roll. What it cannot do is send transactions, so everything it shows is marked as
 * practice: there are no signatures, no latency figures and no explorer links.
 */

const CREDIT_SOL = GAME.creditLamports / 1e9;
/** Floor units per second at full stick. The chain can only keep up with a few hundred (see PHASE2-3-NOTES.md). */
export const CLAW_SPEED = 450;
const NUDGE_EVERY_S = 0.22;

const state = () => useGameStore.getState();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sol = (n: number) => +n.toFixed(2);

export { aimAt };

export class MockDriver implements GameDriver {
  readonly kind = "mock" as const;
  private joy = { x: 0, z: 0 };
  private sinceNudge = 0;
  private dropId = 0;
  private auditId = 0;
  private dropping = false;
  /** Exact seconds left. The store only holds it rounded to 0.1 s (to avoid 60 renders a second). */
  private remaining: number = GAME.windowSecs;

  init() { patch({ driverKind: "mock" }); }
  dispose() { /* nothing is scheduled outside the frame loop */ }

  // ---- wallet ----------------------------------------------------------------------------------
  requestConnect() { void this.connectWallet(); }
  closeWalletSheet() { patch({ walletSheet: false }); }

  async connectWallet() {
    patch((s) => ({ wallet: { ...s.wallet, connected: true, balanceSol: s.wallet.balanceSol || 1.25 }, banner: null }));
    showToast("Practice wallet connected");
    if (state().pendingStart) { patch({ pendingStart: false }); this.openCredit(); }
  }

  disconnectWallet() {
    patch((s) => ({
      wallet: { ...s.wallet, connected: false }, walletMenuOpen: false,
      banner: { message: "Connect a wallet to play.", action: "Connect", kind: "connect" },
    }));
  }

  async fundForTesting() {
    if (state().fundBusy) return;
    patch({ fundBusy: true });
    await sleep(850);
    patch((s) => ({ fundBusy: false, banner: null, wallet: { ...s.wallet, balanceSol: sol(s.wallet.balanceSol + 1) } }));
    showToast("Added 1.00 practice SOL. Nothing was sent to the chain.");
  }

  async reloadShelf() { /* the practice shelf is local: nothing to read */ }
  async copyAddress() { showToast("Practice mode has no real address to copy."); }

  // ---- starting a round -----------------------------------------------------------------------------
  primaryAction() {
    patch({ walletMenuOpen: false });
    if (!state().wallet.connected) {
      patch({ banner: { message: "Connect a wallet to play.", action: "Connect", kind: "connect" } });
      return;
    }
    this.openCredit();
  }

  openCredit() { patch({ creditSheet: "open", sheetError: null }); }
  closeCredit() { patch({ creditSheet: "closed" }); }

  async approveAndPlay() {
    const s = state();
    if (s.wallet.balanceSol < CREDIT_SOL) return;
    if (s.qa.networkDown) {
      patch({ sheetError: "The rollup isn't answering. Try again in a moment." });
      return;
    }
    patch((st) => ({ sheetError: null, creditSheet: "handoff", wallet: { ...st.wallet, balanceSol: sol(st.wallet.balanceSol - CREDIT_SOL) } }));
    await sleep(950);
    patch({ creditSheet: "closed" });
    this.startRound();
  }

  private startRound() {
    this.joy = { x: 0, z: 0 };
    this.sinceNudge = 0;
    this.dropping = false;
    this.remaining = GAME.windowSecs;
    patch({
      mode: "playing", timeLeft: GAME.windowSecs, txSent: 1, avgLatencyMs: null,
      claw: { x: GAME.startX, z: GAME.startZ }, confirmed: null, aim: aimAt(GAME.startX, GAME.startZ),
      result: null, banner: null, reveal: "closed",
    });
  }

  // ---- during a round ---------------------------------------------------------------------------------
  setInput(x: number, z: number) { this.joy = { x, z }; }

  tick(dt: number) {
    const s = state();
    if (s.mode !== "playing" || this.dropping) return;
    // The round clock is wall-clock time: a slow phone must not get a longer round, and a
    // background tab that comes back late has simply run out of time, like the onchain window.
    // Only the claw's movement is capped per frame, so a stall cannot teleport it.
    const step = Math.min(dt, 0.1);
    // Resync if something else set the clock (the QA menu, a test); otherwise count down exactly.
    if (Math.abs(this.remaining - s.timeLeft) > 0.2) this.remaining = s.timeLeft;
    this.remaining = Math.max(0, this.remaining - dt);
    const timeLeft = this.remaining;

    let { x: vx, z: vz } = this.joy;
    const len = Math.hypot(vx, vz);
    if (len > 1) { vx /= len; vz /= len; }
    const moving = len > 0.05;
    const claw = {
      x: Math.min(GAME.coordMax, Math.max(0, s.claw.x + vx * CLAW_SPEED * step)),
      z: Math.min(GAME.coordMax, Math.max(0, s.claw.z + vz * CLAW_SPEED * step)),
    };
    this.sinceNudge += step;
    let txSent = s.txSent;
    if (moving && this.sinceNudge >= NUDGE_EVERY_S) { this.sinceNudge = 0; txSent += 1; }

    const next: Parameters<typeof patch>[0] = {};
    const display = Math.round(timeLeft * 10) / 10;
    if (display !== s.timeLeft) next.timeLeft = display;
    if (claw.x !== s.claw.x || claw.z !== s.claw.z) {
      next.claw = claw;
      const aim = aimAt(claw.x, claw.z);
      if (aim.slot !== s.aim.slot || aim.gripBps !== s.aim.gripBps) next.aim = aim;
    }
    if (txSent !== s.txSent) next.txSent = txSent;
    if (Object.keys(next).length) patch(next);

    if (timeLeft <= 0) void this.drop();
  }

  async drop() {
    const s = state();
    if (s.mode !== "playing" || this.dropping) return;
    if (s.qa.soldOutSlot !== null && s.aim.slot === s.qa.soldOutSlot) {
      patch({ mode: "attract", banner: { message: "That creature is gone. Pick another.", action: "Back", kind: "dismiss" } });
      return;
    }
    this.dropping = true;
    const dropX = Math.round(s.claw.x), dropZ = Math.round(s.claw.z);
    const aim = aimAt(dropX, dropZ);
    let result: RoundResult;
    if (aim.slot === null) {
      // Nothing under the claw: a miss with no roll, exactly like the program.
      result = { slot: null, gripBps: 0, rollBps: 0, won: false, dropX, dropZ, randomnessHex: "", signature: null, simulated: true };
    } else {
      const random = crypto.getRandomValues(new Uint8Array(32));
      const { roll, won } = resolve(random, aim.gripBps);
      result = { slot: aim.slot, gripBps: aim.gripBps, rollBps: roll, won, dropX, dropZ, randomnessHex: hex(random), signature: null, simulated: true };
    }
    const id = ++this.dropId;
    patch({ mode: "dropping", result, dropRequest: { id, won: result.won, slot: result.slot } });
    // No dead ends: the reveal normally starts when the scene finishes its animation (about 4.5 s).
    // If the scene never reports back (it failed to load), start the reveal anyway.
    setTimeout(() => { if (this.dropId === id && state().mode === "dropping" && state().reveal === "closed") this.onDropAnimationEnd(); }, 12_000);
  }

  onDropAnimationEnd() {
    const slow = state().qa.slowVrf;
    patch({ reveal: "verifying", verifyingSlow: slow });
    void sleep(slow ? 2400 : 1150).then(() => {
      const result = state().result;
      if (!result) return;
      const entry: AuditEntry = { ...result, id: `practice-${++this.auditId}`, at: Date.now() };
      patch((st) => ({ reveal: "result", audit: [entry, ...st.audit].slice(0, 20) }));
    });
  }

  // ---- after a round -------------------------------------------------------------------------------------
  openClaim() { patch({ reveal: "claim" }); }

  async approveClaim() {
    const r = state().result;
    if (!r?.won || r.slot === null) return;
    const c = creatureBySlot(r.slot);
    patch((s) => ({ reveal: "choice", inventory: { ...s.inventory, [c.id]: (s.inventory[c.id] ?? 0) + 1 } }));
    showToast(`${c.name} minted to your practice shelf. Nothing was sent to the chain.`);
  }

  keepPrize() {
    const r = state().result;
    this.closeReveal();
    if (r?.slot != null) showToast(`${creatureBySlot(r.slot).name} added to your shelf`);
  }

  async sellBackLast() {
    const r = state().result;
    if (r?.slot == null) return;
    this.closeReveal();
    await this.sellBackFromShelf(creatureBySlot(r.slot).id);
  }

  async sellBackFromShelf(creatureId: string) {
    const c = creatureById(creatureId);
    if (!c || !(state().inventory[creatureId] > 0)) return;
    const price = SLOT_TABLE[c.slot].sellbackLamports / 1e9;
    patch((s) => ({
      inventory: { ...s.inventory, [creatureId]: s.inventory[creatureId] - 1 },
      wallet: { ...s.wallet, balanceSol: sol(s.wallet.balanceSol + price) },
    }));
    showToast(`Sold back ${c.name} for +${price.toFixed(2)} SOL. Practice mode: nothing was sent.`);
  }

  closeReveal() {
    this.dropping = false;
    patch((s) => ({ reveal: "closed", mode: "attract", resetRequest: s.resetRequest + 1 }));
  }

  playAgain() {
    this.closeReveal();
    this.openCredit();
  }

  // ---- attract mode ------------------------------------------------------------------------------------------
  enterArcade() {
    this.dropping = false;
    patch({ mode: "attract", banner: null });
  }

  leaveArcade() {
    this.joy = { x: 0, z: 0 };
    patch({ mode: "attract", creditSheet: "closed", reveal: "closed", walletMenuOpen: false, oddsOpen: false });
  }
}

