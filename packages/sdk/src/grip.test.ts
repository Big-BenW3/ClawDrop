// Mirrors the unit tests in programs/claw-drop/src/grip.rs. The roll vectors (9935, 671) were
// computed independently with Python big integers when the Rust tests were written.
import { describe, expect, it } from "vitest";
import { contains, dist2, findCircleTarget, findTarget, gripBps, radius2, resolve, rollBps, type Geo } from "./grip";
import { CIRCLES, MAX_CIRCLES, SLOT_TABLE } from "./slots";

const one = (x: number, z: number, radius: number): Geo[] => [{ x, z, radius }];
const bytes = (n: number, fill = 0) => new Uint8Array(n).fill(fill);

describe("targeting", () => {
  it("exact centre targets the slot with full grip", () => {
    const t = findTarget(one(500, 500, 120), 500, 500)!;
    expect(t).toEqual({ index: 0, d2: 0, r2: 14_400 });
    expect(gripBps(t.d2, t.r2, 7000, 2000)).toBe(7000);
  });
  it("exactly on the radius is inside and gets min grip", () => {
    const t = findTarget(one(500, 500, 120), 596, 572)!; // (96, 72): 3-4-5 scaled to 120
    expect(t.d2).toBe(t.r2);
    expect(gripBps(t.d2, t.r2, 7000, 2000)).toBe(2000);
  });
  it("just outside is a miss", () => {
    expect(findTarget(one(500, 500, 120), 621, 500)).toBeNull();
    expect(findTarget(one(500, 500, 120), 597, 572)).toBeNull();
  });
  it("overlap: smallest d2/r2 wins, even when another slot is physically closer", () => {
    const s: Geo[] = [{ x: 450, z: 500, radius: 120 }, { x: 520, z: 500, radius: 35 }];
    expect(findTarget(s, 500, 500)!.index).toBe(0); // 50/120 beats 20/35
  });
  it("overlap: an exact tie goes to the lower index, in either order", () => {
    const a: Geo[] = [{ x: 470, z: 500, radius: 60 }, { x: 515, z: 500, radius: 30 }];
    expect(findTarget(a, 500, 500)!.index).toBe(0);
    expect(findTarget([a[1], a[0]], 500, 500)!.index).toBe(0);
  });
  it("a zero radius slot is disabled, even at its exact centre, and never steals a drop", () => {
    expect(contains({ x: 500, z: 500, radius: 0 }, 500, 500)).toBe(false);
    const s: Geo[] = [{ x: 500, z: 500, radius: 0 }, { x: 500, z: 500, radius: 45 }];
    expect(findTarget(s, 500, 500)!.index).toBe(1);
  });
  it("is exact at the extremes of the floor and of u16", () => {
    expect(dist2(0, 0, 1000, 1000)).toBe(2_000_000);
    expect(radius2(65535)).toBe(4_294_836_225);
    const big: Geo[] = [{ x: 0, z: 0, radius: 65535 }, { x: 1000, z: 1000, radius: 65535 }];
    expect(findTarget(big, 500, 500)!.index).toBe(0);
  });
});

describe("grip curve", () => {
  it("falls linearly in d2/r2", () => {
    expect(gripBps(7200, 14_400, 7000, 2000)).toBe(4500);
    expect(gripBps(3600, 14_400, 7000, 2000)).toBe(5750);
  });
  it("floors, never rounds up", () => expect(gripBps(1, 1225, 400, 100)).toBe(399));
  it("handles degenerate and zero-radius configs", () => {
    expect(gripBps(0, 0, 7000, 2000)).toBe(0);
    expect(gripBps(0, 100, 500, 500)).toBe(500);
    expect(gripBps(0, 100, 100, 500)).toBe(100);
    expect(gripBps(50, 100, 10_000, 0)).toBe(5000);
  });
  it("is monotone non-increasing and within [min, base]", () => {
    let prev = Infinity;
    for (let d2 = 0; d2 <= 14_400; d2 += 37) {
      const g = gripBps(d2, 14_400, 7000, 2000);
      expect(g).toBeLessThanOrEqual(prev);
      expect(g).toBeGreaterThanOrEqual(2000);
      expect(g).toBeLessThanOrEqual(7000);
      prev = g;
    }
  });
});

describe("roll", () => {
  it("matches the independently computed vectors", () => {
    expect(rollBps(bytes(32))).toBe(0);
    const one1 = bytes(32); one1[31] = 1; expect(rollBps(one1)).toBe(1);
    const tenK = bytes(32); tenK[30] = 0x27; tenK[31] = 0x10; expect(rollBps(tenK)).toBe(0);
    tenK[31] = 0x0f; expect(rollBps(tenK)).toBe(9999);
    expect(rollBps(bytes(32, 0xff))).toBe(9935);
    const seq = Uint8Array.from({ length: 32 }, (_, i) => i); expect(rollBps(seq)).toBe(671);
  });
  it("wins only when roll is strictly below grip", () => {
    const r = bytes(32); r[30] = 0x0b; r[31] = 0xb8; // 3000
    expect(resolve(r, 3001)).toEqual({ roll: 3000, won: true });
    expect(resolve(r, 3000)).toEqual({ roll: 3000, won: false });
    expect(resolve(bytes(32), 0).won).toBe(false);
    expect(resolve(bytes(32, 0xff), 10_000).won).toBe(true);
  });
});

