import * as anchor from "@coral-xyz/anchor";
import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";
import { MPL_CORE_ID, VALIDATORS } from "./constants";
import { MAX_CIRCLES } from "./slots";
import type { Connections } from "./connections";
import { IDL } from "./idl";
import { assetPda, machinePda, playPda, prizePda, vaultPda } from "./pda";
import { stateName, type Machine, type Play, type Prize } from "./state";

// The instruction builders never sign or send, so the wallet is a stub.
const NO_WALLET = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t } as any;
const programFor = (conn: Connection) =>
  new anchor.Program(IDL, new anchor.AnchorProvider(conn, NO_WALLET, { commitment: "processed" }));

export interface SlotConfigInput {
  /** 1..3 circles; the program wants exactly three, so unused ones are padded with radius 0. */
  circles: { xCenter: number; zCenter: number; radius: number }[]; baseGripBps: number; minGripBps: number;
  sellbackLamports: number | bigint | BN; supplyCap: number; name: string;
}

/**
 * Everything the app and the scripts need to talk to one Claw Drop machine. No React, no
 * globals: a machine is identified by its authority, everything else is derived.
 */
export class ClawClient {
  readonly machine: PublicKey;
  readonly vault: PublicKey;
  readonly base: anchor.Program;
  readonly rollup: anchor.Program;

  constructor(readonly conns: Connections, readonly authority: PublicKey) {
    this.machine = machinePda(authority);
    this.vault = vaultPda(this.machine);
    this.base = programFor(conns.base);
    this.rollup = programFor(conns.rollup);
  }

  playFor = (player: PublicKey) => playPda(this.machine, player);

  // ---- reads -------------------------------------------------------------------------------

  async fetchMachine(): Promise<Machine | null> {
    const a = await this.conns.base.getAccountInfo(this.machine);
    return a ? (this.base.coder.accounts.decode("machine", a.data) as Machine) : null;
  }

  decodePlay(data: Buffer | Uint8Array): Play {
    const raw: any = this.base.coder.accounts.decode("play", Buffer.from(data));
    return { ...raw, state: stateName(raw.state) } as Play;
  }

  /** Reads a Play from the base layer or the rollup. `null` when the account does not exist there. */
  async fetchPlay(where: "base" | "rollup", play: PublicKey): Promise<Play | null> {
    const a = await this.conns[where].getAccountInfo(play);
    return a ? this.decodePlay(a.data) : null;
  }

  async fetchPrize(asset: PublicKey): Promise<Prize | null> {
    const a = await this.conns.base.getAccountInfo(prizePda(asset));
    return a ? (this.base.coder.accounts.decode("prize", a.data) as Prize) : null;
  }

  /** True while the Play lives in a rollup (its base-layer owner is the delegation program). */
  async isDelegated(play: PublicKey): Promise<boolean> {
    const a = await this.conns.base.getAccountInfo(play);
    return !!a && a.owner.equals(DELEGATION_PROGRAM_ID);
  }

  /**
   * Watch a Play on the rollup. Websocket first (every change, however short-lived), with a
   * slow poll as a safety net because websockets can stall silently on bad links.
   * Returns an unsubscribe function.
   */
  watchPlay(play: PublicKey, onChange: (p: Play) => void, opts: { pollMs?: number; where?: "base" | "rollup" } = {}): () => void {
    const where = opts.where ?? "rollup";
    const conn = this.conns[where];
    let stopped = false;
    let last = "";
    const push = (data: Uint8Array) => {
      const key = Buffer.from(data).toString("base64");
      if (key === last) return;
      last = key;
      onChange(this.decodePlay(data));
    };
    let subId: number | undefined;
    try { subId = conn.onAccountChange(play, (info) => push(info.data), "processed"); } catch { /* poll only */ }
    const timer = setInterval(async () => {
      if (stopped) return;
      const a = await conn.getAccountInfo(play).catch(() => null);
      if (a && !stopped) push(a.data);
    }, opts.pollMs ?? 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (subId !== undefined) conn.removeAccountChangeListener(subId).catch(() => {});
    };
  }

  // ---- setup (authority) -------------------------------------------------------------------

  initMachine = (creditLamports: number | bigint | BN, uriPrefix: string): Promise<TransactionInstruction> =>
    this.base.methods.initMachine(new anchor.BN(creditLamports.toString()), uriPrefix)
      .accounts({ authority: this.authority, machine: this.machine, vault: this.vault } as any).instruction();

