import { describe, expect, it } from "vitest";
import { applyNudge, leash, LatencyWindow, MAX_NUDGE, nextNudge, type Vec } from "./nudgePlanner";

describe("nextNudge", () => {
  it("sends nothing when the chain is already where the player wants the claw", () => {
    expect(nextNudge({ x: 500, z: 500 }, { x: 500, z: 500 })).toBeNull();
    expect(nextNudge({ x: 500.4, z: 499.6 }, { x: 500, z: 500 })).toBeNull(); // sub-unit remainder waits
  });
  it("sends the whole difference when it fits", () => {
    expect(nextNudge({ x: 530, z: 480 }, { x: 500, z: 500 })).toEqual({ dx: 30, dz: -20 });
  });
  it("clamps each axis to the program's i8 range", () => {
    expect(nextNudge({ x: 1000, z: 0 }, { x: 500, z: 500 })).toEqual({ dx: MAX_NUDGE, dz: -MAX_NUDGE });
    expect(nextNudge({ x: 0, z: 1000 }, { x: 1000, z: 0 })).toEqual({ dx: -MAX_NUDGE, dz: MAX_NUDGE });
  });
  it("keeps a unit of movement on one axis from being lost to rounding on the other", () => {
    expect(nextNudge({ x: 501, z: 500 }, { x: 500, z: 500 })).toEqual({ dx: 1, dz: 0 });
  });
});

describe("converging on a target", () => {
  /** Simulate the sender: repeatedly send, applying each nudge exactly as the program would. */
  const run = (start: Vec, want: Vec) => {
    let sent = { ...start }, chain = { ...start }, n = 0;
    for (; n < 100; n++) {
      const nd = nextNudge(want, sent);
      if (!nd) break;
      sent = applyNudge(sent, nd.dx, nd.dz);
      chain = applyNudge(chain, nd.dx, nd.dz);
    }
    return { chain, sent, n };
  };
  it("the chain ends exactly on the target, in as few nudges as the i8 limit allows", () => {
    const r = run({ x: 500, z: 500 }, { x: 357, z: 629 }); // start to the Common creature
    expect(r.chain).toEqual({ x: 357, z: 629 });
    expect(r.n).toBe(2); // 143 needs two nudges of at most 127
  });
  it("reaches every corner of the floor and never leaves it", () => {
    for (const want of [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 0, z: 1000 }, { x: 1000, z: 1000 }]) {
      const r = run({ x: 500, z: 500 }, want);
      expect(r.chain).toEqual(want);
      expect(r.chain.x).toBeGreaterThanOrEqual(0); expect(r.chain.x).toBeLessThanOrEqual(1000);
    }
  });
  it("matches the program's clamp at the edges, including the i8 extremes", () => {
    expect(applyNudge({ x: 990, z: 10 }, 127, -128)).toEqual({ x: 1000, z: 0 });
    expect(applyNudge({ x: 500, z: 500 }, -128, 127)).toEqual({ x: 372, z: 627 });
  });
});

describe("leash", () => {
  it("lets the claw lead by up to two full nudges and no more", () => {
    expect(leash({ x: 900, z: 500 }, { x: 500, z: 500 })).toEqual({ x: 500 + 254, z: 500 });
    expect(leash({ x: 100, z: 500 }, { x: 500, z: 500 })).toEqual({ x: 500 - 254, z: 500 });
  });
  it("leaves a claw that is within reach alone", () => {
    expect(leash({ x: 520, z: 480 }, { x: 500, z: 500 })).toEqual({ x: 520, z: 480 });
  });
});

describe("LatencyWindow", () => {
  it("averages the most recent samples only", () => {
    const w = new LatencyWindow(3);
    expect(w.mean).toBeNull();
    [100, 200, 300, 400].forEach((x) => w.add(x));
    expect(w.mean).toBe(300);
    w.clear();
    expect(w.mean).toBeNull();
  });
});
