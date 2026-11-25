// Pure game constants and explorer link helpers. No web3.js, no IDL: safe for the landing page.
/** Mirrors of the program's constants (programs/claw-drop/src/state.rs). */
export const GAME = {
  slotCount: 5,
  coordMax: 1000,
  startX: 500,
  startZ: 500,
  noTarget: 255,
  windowSecs: 15,
  graceSecs: 5,
  callbackTimeoutSecs: 30,
  pilotFloatLamports: 10_000_000,
  creditLamports: 50_000_000,
} as const;

export const SEEDS = {
  machine: "machine",
  vault: "vault",
  play: "play",
  asset: "asset",
  prize: "prize",
} as const;

/** `explorer` links. The rollup is shown through the explorer's custom-RPC option. */
export const explorerTx = (sig: string, rollupUrl?: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet` + (rollupUrl ? `&customUrl=${encodeURIComponent(rollupUrl)}` : "");
export const explorerAddress = (addr: { toString(): string }, rollupUrl?: string) =>
  `https://explorer.solana.com/address/${addr.toString()}?cluster=devnet` + (rollupUrl ? `&customUrl=${encodeURIComponent(rollupUrl)}` : "");
