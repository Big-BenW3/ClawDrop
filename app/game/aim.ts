import { findCircleTarget, gripBps, SLOT_TABLE, type Geo } from "@clawdrop/sdk/model";
import type { Aim } from "./types";

const GEOS: Geo[][] = SLOT_TABLE.map((s) => s.circles.map((c) => ({ x: c.x, z: c.z, radius: c.radius })));

/** What the program would target, and with what grip, if the claw dropped at (x, z) right now. */
export function aimAt(x: number, z: number): Aim {
  const t = findCircleTarget(GEOS, Math.round(x), Math.round(z));
  if (!t) return { slot: null, gripBps: 0 };
  const s = SLOT_TABLE[t.index];
  return { slot: t.index, gripBps: gripBps(t.d2, t.r2, s.baseGripBps, s.minGripBps) };
}
