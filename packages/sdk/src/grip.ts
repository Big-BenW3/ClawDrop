/**
 * Grip maths: a line-for-line port of programs/claw-drop/src/grip.rs.
 *
 * The same functions run in the mock driver, in the live "grip %" shown while aiming, and on the
 * Fairness page that lets anyone recompute a play. Integer maths only (BigInt for the 256-bit
 * roll); no floats. The conventions match the program and must not drift:
 *  - the radius is inclusive (d2 == r2 is inside and gets exactly the minimum grip);
 *  - a slot with radius 0 is disabled and can never be targeted, even at its exact centre;
 *  - `roll = randomness mod 10000`, randomness read as one big-endian 256-bit integer;
 *  - overlapping circles: the smallest d2 / r2 wins, an exact tie goes to the lower slot, then the lower circle;
 *  - a creature owns up to 3 circles, and the grip is measured from the centre of the circle that was hit.
 */
export const BPS_DENOM = 10_000;

export interface Geo { x: number; z: number; radius: number }

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  return dx * dx + dz * dz; // <= 2 * 65535^2, exact in a double
};
export const radius2 = (r: number): number => r * r;
export const contains = (g: Geo, x: number, z: number): boolean => g.radius !== 0 && dist2(x, z, g.x, g.z) <= radius2(g.radius);

export interface Target { index: number; d2: number; r2: number }

/** Which slot does a drop at (x, z) target? `null` is a miss with no roll. */
export function findTarget(slots: readonly Geo[], x: number, z: number): Target | null {
  let best: Target | null = null;
  slots.forEach((g, i) => {
    if (!contains(g, x, z)) return;
    const d2 = dist2(x, z, g.x, g.z), r2 = radius2(g.radius);
    // d2/r2 < best.d2/best.r2  <=>  d2 * best.r2 < best.d2 * r2, compared exactly in BigInt
    if (!best || BigInt(d2) * BigInt(best.r2) < BigInt(best.d2) * BigInt(r2)) best = { index: i, d2, r2 };
  });
  return best;
}

/**
 * Which slot does a drop at (x, z) target when every slot owns several circles? Mirrors
 * `grip::best_circle`: the circle with the smallest d2 / r2 wins; ties go to the lower slot, then
 * the lower circle. `index` is the slot. A circle with radius 0 is unused.
 */
export function findCircleTarget(slots: readonly (readonly Geo[])[], x: number, z: number): Target | null {
  let best: Target | null = null;
  slots.forEach((circles, i) => {
    for (const g of circles) {
      if (!contains(g, x, z)) continue;
      const d2 = dist2(x, z, g.x, g.z), r2 = radius2(g.radius);
      if (!best || BigInt(d2) * BigInt(best.r2) < BigInt(best.d2) * BigInt(r2)) best = { index: i, d2, r2 };
    }
  });
  return best;
}

/** Grip chance in basis points. Floor division, always within [min, base]; r2 == 0 cannot win. */
export function gripBps(d2: number, r2: number, baseBps: number, minBps: number): number {
  if (r2 === 0) return 0;
  if (baseBps <= minBps) return baseBps;
  if (d2 >= r2) return minBps;
  const extra = Number((BigInt(baseBps - minBps) * BigInt(r2 - d2)) / BigInt(r2));
  return minBps + extra;
}

/** `randomness mod 10000`, the 32 bytes read as a single big-endian 256-bit integer. */
export function rollBps(randomness: Uint8Array): number {
  let acc = 0;
  for (const b of randomness) acc = (acc * 256 + b) % BPS_DENOM;
  return acc;
}

/** `won = roll < grip`. */
export const resolve = (randomness: Uint8Array, grip: number): { roll: number; won: boolean } => {
  const roll = rollBps(randomness);
  return { roll, won: roll < grip };
};
