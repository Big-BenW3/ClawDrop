import { Keypair, PublicKey, Transaction, TransactionInstruction, type Connection } from "@solana/web3.js";
import {
  assetPda, ClawClient, createConnections, ERR, GAME, loadOrCreatePilot, MPL_CORE_ID, prizePda, programErrorName,
  sendFast, type Play,
} from "@clawdrop/sdk";
import { SLOT_TABLE } from "@clawdrop/sdk/model";
import { BASE_RPC, MACHINE_AUTHORITY, ROLLUP_URL } from "../config";
import { classifyWalletError, connectWallet, listWallets, onWalletsChange, registerMobileWallet, type ConnectedWallet } from "../wallet/wallets";
import type { GameDriver } from "./driver";
import { aimAt } from "./aim";
import { creatureBySlot } from "./creatures";
import { patch, showToast, useGameStore } from "./gameStore";
import { applyNudge, leash, LatencyWindow, MAX_IN_FLIGHT, nextNudge, type Vec } from "./nudgePlanner";
import type { AuditEntry, RoundResult } from "./types";

/**
 * The real game: every steer is a rollup transaction signed by a browser-held pilot key (no wallet
 * popups while playing), the grip roll is a VRF callback inside the rollup, and the wallet approves
 * exactly three things: the credit, the claim and a sell back.
 *
 * Steering is adaptive (see nudgePlanner.ts): the local claw moves at frame rate, and whenever a
 * send slot is free the driver sends the gap between where the player wants the claw and where the
 * chain will be once everything already sent has landed. The "ghost" is the chain's confirmed spot.
 */

const state = () => useGameStore.getState();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const CLAW_SPEED = 450; // floor units per second at full stick
const CREDIT_SOL = GAME.creditLamports / 1e9;
/** Credit + the pilot's fee float + a margin for the Play account's rent and the delegation records. */
const REQUIRED_SOL = (GAME.creditLamports + GAME.pilotFloatLamports + 10_000_000) / 1e9;
const unix = () => Math.floor(Date.now() / 1000);

class Handled extends Error {}

export class ChainDriver implements GameDriver {
  readonly kind = "chain" as const;

  private conns = createConnections({ baseUrl: BASE_RPC, rollupUrl: ROLLUP_URL });
  private client = new ClawClient(this.conns, MACHINE_AUTHORITY);
  private wallet: ConnectedWallet | null = null;
  private pilot!: Keypair;
  private playKey: PublicKey | null = null;
  private latest: Play | null = null;
  private epoch = 0;
  private unwatch: (() => void) | null = null;
  private stopWalletWatch: (() => void) | null = null;
  private balanceTimer: ReturnType<typeof setInterval> | null = null;

  // steering
  private joy: Vec = { x: 0, z: 0 };
  private want: Vec = { x: GAME.startX, z: GAME.startZ };
  private sent: Vec = { x: GAME.startX, z: GAME.startZ };
  private inFlight = 0;
  private sentCount = 0;
  private failedCount = 0;
  private lastSendAt = 0;
  private nonce = 0;
  private lat = new LatencyWindow();
  private blockhash: { hash: string; at: number } | null = null;
  private sender: ReturnType<typeof setInterval> | null = null;
  private deadline = 0;

  // round
  private starting = false;
  private dropping = false;
  private dropId = 0;
  private animDone = false;
  private resultReady = false;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- lifecycle ----------------------------------------------------------------------------------
  init() {
    patch({ driverKind: "chain", requiredSol: REQUIRED_SOL });
    this.pilot = loadOrCreatePilot(localStorage);
    void registerMobileWallet();
    const refresh = () => patch({ walletOptions: listWallets().map(({ id, name, icon, kind }) => ({ id, name, icon, kind })) });
    refresh();
    this.stopWalletWatch = onWalletsChange(refresh);
  }

  dispose() {
    this.stopSteering();
    this.unwatch?.();
    this.stopWalletWatch?.();
    if (this.balanceTimer) clearInterval(this.balanceTimer);
  }

  // ---- wallet ---------------------------------------------------------------------------------------
  requestConnect() {
    patch({ walletOptions: listWallets().map(({ id, name, icon, kind }) => ({ id, name, icon, kind })), walletSheet: true, walletError: null });
  }

