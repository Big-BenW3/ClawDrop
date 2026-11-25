export type Mode = "attract" | "playing" | "dropping";
export type RevealStep = "closed" | "verifying" | "result" | "claim" | "choice";
export type CreditSheet = "closed" | "open" | "handoff";

export interface RoundResult {
  /** The targeted prize slot, or null when nothing was under the claw (a miss: no roll is made). */
  slot: number | null;
  /** Grip at the drop point, in basis points. */
  gripBps: number;
  /** The roll, 0..9999. `won` is `rollBps < gripBps`. With no target both are 0 and won is false. */
  rollBps: number;
  won: boolean;
  dropX: number;
  dropZ: number;
  /** The 32 random bytes the roll came from (hex). Anyone can recompute `rollBps` from them. */
  randomnessHex: string;
  /** Onchain signature of the drop, or null in practice mode where nothing is sent. */
  signature: string | null;
  simulated: boolean;
}

export interface AuditEntry extends RoundResult {
  id: string;
  at: number;
}

export interface Toast {
  id: number;
  message: string;
  /** Short signature to show with an explorer link (chain mode). */
  signature?: string | null;
}

export interface Banner {
  message: string;
  action: string;
  /** What the action button does; resolved by the UI. */
  kind: "connect" | "fund" | "dismiss";
}

export interface WalletState {
  connected: boolean;
  /** `Practice wallet` in practice mode, a wallet name in chain mode. */
  provider: string;
  /** Full address, or null in practice mode (there is no real address to show). */
  address: string | null;
  balanceSol: number;
}

/** Where the claw is aimed. `slot` null means nothing is under it. */
export interface Aim {
  slot: number | null;
  gripBps: number;
}
