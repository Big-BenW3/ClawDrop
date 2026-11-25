import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME, rollBps, SLOT_TABLE } from "@clawdrop/sdk/model";
import { aimAt, MockDriver } from "./mockDriver";
import { patch, useGameStore } from "./gameStore";

const get = () => useGameStore.getState();
const fresh = () => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  return new MockDriver();
};
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const at = (x: number, z: number) => patch({ mode: "playing", claw: { x, z }, aim: aimAt(x, z), result: null });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("aiming", () => {
  it("targets nothing from the start position", () => expect(aimAt(GAME.startX, GAME.startZ)).toEqual({ slot: null, gripBps: 0 }));
  it("gives each creature its full base grip at its exact centre", () => {
    for (const s of SLOT_TABLE) for (const c of s.circles) expect(aimAt(c.x, c.z)).toEqual({ slot: s.slot, gripBps: s.baseGripBps });
  });
  it("falls to the minimum grip on the edge of a creature's circle", () => {
    const s = SLOT_TABLE[0];
    for (const c of s.circles) {
      expect(aimAt(c.x + c.radius, c.z)).toEqual({ slot: 0, gripBps: s.minGripBps });
      expect(aimAt(c.x + c.radius + 1, c.z).slot).toBeNull();
    }
  });
});

describe("a practice round", () => {
  it("cannot start without enough balance, and takes exactly one credit", async () => {
    const d = fresh();
    await d.connectWallet();
    patch((s) => ({ wallet: { ...s.wallet, balanceSol: 0.01 } }));
    await d.approveAndPlay();
    expect(get().creditSheet).toBe("closed");
    patch((s) => ({ wallet: { ...s.wallet, balanceSol: 1.25 } }));
    const p = d.approveAndPlay();
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(get().wallet.balanceSol).toBe(1.2);
    expect(get().mode).toBe("playing");
    expect(get().timeLeft).toBe(GAME.windowSecs);
  });

  it("moves the claw with the stick, clamps it to the floor, and counts down", () => {
    const d = fresh();
    patch({ mode: "playing", claw: { x: 500, z: 500 }, timeLeft: 15 });
    d.setInput(1, 0);
    for (let i = 0; i < 60; i++) d.tick(1 / 60);
    expect(get().claw.x).toBeGreaterThan(900);
    for (let i = 0; i < 600; i++) d.tick(1 / 60);
    expect(get().claw.x).toBeLessThanOrEqual(GAME.coordMax); // clamped, never beyond the floor
    expect(get().timeLeft).toBeLessThan(15);
  });

  it("keeps the 15 second clock on real elapsed time even when frames are slow", () => {
    const d = fresh();
    patch({ mode: "playing", claw: { x: 500, z: 500 }, timeLeft: 15 });
    for (let i = 0; i < 5; i++) d.tick(2); // five 2-second frames, as a very slow device would deliver
    expect(get().timeLeft).toBe(5);
    expect(get().claw.x).toBe(500); // no input: and a long frame cannot move the claw by more than the cap
  });

  it("caps how far one long frame can move the claw, but not how much time it costs", () => {
    const d = fresh();
    patch({ mode: "playing", claw: { x: 500, z: 500 }, timeLeft: 15 });
    d.setInput(1, 0);
    d.tick(2);
    expect(get().claw.x).toBeCloseTo(500 + 450 * 0.1, 5);
    expect(get().timeLeft).toBe(13);
  });

  it("drops by itself when the 15 seconds run out", async () => {
    const d = fresh();
    patch({ mode: "playing", claw: { x: 500, z: 500 }, aim: aimAt(500, 500), timeLeft: 0.05 });
    d.tick(0.1);
    await vi.advanceTimersByTimeAsync(0);
    expect(get().mode).toBe("dropping");
    expect(get().result).not.toBeNull();
  });

  it("a drop on empty floor is a miss with no roll and no randomness", async () => {
    const d = fresh();
    at(GAME.startX, GAME.startZ);
    await d.drop();
    expect(get().result).toMatchObject({ slot: null, won: false, rollBps: 0, gripBps: 0, randomnessHex: "", signature: null, simulated: true });
    expect(get().dropRequest).toMatchObject({ won: false, slot: null });
  });

  it("every roll is recomputable from its stored randomness, and a win is exactly roll < grip", async () => {
    for (let i = 0; i < 200; i++) {
      const d = fresh();
      const s = SLOT_TABLE[i % 5];
      at(s.circles[0].x, s.circles[0].z);
      await d.drop();
      const r = get().result!;
      expect(r.slot).toBe(s.slot);
      expect(r.gripBps).toBe(s.baseGripBps);
      expect(rollBps(unhex(r.randomnessHex))).toBe(r.rollBps);
      expect(r.won).toBe(r.rollBps < r.gripBps);
      expect(r.simulated).toBe(true);
    }
  });

  it("wins about as often as the grip says, with no boost (Common, 70%)", async () => {
    let wins = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const d = fresh();
      at(SLOT_TABLE[0].circles[0].x, SLOT_TABLE[0].circles[0].z);
      await d.drop();
      if (get().result!.won) wins++;
    }
    expect(wins / n).toBeGreaterThan(0.67);
    expect(wins / n).toBeLessThan(0.73);
  });

  it("a Legendary at its centre wins about 4% of the time, not the 42% floor the mockup used", async () => {
    let wins = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const d = fresh();
      at(SLOT_TABLE[4].circles[0].x, SLOT_TABLE[4].circles[0].z);
      await d.drop();
      if (get().result!.won) wins++;
    }
    expect(wins / n).toBeGreaterThan(0.025);
    expect(wins / n).toBeLessThan(0.055);
  });
});