  closeWalletSheet() { patch({ walletSheet: false, pendingStart: false }); }

  async connectWallet(optionId?: string) {
    const opt = listWallets().find((o) => o.id === optionId);
    if (!opt) { this.requestConnect(); return; }
    patch({ walletBusy: true, walletError: null });
    try {
      this.wallet = await connectWallet(opt);
    } catch (e) {
      patch({
        walletBusy: false,
        walletError: classifyWalletError(e) === "rejected"
          ? "You cancelled the connection. Connect again to play."
          : "Couldn't connect to that wallet. Try again, or pick another one.",
      });
      return;
    }
    // Read the balance BEFORE declaring the wallet connected: otherwise the credit sheet briefly
    // shows "you need 0.07 SOL" and a disabled button while the first balance is still loading.
    let lamports = 0;
    try { lamports = await this.conns.base.getBalance(this.wallet.publicKey); } catch { /* the poll below retries */ }
    patch((s) => ({
      walletBusy: false, walletSheet: false, banner: null,
      wallet: { ...s.wallet, connected: true, provider: this.wallet!.name, address: this.wallet!.publicKey.toBase58(), balanceSol: Math.round(lamports / 1e5) / 1e4 },
    }));
    this.playKey = this.client.playFor(this.wallet.publicKey);
    showToast(`${this.wallet.name} connected`);
    if (this.balanceTimer) clearInterval(this.balanceTimer);
    this.balanceTimer = setInterval(() => void this.refreshBalance(), 10_000);
    await this.refreshInventory();
    await this.recoverPendingPrize();
    if (state().pendingStart) { patch({ pendingStart: false }); this.openCredit(); }
  }

  disconnectWallet() {
    void this.wallet?.disconnect();
    this.wallet = null;
    this.stopSteering();
    if (this.balanceTimer) clearInterval(this.balanceTimer);
    patch((s) => ({
      wallet: { connected: false, provider: "", address: null, balanceSol: 0 }, walletMenuOpen: false, inventory: {}, assets: {},
      mode: "attract", banner: { message: "Connect a wallet to play.", action: "Connect", kind: "connect" }, creditSheet: "closed", reveal: "closed",
      ...(s.mode === "playing" ? { resetRequest: s.resetRequest + 1 } : {}),
    }));
  }

  private async refreshBalance() {
    if (!this.wallet) return;
    try {
      const lamports = await this.conns.base.getBalance(this.wallet.publicKey);
      patch((s) => ({ wallet: { ...s.wallet, balanceSol: Math.round(lamports / 1e5) / 1e4 } }));
    } catch { /* keep the last balance; the next poll tries again */ }
  }