  setSlot = (index: number, c: SlotConfigInput): Promise<TransactionInstruction> =>
    this.base.methods.setSlot(index, {
      ...c,
      circles: Array.from({ length: MAX_CIRCLES }, (_, i) => c.circles[i] ?? { xCenter: 0, zCenter: 0, radius: 0 }),
      sellbackLamports: new anchor.BN(c.sellbackLamports.toString()),
    })
      .accounts({ authority: this.authority, machine: this.machine } as any).instruction();

  /** Migration only: close the machine account (the vault keeps its balance) so it can be re-initialised. */
  closeMachine = (): Promise<TransactionInstruction> =>
    this.base.methods.closeMachine().accounts({ authority: this.authority, machine: this.machine } as any).instruction();

  /** Migration only: point a re-initialised machine at an existing Core collection it already controls. */
  setCollection = (collection: PublicKey): Promise<TransactionInstruction> =>
    this.base.methods.setCollection().accounts({ authority: this.authority, machine: this.machine, collection } as any).instruction();

  setPaused = (paused: boolean): Promise<TransactionInstruction> =>
    this.base.methods.setPaused(paused).accounts({ authority: this.authority, machine: this.machine } as any).instruction();

  setUriPrefix = (prefix: string): Promise<TransactionInstruction> =>
    this.base.methods.setUriPrefix(prefix).accounts({ authority: this.authority, machine: this.machine } as any).instruction();

  /** The collection keypair must also sign the transaction. */
  createCollection = (collection: PublicKey, name: string, uri: string): Promise<TransactionInstruction> =>
    this.base.methods.createCollection(name, uri)
      .accounts({ authority: this.authority, machine: this.machine, collection, mplCoreProgram: MPL_CORE_ID } as any).instruction();

  // ---- play: base layer ---------------------------------------------------------------------

  /**
   * Start a game: pay the credit, fund the pilot key, and hand the Play to a rollup validator.
   * Both instructions go in ONE transaction, so the player approves once.
   */
  async startGame(player: PublicKey, pilot: PublicKey, validator: PublicKey = VALIDATORS.eu): Promise<TransactionInstruction[]> {
    const play = this.playFor(player);
    const insert = await this.base.methods.insertCredit(pilot)
      .accounts({ player, machine: this.machine, vault: this.vault, pilot, play } as any).instruction();
    const delegate = await this.base.methods.delegatePlay()
      .accounts({ player, machine: this.machine, play } as any)
      .remainingAccounts([{ pubkey: validator, isSigner: false, isWritable: false }]).instruction();
    return [insert, delegate];
  }

  /** Claim a finished game: mints the prize on a win, refunds on expiry or a reached supply cap. */
  async claim(player: PublicKey, game?: number): Promise<TransactionInstruction> {
    const m = await this.fetchMachine();
    if (!m) throw new Error("machine not found");
    const play = this.playFor(player);
    // `game` is the Play's vrfEpoch; read it from base when the caller does not have it.
    const epoch = game ?? (await this.fetchPlay("base", play))?.vrfEpoch;
    if (epoch === undefined) throw new Error("no play to claim");
    const asset = assetPda(play, epoch);
    return this.base.methods.claim().accounts({
      player, machine: this.machine, vault: this.vault, play, asset, prize: prizePda(asset),
      collection: m.collection, mplCoreProgram: MPL_CORE_ID,
    } as any).instruction();
  }

  async sellBack(owner: PublicKey, asset: PublicKey): Promise<TransactionInstruction> {
    const m = await this.fetchMachine();
    if (!m) throw new Error("machine not found");
    return this.base.methods.sellBack().accounts({
      owner, machine: this.machine, vault: this.vault, asset, prize: prizePda(asset),
      collection: m.collection, mplCoreProgram: MPL_CORE_ID,
    } as any).instruction();
  }

  // ---- play: rollup -------------------------------------------------------------------------

  nudge = (pilot: PublicKey, play: PublicKey, dx: number, dz: number): Promise<TransactionInstruction> =>
    this.rollup.methods.nudge(dx, dz).accounts({ pilot, play } as any).instruction();

  dropClaw = (pilot: PublicKey, play: PublicKey): Promise<TransactionInstruction> =>
    this.rollup.methods.dropClaw().accounts({ pilot, play } as any).instruction();

  dropClawTimeout = (payer: PublicKey, play: PublicKey): Promise<TransactionInstruction> =>
    this.rollup.methods.dropClawTimeout().accounts({ payer, play } as any).instruction();

  forceExpire = (payer: PublicKey, play: PublicKey): Promise<TransactionInstruction> =>
    this.rollup.methods.forceExpire().accounts({ payer, play } as any).instruction();

  settle = (payer: PublicKey, play: PublicKey): Promise<TransactionInstruction> =>
    this.rollup.methods.settle().accounts({ payer, play } as any).instruction();
}

export type { Keypair };
