import { describe, expect, it } from "vitest";
import { clientIp, decide, GRANT_LAMPORTS, Limiter, PER_IP, PER_WALLET, RECIPIENT_CEILING_LAMPORTS, TREASURY_FLOOR_LAMPORTS, WINDOW_MS } from "./fundLogic";

const ok = { addressValid: true, recipientLamports: 0, treasuryLamports: 3_000_000_000, withinLimits: true };

describe("fund decision", () => {
  it("grants a fresh wallet when the treasury is healthy", () => expect(decide(ok)).toEqual({ ok: true }));
  it("rejects a bad address first", () => expect(decide({ ...ok, addressValid: false, withinLimits: false })).toMatchObject({ status: 400, error: "bad_address" }));
  it("rate limits with 429", () => expect(decide({ ...ok, withinLimits: false })).toMatchObject({ status: 429, error: "rate_limited" }));
  it("refuses a wallet that already has enough", () => {
    expect(decide({ ...ok, recipientLamports: RECIPIENT_CEILING_LAMPORTS })).toMatchObject({ status: 429, error: "already_funded" });
    expect(decide({ ...ok, recipientLamports: RECIPIENT_CEILING_LAMPORTS - 1 })).toEqual({ ok: true });
  });
  it("never takes the treasury below its floor", () => {
    expect(decide({ ...ok, treasuryLamports: TREASURY_FLOOR_LAMPORTS + GRANT_LAMPORTS - 1 })).toMatchObject({ status: 503, error: "treasury_low" });
    expect(decide({ ...ok, treasuryLamports: TREASURY_FLOOR_LAMPORTS + GRANT_LAMPORTS })).toEqual({ ok: true });
  });
});

describe("limiter", () => {
  it("caps a wallet, then lets it back in after the window", () => {
    let t = 1_000;
    const l = new Limiter(() => t);
    for (let i = 0; i < PER_WALLET; i++) { expect(l.allowed("w", `ip${i}`)).toBe(true); l.record("w", `ip${i}`); }
    expect(l.allowed("w", "other")).toBe(false);
    expect(l.allowed("w2", "other")).toBe(true);
    t += WINDOW_MS + 1;
    expect(l.allowed("w", "other")).toBe(true);
  });
  it("caps an IP across wallets", () => {
    const l = new Limiter(() => 1);
    for (let i = 0; i < PER_IP; i++) { expect(l.allowed(`w${i}`, "ip")).toBe(true); l.record(`w${i}`, "ip"); }
    expect(l.allowed("fresh", "ip")).toBe(false);
  });
  it("does not count a request that was never recorded", () => {
    const l = new Limiter(() => 1);
    for (let i = 0; i < 10; i++) expect(l.allowed("w", "ip")).toBe(true);
  });
});

describe("client ip", () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
  it("uses the first forwarded hop", () => expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4"));
  it("falls back to x-real-ip, then a shared bucket", () => {
    expect(clientIp(h({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(h({}))).toBe("unknown");
  });
});