  async fundForTesting() {
    if (!this.wallet || state().fundBusy) return;
    patch({ fundBusy: true });
    try {
      const res = await fetch("/api/fund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: this.wallet.publicKey.toBase58() }) });
      if (res.status === 404) showToast("Funding isn't set up on this deployment. Use the public devnet faucet.");
      else if (res.status === 429) showToast("You've reached the funding limit. Try again later, or use the public devnet faucet.");
      else if (!res.ok) showToast("Funding didn't go through. Try again, or use the public devnet faucet.");
      else {
        const j = (await res.json()) as { signature?: string };
        showToast("Added test SOL to your wallet", j.signature);
        await this.refreshBalance();
      }
    } catch {
      showToast("Couldn't reach the funding service. Try again in a moment.");
    } finally {
      patch({ fundBusy: false });
    }
  }

  async copyAddress() {
    const a = state().wallet.address;
    if (!a) return;
    try { await navigator.clipboard.writeText(a); showToast("Address copied to clipboard"); } catch { showToast("Couldn't copy. Select the address and copy it by hand."); }
  }

  // ---- starting a round --------------------------------------------------------------------------------------
  primaryAction() {
    patch({ walletMenuOpen: false });
    if (!this.wallet) { this.requestConnect(); return; }
    this.openCredit();
  }

  openCredit() {
    patch({ creditSheet: "open", sheetError: null });
    void this.refreshBalance();
  }

  closeCredit() { patch({ creditSheet: "closed" }); }

  async approveAndPlay() {
    if (this.starting || !this.wallet || !this.playKey) return;
    this.starting = true;
    try {
      patch({ sheetError: null });
      const lamports = await this.conns.base.getBalance(this.wallet.publicKey).catch(() => { throw new Error("network"); });
      patch((s) => ({ wallet: { ...s.wallet, balanceSol: Math.round(lamports / 1e5) / 1e4 } }));
      if (lamports < REQUIRED_SOL * 1e9) return; // the sheet shows the low balance state and the fund button

      const machine = await this.client.fetchMachine().catch(() => { throw new Error("network"); });
      if (!machine || machine.collection.equals(PublicKey.default)) throw new Handled("The machine isn't set up yet. Try again later.");
      if (machine.paused) throw new Handled("The machine is paused. Try again later.");

      patch({ creditSheet: "handoff", phase: "Checking your last game…" });
      await this.ensureFree();

      patch({ phase: "Waiting for your approval…" });
      const ixs = await this.client.startGame(this.wallet.publicKey, this.pilot.publicKey);
      const sig = await this.sendWithWallet(this.conns.base, ixs, "Starting your game…");
      const insertedAt = Date.now();

      patch({ phase: "Handing your game to the rollup…" });
      await this.until(() => this.client.isDelegated(this.playKey!), 30_000, 300, "delegation");
      const first = await this.until(() => this.client.fetchPlay("rollup", this.playKey!), 30_000, 200, "rollup");
      this.beginRound(first, insertedAt);
      void sig;
    } catch (e) {
      this.starting = false;
      this.explainStartError(e);
      return;
    }
    this.starting = false;
  }

  private beginRound(first: Play, insertedAt: number) {
    this.stopSteering();
    this.latest = first;
    this.epoch = first.vrfEpoch;
    this.dropping = false;
    this.animDone = false;
    this.resultReady = false;
    this.inFlight = 0; this.sentCount = 0; this.failedCount = 0; this.nonce = 0;
    this.sent = { x: first.x, z: first.z };
    this.want = { x: first.x, z: first.z };
    this.joy = { x: 0, z: 0 };
    this.lat.clear();
    // The player gets their full 15 seconds from the moment steering is possible, not from the credit:
    // handing the game to the rollup takes a few seconds and that must not come out of their time.
    // The program's window opens at the credit and allows a few seconds of grace, so cap the clock one
    // second inside that: only a very slow handoff shortens the round.
    this.deadline = Math.min(Date.now() + GAME.windowSecs * 1000, insertedAt + (GAME.windowSecs + GAME.graceSecs - 1) * 1000);
    this.unwatch?.();
    this.unwatch = this.client.watchPlay(this.playKey!, (p) => this.onPlay(p));
    void this.freshBlockhash();
    this.sender = setInterval(() => this.pump(), 50);
    patch({
      creditSheet: "closed", phase: null, mode: "playing", timeLeft: Math.max(0, Math.round((this.deadline - Date.now()) / 100) / 10),
      txSent: 1, avgLatencyMs: null, claw: { ...this.want }, confirmed: { x: first.x, z: first.z }, aim: aimAt(first.x, first.z),
      result: null, banner: null, reveal: "closed", settled: false, awaitingVrf: false, claimError: null, claimBusy: null, verifyingSlow: false,
    });
  }

  private explainStartError(e: unknown) {
    patch({ phase: null });
    if (e instanceof Handled) { patch({ creditSheet: "open", sheetError: e.message }); return; }
    if (classifyWalletError(e) === "rejected") { patch({ creditSheet: "open", sheetError: "You cancelled the approval. Approve it to start the game." }); return; }
    const m = String((e as Error)?.message ?? e);
    const named = this.programErrorFrom(m);
    if (named === "MachinePaused") patch({ creditSheet: "open", sheetError: "The machine is paused. Try again later." });
    else if (named === "VaultUnderfunded") patch({ creditSheet: "open", sheetError: "The machine can't cover prizes right now. Try again later." });
    else if (named === "PlayLocked") patch({ creditSheet: "open", sheetError: "Your last prize is waiting to be claimed. Claim it first." });
    else if (/insufficient|no record of a prior credit|0x1\b/i.test(m)) { patch({ creditSheet: "open" }); void this.refreshBalance(); }
    else if (/timed out waiting for (delegation|rollup)/i.test(m)) patch({ creditSheet: "open", sheetError: "The rollup isn't answering. Your credit is safe: try again in a moment and your game will be picked up." });
    else if (/network|fetch|failed to|timeout|blockhash/i.test(m)) patch({ creditSheet: "open", sheetError: "The network isn't answering. Try again in a moment." });
    else { console.error(e); patch({ creditSheet: "open", sheetError: "The game couldn't start. Try again in a moment." }); }
  }

  private programErrorFrom(msg: string): string | null {
    const hex = /custom program error: 0x([0-9a-f]+)/i.exec(msg)?.[1];
    if (!hex) return null;
    const code = parseInt(hex, 16);
    return Object.keys(ERR).find((k) => ERR[k] === code) ?? null;
  }

  // ---- recovery: a game from an earlier session may still be in the rollup ----------------------------------------------
  /** Make sure no earlier game is in the way of a new one. Throws `Handled` if a prize must be claimed first. */
  private async ensureFree() {
    await this.driveToSettled();
    const p = await this.client.fetchPlay("base", this.playKey!);
    if (p && this.owed(p)) {
      this.showPendingPrize(p);
      throw new Handled("Your last prize is waiting to be claimed. Claim it first.");
    }
  }

  private owed(p: Play) { return !p.claimed && ((p.state === "resolved" && p.won) || p.state === "expired"); }

  private async recoverPendingPrize() {
    if (!this.playKey) return;
    try {
      await this.driveToSettled();
      const p = await this.client.fetchPlay("base", this.playKey);
      if (p && this.owed(p)) { this.showPendingPrize(p); showToast("You have a prize to claim from your last game."); }
    } catch (e) { console.warn("recovery skipped", e); }
  }

  private showPendingPrize(p: Play) {
    this.epoch = p.vrfEpoch;
    const slot = p.targetSlot === GAME.noTarget ? null : p.targetSlot;
    const result: RoundResult = { slot, gripBps: p.gripBps, rollBps: p.rollBps, won: p.won, dropX: p.dropX, dropZ: p.dropZ, randomnessHex: "", signature: null, simulated: false };
    patch({ result, settled: true, reveal: "result", mode: "dropping", creditSheet: "closed", claimError: null });
  }

  /** Bring a game left in the rollup back to the base layer, whatever state it is in. */
  private async driveToSettled() {
    if (!this.playKey || !this.wallet) return;
    if (!(await this.client.isDelegated(this.playKey))) return;
    patch({ phase: "Finishing your last game…" });
    for (let i = 0; i < 40; i++) {
      if (!(await this.client.isDelegated(this.playKey))) return;
      const rp = await this.client.fetchPlay("rollup", this.playKey);
      if (!rp) { await sleep(1000); continue; }
      const mine = rp.pilot.equals(this.pilot.publicKey);
      const age = unix() - rp.startedAt.toNumber();
      if (rp.state === "resolved" || rp.state === "expired") {
        await this.rollupSend(await this.client.settle(mine ? this.pilot.publicKey : this.wallet.publicKey, this.playKey), mine);
        await this.until(async () => !(await this.client.isDelegated(this.playKey!)), 60_000, 500, "settlement");
        return;
      }
      if (rp.state === "steering") {
        if (mine) await this.rollupSend(await this.client.dropClaw(this.pilot.publicKey, this.playKey), true);
        else if (age > GAME.windowSecs + GAME.graceSecs) await this.rollupSend(await this.client.dropClawTimeout(this.wallet.publicKey, this.playKey), false);
        else await sleep(1500);
      } else if (rp.state === "dropped") {
        const since = unix() - rp.droppedAt.toNumber();
        if (since > GAME.callbackTimeoutSecs) await this.rollupSend(await this.client.forceExpire(mine ? this.pilot.publicKey : this.wallet.publicKey, this.playKey), mine);
        else await sleep(1500);
      } else await sleep(1000);
    }
    throw new Handled("Your last game is still finishing. Try again in a moment.");
  }

  /** A rollup transaction signed by the pilot (no popup) or, in recovery with a different pilot, by the wallet. */
  private async rollupSend(ix: TransactionInstruction, withPilot: boolean) {
    if (withPilot) return sendFast(this.conns.rollup, [ix], [this.pilot]);
    const tx = new Transaction().add(ix);
    tx.feePayer = this.wallet!.publicKey;
    tx.recentBlockhash = (await this.conns.rollup.getLatestBlockhash()).blockhash;
    const signed = await this.wallet!.signTransaction(tx);
    const sig = await this.conns.rollup.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await this.until(async () => (await this.conns.rollup.getSignatureStatuses([sig])).value[0]?.confirmationStatus, 20_000, 300, "rollup confirmation");
    return { signature: sig, ms: 0, err: null };
  }

  // ---- during a round -------------------------------------------------------------------------------------------------
  setInput(x: number, z: number) { this.joy = { x, z }; }

  /** QA only: put the claw on a creature's centre; the sender walks the chain there. */
  qaAimTo(slot: number) { const c = SLOT_TABLE[slot].circles[0]; this.want = { x: c.x, z: c.z }; }

  tick(dt: number) {
    const s = state();
    if (s.mode !== "playing" || this.dropping) return;
    const remaining = Math.max(0, (this.deadline - Date.now()) / 1000);
    const step = Math.min(dt, 0.1);
    let { x: vx, z: vz } = this.joy;
    const len = Math.hypot(vx, vz);
    if (len > 1) { vx /= len; vz /= len; }
    let want: Vec = {
      x: Math.min(GAME.coordMax, Math.max(0, this.want.x + vx * CLAW_SPEED * step)),
      z: Math.min(GAME.coordMax, Math.max(0, this.want.z + vz * CLAW_SPEED * step)),
    };
    want = leash(want, this.sent);
    this.want = want;

    const next: Parameters<typeof patch>[0] = {};
    const shown = Math.round(remaining * 10) / 10;
    if (shown !== s.timeLeft) next.timeLeft = shown;
    if (want.x !== s.claw.x || want.z !== s.claw.z) {
      next.claw = { ...want };
      const aim = aimAt(want.x, want.z);
      if (aim.slot !== s.aim.slot || aim.gripBps !== s.aim.gripBps) next.aim = aim;
    }
    if (Object.keys(next).length) patch(next);
    if (remaining <= 0) void this.drop();
  }

  /** Fill any free send slots with the gap between where the player wants the claw and where the chain will be. */
  private pump() {
    if (state().mode !== "playing" || this.dropping) return;
    while (this.inFlight < MAX_IN_FLIGHT) {
      const nd = nextNudge(this.want, this.sent);
      if (!nd) break;
      void this.sendNudge(nd.dx, nd.dz);
    }
  }

  private async sendNudge(dx: number, dz: number) {
    this.sent = applyNudge(this.sent, dx, dz);
    this.inFlight++;
    this.sentCount++;
    this.lastSendAt = Date.now();
    patch((s) => ({ txSent: s.txSent + 1 }));
    try {
      const hash = await this.freshBlockhash();
      const ix = await this.client.nudge(this.pilot.publicKey, this.playKey!, dx, dz);
      const r = await sendFast(this.conns.rollup, [ix], [this.pilot], { blockhash: hash, nonce: this.nonce++ });
      if (r.err) { this.failedCount++; this.onNudgeRejected(r.err); }
      else { this.lat.add(r.ms); patch({ avgLatencyMs: this.lat.mean }); }
    } catch {
      this.failedCount++;
    } finally {
      this.inFlight--;
    }
  }

  private onNudgeRejected(err: unknown) {
    const name = programErrorName(err);
    // The window closed or the game moved on under us: stop steering and take the drop now.
    if (/WindowClosed|WrongState/.test(name)) void this.drop();
  }

  private async freshBlockhash(): Promise<string> {
    if (this.blockhash && Date.now() - this.blockhash.at < 10_000) return this.blockhash.hash;
    const { blockhash } = await this.conns.rollup.getLatestBlockhash();
    this.blockhash = { hash: blockhash, at: Date.now() };
    return blockhash;
  }

  private onPlay(p: Play) {
    this.latest = p;
    patch({ confirmed: { x: p.x, z: p.z } });
    // A nudge that never landed would leave `sent` ahead of the chain forever: resync once things go quiet.
    if (state().mode === "playing" && this.inFlight === 0 && Date.now() - this.lastSendAt > 1500 && (p.x !== this.sent.x || p.z !== this.sent.z)) {
      this.sent = { x: p.x, z: p.z };
    }
  }

  private stopSteering() {
    if (this.sender) { clearInterval(this.sender); this.sender = null; }
  }

  async drop() {
    if (this.dropping || state().mode !== "playing") return;
    this.dropping = true;
    this.stopSteering();
    patch({ mode: "dropping" });
    try {
      // 1. let every nudge already sent land: the chain's position is the one that counts.
      await this.waitFor(() => this.inFlight === 0 && (this.latest?.nudgeCount ?? 0) >= this.sentCount - this.failedCount, 3500);
      const at = this.latest ? { x: this.latest.x, z: this.latest.z } : this.sent;
      // 2. ease the claw to the confirmed spot before it descends: what the player sees is what the chain recorded.
      patch({ claw: at, aim: aimAt(at.x, at.z) });
      await sleep(350);
      const aim = aimAt(at.x, at.z);
      const id = ++this.dropId;
      patch({ dropRequest: { id, won: null, slot: aim.slot }, awaitingVrf: aim.slot !== null });
      // 3. the drop itself, then wait for the VRF callback to resolve it.
      const r = await sendFast(this.conns.rollup, [await this.client.dropClaw(this.pilot.publicKey, this.playKey!)], [this.pilot]);
      if (r.err) {
        const name = programErrorName(r.err);
        // A timeout drop (or an earlier drop) already moved the game on: carry on and read its result.
        if (!/WrongState|WindowClosed/.test(name)) throw new Error(`drop failed: ${name}`);
      }
      const resolved = await this.awaitResolution();
      await this.publishResult(resolved, r.signature, id);
    } catch (e) {
      console.error(e);
      this.dropping = false;
      patch({ mode: "attract", awaitingVrf: false, dropRequest: null, resetRequest: state().resetRequest + 1, banner: { message: "The drop didn't go through. Your game is safe: reconnect in a moment to finish it.", action: "Dismiss", kind: "dismiss" } });
    }
  }

  /** Wait for the VRF callback; if it never comes, expire the game so the credit is refunded at claim. */
  private async awaitResolution(): Promise<Play> {
    const t0 = Date.now();
    for (;;) {
      const p = this.latest ?? (await this.client.fetchPlay("rollup", this.playKey!));
      if (p && (p.state === "resolved" || p.state === "expired")) return p;
      const waited = Date.now() - t0;
      if (waited > 6000 && !state().verifyingSlow) patch({ verifyingSlow: true });
      if (waited > (GAME.callbackTimeoutSecs + 4) * 1000) {
        await this.rollupSend(await this.client.forceExpire(this.pilot.publicKey, this.playKey!), true);
        const q = await this.until(async () => { const x = await this.client.fetchPlay("rollup", this.playKey!); return x && x.state === "expired" ? x : null; }, 15_000, 400, "expiry");
        return q;
      }
      // the watcher is the fast path; poll as a backstop
      const polled = await this.client.fetchPlay("rollup", this.playKey!).catch(() => null);
      if (polled) this.latest = polled;
      await sleep(250);
    }
  }

  private async publishResult(p: Play, dropSig: string, id: number) {
    const slot = p.targetSlot === GAME.noTarget ? null : p.targetSlot;
    const result: RoundResult = { slot, gripBps: p.gripBps, rollBps: p.rollBps, won: p.won, dropX: p.dropX, dropZ: p.dropZ, randomnessHex: "", signature: dropSig, simulated: false };
    const entry: AuditEntry = { ...result, id: dropSig, at: Date.now() };
    this.epoch = p.vrfEpoch;
    this.resultReady = true;
    patch((s) => ({ result, awaitingVrf: false, dropRequest: { id, won: p.won, slot }, audit: [entry, ...s.audit].slice(0, 20) }));
    // Normally the scene's animation ends and reveals the result. If it never reports (slow device,
    // failed WebGL), reveal anyway after a while: no dead ends.
    this.revealTimer = setTimeout(() => { if (!this.animDone) this.onDropAnimationEnd(); }, 20_000);
    void this.settleInBackground();
  }

  onDropAnimationEnd() {
    this.animDone = true;
    if (this.revealTimer) { clearTimeout(this.revealTimer); this.revealTimer = null; }
    if (this.resultReady) { if (state().reveal === "closed") patch({ reveal: "result" }); return; }
    // The animation finished before the result existed (it should hang until it does); show the wait.
    patch({ reveal: "verifying", verifyingSlow: state().verifyingSlow });
    const t = setInterval(() => { if (this.resultReady) { clearInterval(t); patch({ reveal: "result" }); } }, 200);
  }

  /** Commit the finished game back to the base layer with the pilot key, in the background. */
  private async settleInBackground() {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await sendFast(this.conns.rollup, [await this.client.settle(this.pilot.publicKey, this.playKey!)], [this.pilot]);
        if (r.err && !/WrongState/.test(programErrorName(r.err))) throw new Error(programErrorName(r.err));
        await this.until(async () => !(await this.client.isDelegated(this.playKey!)), 60_000, 500, "settlement");
        patch({ settled: true });
        void this.refreshBalance();
        return;
      } catch (e) {
        console.warn("settle attempt failed", e);
        await sleep(2000);
      }
    }
    patch({ claimError: "Finishing your game is taking longer than usual. Try again in a moment." });
  }

  // ---- after a round --------------------------------------------------------------------------------------------------------
  openClaim() { patch({ reveal: "claim", claimError: null }); }

  async approveClaim() {
    const r = state().result;
    if (!this.wallet || !this.playKey || !r || r.slot === null || state().claimBusy) return;
    patch({ claimBusy: "Finishing your game…", claimError: null });
    try {
      await this.until(async () => state().settled || !(await this.client.isDelegated(this.playKey!)), 90_000, 500, "settlement");
      patch({ settled: true, claimBusy: "Waiting for your approval…" });
      const ix = await this.client.claim(this.wallet.publicKey, this.epoch);
      const sig = await this.sendWithWallet(this.conns.base, [ix], "Minting your creature…");
      await this.refreshInventory();
      void this.refreshBalance();
      patch({ claimBusy: null, reveal: "choice" });
      showToast(`${creatureBySlot(r.slot).name} minted to your wallet`, sig);
    } catch (e) {
      const named = this.programErrorFrom(String((e as Error)?.message ?? e));
      if (named === "AlreadyClaimed") { await this.refreshInventory(); patch({ claimBusy: null, reveal: "choice" }); return; }
      patch({ claimBusy: null, claimError: classifyWalletError(e) === "rejected" ? "You cancelled the approval. Approve it to claim your prize." : /timed out waiting for settlement/.test(String((e as Error)?.message)) ? "Finishing your game is taking longer than usual. Try again in a moment." : "The claim didn't go through. Try again." });
      if (classifyWalletError(e) !== "rejected") console.error(e);
    }
  }

  keepPrize() {
    const r = state().result;
    this.closeReveal();
    if (r?.slot != null) showToast(`${creatureBySlot(r.slot).name} added to your shelf`);
  }

  async sellBackLast() {
    const r = state().result;
    if (!this.playKey || r?.slot == null) return;
    const asset = assetPda(this.playKey, this.epoch);
    this.closeReveal();
    await this.sellBack(asset, creatureBySlot(r.slot).name);
  }

  async sellBackFromShelf(creatureId: string) {
    const asset = state().assets[creatureId]?.[0];
    if (!asset) return;
    const slot = SLOT_TABLE.findIndex((s) => creatureBySlot(s.slot).id === creatureId);
    await this.sellBack(new PublicKey(asset), creatureBySlot(slot).name);
  }

  private async sellBack(asset: PublicKey, name: string) {
    if (!this.wallet) return;
    try {
      const ix = await this.client.sellBack(this.wallet.publicKey, asset);
      const sig = await this.sendWithWallet(this.conns.base, [ix], "Selling back…");
      await Promise.all([this.refreshInventory(), this.refreshBalance()]);
      const prize = SLOT_TABLE.find((s) => s.name === name)?.sellbackLamports ?? 0;
      showToast(`Sold back ${name} for +${(prize / 1e9).toFixed(2)} SOL`, sig);
    } catch (e) {
      if (classifyWalletError(e) === "rejected") showToast("You cancelled the approval. Nothing was sold.");
      else { console.error(e); showToast("The sell back didn't go through. Try again in a moment."); }
    }
  }

  closeReveal() {
    this.dropping = false;
    if (this.revealTimer) { clearTimeout(this.revealTimer); this.revealTimer = null; }
    patch((s) => ({ reveal: "closed", mode: "attract", awaitingVrf: false, resetRequest: s.resetRequest + 1 }));
  }

  playAgain() { this.closeReveal(); this.openCredit(); }

  enterArcade() { this.dropping = false; if (state().mode !== "playing") patch({ mode: "attract" }); }

  leaveArcade() {
    this.joy = { x: 0, z: 0 };
    patch({ creditSheet: "closed", walletMenuOpen: false, oddsOpen: false, walletSheet: false });
    if (state().mode === "playing") { this.stopSteering(); this.unwatch?.(); patch({ mode: "attract" }); }
  }

  // ---- inventory ------------------------------------------------------------------------------------------------------------------------
  /** The player's creatures: Core assets they own in this machine's collection, matched to a slot by their prize receipt. */
  async reloadShelf() { await this.refreshInventory(); }

  private async refreshInventory() {
    if (!this.wallet) return;
    patch({ shelf: "loading" });
    try {
      const machine = await this.client.fetchMachine();
      if (!machine) throw new Error("machine not set up");
      const accounts = await this.conns.base.getProgramAccounts(MPL_CORE_ID, {
        dataSlice: { offset: 0, length: 0 },
        filters: [{ memcmp: { offset: 1, bytes: this.wallet.publicKey.toBase58() } }, { memcmp: { offset: 34, bytes: machine.collection.toBase58() } }],
      });
      const assets = accounts.map((a) => a.pubkey);
      const prizes = assets.length ? await this.conns.base.getMultipleAccountsInfo(assets.map(prizePda)) : [];
      const inventory: Record<string, number> = {};
      const held: Record<string, string[]> = {};
      assets.forEach((a, i) => {
        const info = prizes[i];
        if (!info) return;
        const prize = this.client.base.coder.accounts.decode("prize", info.data) as { slot: number };
        const c = creatureBySlot(prize.slot);
        inventory[c.id] = (inventory[c.id] ?? 0) + 1;
        (held[c.id] ??= []).push(a.toBase58());
      });
      patch({ inventory, assets: held, shelf: "ready" });
    } catch (e) {
      console.warn("could not read your creatures", e);
      patch({ shelf: "error" });
    }
  }

  // ---- helpers --------------------------------------------------------------------------------------------------------------------------------
  /** Wallet signs once, we send and confirm. Throws with the wallet's or the network's error. */
  private async sendWithWallet(conn: Connection, ixs: TransactionInstruction[], phase: string): Promise<string> {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.wallet!.publicKey;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    const signed = await this.wallet!.signTransaction(tx);
    patch({ phase, claimBusy: state().claimBusy ? phase : null });
    const signature = await conn.sendRawTransaction(signed.serialize());
    const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
    return signature;
  }

  private async until<T>(fn: () => Promise<T | null | false | undefined>, timeoutMs: number, everyMs: number, what: string): Promise<T> {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v as T;
      if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
      await sleep(everyMs);
    }
  }

  private async waitFor(cond: () => boolean, ms: number) {
    const t0 = Date.now();
    while (!cond() && Date.now() - t0 < ms) await sleep(50);
  }
}

export { CREDIT_SOL };
