// The rules behind "Fund for testing", kept free of Next and web3 so they are unit-tested.
//
// Devnet SOL is free but the treasury is finite (3 SOL = 12 grants), so every grant is limited per
// wallet and per IP, refused to wallets that already have enough, and refused when the treasury
// is nearly empty. State is in memory: it resets when the server restarts, which is fine for a
// demo and is the one thing to know if a deployment is scaled to several instances.

export const GRANT_LAMPORTS = 250_000_000; // 0.25 SOL: about four rounds
export const RECIPIENT_CEILING_LAMPORTS = 1_000_000_000; // a wallet with 1 SOL or more does not need more
export const TREASURY_FLOOR_LAMPORTS = 300_000_000; // never drain the treasury below 0.3 SOL
export const WINDOW_MS = 60 * 60 * 1000;
export const PER_WALLET = 2;
export const PER_IP = 4;

export type Verdict =
  | { ok: true }
  | { ok: false; status: 400 | 429 | 503; error: "bad_address" | "rate_limited" | "already_funded" | "treasury_low" };

export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}

  private recent(key: string): number[] {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < WINDOW_MS);
    if (list.length) this.hits.set(key, list); else this.hits.delete(key);
    return list;
  }

  /** Would a grant to this wallet from this IP be within the limits? */
  allowed(wallet: string, ip: string): boolean {
    return this.recent(`w:${wallet}`).length < PER_WALLET && this.recent(`i:${ip}`).length < PER_IP;
  }

  /** Record a grant that actually went out. */
  record(wallet: string, ip: string) {
    const t = this.now();
    for (const k of [`w:${wallet}`, `i:${ip}`]) this.hits.set(k, [...this.recent(k), t]);
  }
}

export function decide(input: {
  addressValid: boolean;
  recipientLamports: number;
  treasuryLamports: number;
  withinLimits: boolean;
}): Verdict {
  if (!input.addressValid) return { ok: false, status: 400, error: "bad_address" };
  if (!input.withinLimits) return { ok: false, status: 429, error: "rate_limited" };
  if (input.recipientLamports >= RECIPIENT_CEILING_LAMPORTS) return { ok: false, status: 429, error: "already_funded" };
  if (input.treasuryLamports < TREASURY_FLOOR_LAMPORTS + GRANT_LAMPORTS) return { ok: false, status: 503, error: "treasury_low" };
  return { ok: true };
}

/** The caller's IP behind a proxy: the first hop of `x-forwarded-for`, else a shared bucket. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "unknown";
}