describe("no dead ends", () => {
  it("starts the reveal on its own if the scene never reports the drop animation finished", async () => {
    const d = fresh();
    at(SLOT_TABLE[0].circles[0].x, SLOT_TABLE[0].circles[0].z);
    await d.drop();
    expect(get().reveal).toBe("closed");
    await vi.advanceTimersByTimeAsync(12_100);
    expect(get().reveal).toBe("verifying");
    await vi.advanceTimersByTimeAsync(1_200);
    expect(get().reveal).toBe("result");
  });

  it("does not start a second reveal when the scene did report in time", async () => {
    const d = fresh();
    at(SLOT_TABLE[0].circles[0].x, SLOT_TABLE[0].circles[0].z);
    await d.drop();
    d.onDropAnimationEnd();
    await vi.advanceTimersByTimeAsync(1_200);
    d.closeReveal();
    await vi.advanceTimersByTimeAsync(13_000);
    expect(get().reveal).toBe("closed");
  });
});

describe("after the round", () => {
  it("records the play in the audit log once the reveal finishes", async () => {
    const d = fresh();
    at(SLOT_TABLE[0].circles[0].x, SLOT_TABLE[0].circles[0].z);
    await d.drop();
    d.onDropAnimationEnd();
    expect(get().reveal).toBe("verifying");
    await vi.advanceTimersByTimeAsync(1200);
    expect(get().reveal).toBe("result");
    expect(get().audit).toHaveLength(1);
    expect(get().audit[0].id).toMatch(/^practice-/);
  });

  it("mints on claim and sells back at the slot's price", async () => {
    const d = fresh();
    await d.connectWallet();
    const before = get().wallet.balanceSol;
    patch({ result: { slot: 0, gripBps: 7000, rollBps: 1, won: true, dropX: 0, dropZ: 0, randomnessHex: "", signature: null, simulated: true }, reveal: "claim" });
    await d.approveClaim();
    expect(get().inventory["pebble-crab"]).toBe(1);
    await d.sellBackLast();
    expect(get().inventory["pebble-crab"]).toBe(0);
    expect(get().wallet.balanceSol).toBeCloseTo(before + 0.02, 5);
  });

  it("cannot sell what it does not hold", async () => {
    const d = fresh();
    await d.connectWallet();
    const before = get().wallet.balanceSol;
    await d.sellBackFromShelf("gilded-wyrm");
    expect(get().wallet.balanceSol).toBe(before);
  });

  it("only claims a win", async () => {
    const d = fresh();
    patch({ result: { slot: 0, gripBps: 7000, rollBps: 9000, won: false, dropX: 0, dropZ: 0, randomnessHex: "", signature: null, simulated: true }, reveal: "result" });
    await d.approveClaim();
    expect(get().reveal).toBe("result");
    expect(Object.values(get().inventory).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
