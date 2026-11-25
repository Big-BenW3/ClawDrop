import { Keypair } from "@solana/web3.js";

/** Minimal storage so the pilot key works in a browser (localStorage) and in node (memory). */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const memoryStorage = (): KeyStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

const KEY = "clawdrop.pilot.v1";

/**
 * The pilot key signs every steer, so no wallet popup interrupts play. It only ever holds the
 * ~0.01 SOL fee float and can act on nothing but its own game. Created on first use.
 */
export function loadOrCreatePilot(storage: KeyStorage, key = KEY): Keypair {
  try {
    const raw = storage.getItem(key);
    if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch { /* corrupt or unreadable: fall through and make a new one */ }
  const kp = Keypair.generate();
  try { storage.setItem(key, JSON.stringify(Array.from(kp.secretKey))); } catch { /* private mode: key lives for this session only */ }
  return kp;
}
