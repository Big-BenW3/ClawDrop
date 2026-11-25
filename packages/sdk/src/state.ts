import { PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";

export type PlayStateName = "idle" | "steering" | "dropped" | "resolved" | "expired";

/** One place a creature can be grabbed; radius 0 is an unused circle. */
export interface OnchainCircle { xCenter: number; zCenter: number; radius: number }
export interface SlotSnap { circles: OnchainCircle[]; baseGripBps: number; minGripBps: number; sellbackLamports: BN }

/** A decoded `Play` account. */
export interface Play {
  player: PublicKey; pilot: PublicKey; machine: PublicKey; bump: number;
  state: PlayStateName;
  x: number; z: number;
  startedAt: BN; droppedAt: BN;
  dropX: number; dropZ: number;
  targetSlot: number; gripBps: number; rollBps: number;
  won: boolean; claimed: boolean;
  vrfEpoch: number; nudgeCount: number;
  creditLamports: BN;
  snap: SlotSnap[];
}

export interface Slot {
  circles: OnchainCircle[]; baseGripBps: number; minGripBps: number;
  sellbackLamports: BN; supplyCap: number; minted: number; name: string;
}

export interface Machine {
  authority: PublicKey; creditPriceLamports: BN; collection: PublicKey;
  bump: number; vaultBump: number; paused: boolean; slots: Slot[]; uriPrefix: string;
}

export interface Prize { slot: number; play: PublicKey; sold: boolean; sellbackLamports: BN; bump: number }

/** Anchor decodes enums as `{ steering: {} }`; flatten to the name. */
export const stateName = (s: unknown): PlayStateName => Object.keys(s as object)[0] as PlayStateName;

export const isFinished = (s: PlayStateName) => s === "resolved" || s === "expired";
