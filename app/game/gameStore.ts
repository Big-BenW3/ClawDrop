import { create } from "zustand";
import { GAME } from "@clawdrop/sdk/model";
import type { Aim, AuditEntry, Banner, CreditSheet, Mode, RevealStep, RoundResult, Toast, WalletState } from "./types";

/**
 * The single source of truth for the app. React reads it through hooks, the 3D scene reads it with
 * `useGameStore.getState()` each frame, and a driver (mockDriver now, chainDriver for the real game)
 * is the only thing that writes game state. Drivers share one interface, so the UI never knows
 * whether a chain is behind it.
 */
export interface GameState {
  driverKind: "mock" | "chain";

  // ---- the round --------------------------------------------------------------------------
  mode: Mode;
  timeLeft: number;
  txSent: number;
  /** Average round-trip of steering transactions in ms; null when nothing real was measured. */
  avgLatencyMs: number | null;
  /** The claw on the 0..1000 floor: what the player sees. */
  claw: { x: number; z: number };
  /** The last position the chain confirmed (the "ghost"); null until there is one. */
  confirmed: { x: number; z: number } | null;
  aim: Aim;
  result: RoundResult | null;
  /** Bumped to ask the scene to play the drop animation; the scene reads it, never the reverse. */
  /** `won: null` means the drop is in the air and the result is not known yet: the claw hangs closed. */
  dropRequest: { id: number; won: boolean | null; slot: number | null } | null;
  /** The claw is down and the VRF result is on its way (chain mode). */
  awaitingVrf: boolean;
  /** Bumped to ask the scene to go back to its attract loop. */
  resetRequest: number;

  // ---- wallet and collection ------------------------------------------------------------------
  wallet: WalletState;
  fundBusy: boolean;
  /** What one game costs the wallet in total (credit, pilot float, a little rent). */
  requiredSol: number;
  inventory: Record<string, number>;
  /** Chain mode: whether the creatures the wallet owns have been read from the chain. */
  shelf: "ready" | "loading" | "error";
  /** Chain mode: the Core asset addresses held, by creature id. */
  assets: Record<string, string[]>;
  audit: AuditEntry[];

  // ---- UI -------------------------------------------------------------------------------------------
  creditSheet: CreditSheet;
  sheetError: string | null;
  /** Shown under the spinner while a game is being handed to the rollup. */
  phase: string | null;
  walletSheet: boolean;
  walletOptions: { id: string; name: string; icon: string; kind: "standard" | "test" }[];
  walletBusy: boolean;
  walletError: string | null;
  /** A deep link asked to start a game as soon as a wallet is connected. */
  pendingStart: boolean;
  /** The finished game is back on the base layer, so it can be claimed. */
  settled: boolean;
  claimBusy: string | null;
  claimError: string | null;
  reveal: RevealStep;
  verifyingSlow: boolean;
  oddsOpen: boolean;
  walletMenuOpen: boolean;
  toast: Toast | null;
  banner: Banner | null;

  /** Practice-mode failure switches, driven by the QA menu and never set in a real game. */
  qa: { networkDown: boolean; slowVrf: boolean; soldOutSlot: number | null };
}

const initial: GameState = {
  driverKind: "mock",
  mode: "attract",
  timeLeft: GAME.windowSecs,
  txSent: 0,
  avgLatencyMs: null,
  claw: { x: GAME.startX, z: GAME.startZ },
  confirmed: null,
  aim: { slot: null, gripBps: 0 },
  result: null,
  dropRequest: null,
  awaitingVrf: false,
  resetRequest: 0,
  wallet: { connected: false, provider: "Practice wallet", address: null, balanceSol: 0 },
  fundBusy: false,
  requiredSol: GAME.creditLamports / 1e9,
  inventory: {},
  shelf: "ready",
  assets: {},
  audit: [],
  creditSheet: "closed",
  sheetError: null,
  phase: null,
  walletSheet: false,
  walletOptions: [],
  walletBusy: false,
  walletError: null,
  pendingStart: false,
  settled: false,
  claimBusy: null,
  claimError: null,
  reveal: "closed",
  verifyingSlow: false,
  oddsOpen: false,
  walletMenuOpen: false,
  toast: null,
  banner: null,
  qa: { networkDown: false, slowVrf: false, soldOutSlot: null },
};

export const useGameStore = create<GameState>()(() => ({ ...initial }));

/** Set part of the state. Drivers and UI event handlers use this; there are no per-field setters. */
export const patch = (p: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => useGameStore.setState(p as never);

let toastId = 0;
export const showToast = (message: string, signature?: string | null) => patch({ toast: { id: ++toastId, message, signature } });