describe("slot table", () => {
  it("keeps best-case expected value below the 0.05 SOL credit (house edge)", () => {
    for (const s of SLOT_TABLE) expect((s.baseGripBps * s.sellbackLamports) / 10_000).toBeLessThan(50_000_000);
  });
  it("matches the handoff's best-case values (0.014 .. 0.048 SOL)", () => {
    expect(SLOT_TABLE.map((s) => (s.baseGripBps * s.sellbackLamports) / 10_000)).toEqual([14e6, 25e6, 45e6, 48e6, 40e6]);
  });
});

describe("several circles per creature", () => {
  const none: Geo = { x: 0, z: 0, radius: 0 };
  const g = (x: number, z: number, radius: number): Geo => ({ x, z, radius });

  it("a creature is hit through any of its circles, measured from the circle that was hit", () => {
    const slots = [[g(200, 200, 100), g(800, 800, 100), none], [g(500, 500, 45)]];
    expect(findCircleTarget(slots, 830, 800)).toEqual({ index: 0, d2: 900, r2: 10_000 });
    expect(findCircleTarget(slots, 500, 500)!.index).toBe(1);
    expect(findCircleTarget(slots, 650, 650)).toBeNull();
  });
  it("an unused circle never matches, even at its centre", () => {
    expect(findCircleTarget([[g(300, 300, 0), g(600, 600, 50)]], 300, 300)).toBeNull();
  });
  it("overlapping circles of different creatures: smaller d2/r2 wins; ties go to the lower slot", () => {
    expect(findCircleTarget([[g(560, 500, 100)], [g(530, 500, 40)]], 500, 500)!.index).toBe(0);
    expect(findCircleTarget([[g(560, 500, 100)], [g(530, 500, 40)]], 530, 510)!.index).toBe(1);
    const a = g(500, 500, 50);
    expect(findCircleTarget([[none], [a], [a]], 500, 500)!.index).toBe(1);
  });
  it("agrees with findTarget when every creature has one circle", () => {
    const geos = SLOT_TABLE.map((s) => s.circles[0]);
    for (let x = 0; x <= 1000; x += 23) for (let z = 0; z <= 1000; z += 29)
      expect(findCircleTarget(geos.map((c) => [c]), x, z)).toEqual(findTarget(geos, x, z));
  });
});

describe("the shipped slot table", () => {
  it("has 9 circles, 3/2/2/1/1 per creature, radii 55/45/35/28/22", () => {
    expect(SLOT_TABLE.map((s) => s.circles.length)).toEqual([3, 2, 2, 1, 1]);
    expect(SLOT_TABLE.map((s) => [...new Set(s.circles.map((c) => c.radius))])).toEqual([[55], [45], [35], [28], [22]]);
    expect(CIRCLES).toHaveLength(9);
    for (const s of SLOT_TABLE) expect(s.circles.length).toBeLessThanOrEqual(MAX_CIRCLES);
  });
  it("keeps every circle on the floor, off the claw's start, away from the chute and apart from the others", () => {
    for (const c of CIRCLES) {
      expect(c.x - c.radius).toBeGreaterThanOrEqual(0); expect(c.x + c.radius).toBeLessThanOrEqual(1000);
      expect(c.z - c.radius).toBeGreaterThanOrEqual(0); expect(c.z + c.radius).toBeLessThanOrEqual(1000);
      expect(findCircleTarget(SLOT_TABLE.map((s) => s.circles), 500, 500)).toBeNull(); // the start position is a miss
      expect(Math.hypot(c.x - 86, c.z - 900)).toBeGreaterThan(200); // chute corner
    }
    for (const a of CIRCLES) for (const b of CIRCLES) if (a !== b)
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.slot}.${a.index} vs ${b.slot}.${b.index}`).toBeGreaterThanOrEqual(250);
  });
  it("no circle of one creature overlaps a circle of another, so no drop is ambiguous", () => {
    for (const a of CIRCLES) for (const b of CIRCLES) if (a.slot < b.slot)
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius + b.radius);
  });
  it("is still reachable: every centre scores the creature's full grip", () => {
    const geos = SLOT_TABLE.map((s) => s.circles);
    for (const c of CIRCLES) {
      const t = findCircleTarget(geos, c.x, c.z)!;
      expect(t.index).toBe(c.slot);
      expect(gripBps(t.d2, t.r2, SLOT_TABLE[c.slot].baseGripBps, SLOT_TABLE[c.slot].minGripBps)).toBe(SLOT_TABLE[c.slot].baseGripBps);
    }
  });
});
