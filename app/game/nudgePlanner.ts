import { GAME } from "@clawdrop/sdk/model";

/**
 * Pure logic for the adaptive nudge sender (see PHASE2-3-NOTES.md: confirms take 0.3-0.8 s, so
 * "one nudge per 80 ms, 2 in flight" delivers only 2-5 nudges a second).
 *
 * The player moves a local, predicted claw at frame rate. The sender keeps one number: `sent`, the
 * position the chain will reach once every nudge already sent has landed. Whenever a send slot is
 * free it sends the difference between where the player wants the claw and `sent`, clamped to the
 * program's i8 range. So the claw is never throttled to the send rate; the chain just trails it.
 */
export interface Vec { x: number; z: number }

/** Largest single nudge per axis (the program takes an i8). */
export const MAX_NUDGE = 127;
/** Nudge transactions allowed in flight at once. */
export const MAX_IN_FLIGHT = 2;

const clampFloor = (v: number) => Math.min(GAME.coordMax, Math.max(0, v));
const clampNudge = (v: number) => Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, v));

/** What the program does with a nudge: add it and clamp both axes to the floor. */
export const applyNudge = (p: Vec, dx: number, dz: number): Vec => ({ x: clampFloor(p.x + dx), z: clampFloor(p.z + dz) });

/** The next nudge to send, or null when the chain is already where the player wants the claw. */
export function nextNudge(want: Vec, sent: Vec): { dx: number; dz: number } | null {
  const dx = clampNudge(Math.round(want.x - sent.x));
  const dz = clampNudge(Math.round(want.z - sent.z));
  return dx === 0 && dz === 0 ? null : { dx, dz };
}

/**
 * Stop the local claw running further ahead of the chain than two full nudges can cover, so the
 * ghost never trails by seconds when the link is slow.
 */
export function leash(want: Vec, sent: Vec, limit = MAX_NUDGE * MAX_IN_FLIGHT): Vec {
  const lim = (w: number, s: number) => s + Math.max(-limit, Math.min(limit, w - s));
  return { x: lim(want.x, sent.x), z: lim(want.z, sent.z) };
}

/** Rolling mean of the last `n` latency samples, for the HUD. */
export class LatencyWindow {
  private xs: number[] = [];
  constructor(private n = 20) {}
  add(ms: number) { this.xs.push(ms); if (this.xs.length > this.n) this.xs.shift(); }
  get mean(): number | null { return this.xs.length ? this.xs.reduce((a, b) => a + b, 0) / this.xs.length : null; }
  clear() { this.xs = []; }
}
