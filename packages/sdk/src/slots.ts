import { GAME } from "./game";

export const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

/** One place on the 0..1000 floor where a creature can be grabbed. */
export interface Circle { x: number; z: number; radius: number }

/** One prize slot: its circles on the floor, its odds and its price (handoff §3.1). */
export interface SlotDef {
  slot: 0 | 1 | 2 | 3 | 4;
  /** Placeholder creature names; the owner will supply final ones. They are written onchain by `setup-machine`. */
  name: string;
  rarity: Rarity;
  /** 1..3 places this creature can be grabbed. Every plush in the machine sits on one of them. */
  circles: readonly Circle[];
  baseGripBps: number;
  minGripBps: number;
  sellbackLamports: number;
  supplyCap: number;
}

/** Most circles one creature may have (the program's `MAX_CIRCLES`). */
export const MAX_CIRCLES = 3;

/**
 * The five prize slots. Odds, prices and supply caps are the handoff's table.
 *
 * Every plush in the machine is a circle, so every plush you can see is winnable. Rarer creatures
 * have fewer and smaller circles (3/2/2/1/1 circles, radius 55/45/35/28/22): the grip at a circle's
 * centre is still the table's 70/50/30/12/4 %, only the area you can hit it from shrinks.
 *
 * The centres are where the 3D scene seats its nine plush (floor -> scene is
 * x_scene = (x_floor / 1000 - 0.5) * 3.5), so what the player aims at is what the chain measures.
 * No circle sits on the claw's start (500, 500) or in the chute corner, and no two circles are
 * closer than 250 floor units, so plush never overlap and a drop can never be ambiguous.
 */
export const SLOT_TABLE: readonly SlotDef[] = [
  { slot: 0, name: "Pebble Crab",  rarity: "Common",    circles: [{ x: 330, z: 400, radius: 55 }, { x: 520, z: 680, radius: 55 }, { x: 160, z: 160, radius: 55 }], baseGripBps: 7000, minGripBps: 2000, sellbackLamports: 20_000_000,    supplyCap: 10_000 },
  { slot: 1, name: "Mochi Sprout", rarity: "Uncommon",  circles: [{ x: 700, z: 420, radius: 45 }, { x: 170, z: 640, radius: 45 }],                                   baseGripBps: 5000, minGripBps: 1200, sellbackLamports: 50_000_000,    supplyCap: 2_000 },
  { slot: 2, name: "Volt Axolotl", rarity: "Rare",      circles: [{ x: 500, z: 130, radius: 35 }, { x: 700, z: 880, radius: 35 }],                                   baseGripBps: 3000, minGripBps: 600,  sellbackLamports: 150_000_000,   supplyCap: 500 },
  { slot: 3, name: "Void Hopper",  rarity: "Epic",      circles: [{ x: 840, z: 160, radius: 28 }],                                                                   baseGripBps: 1200, minGripBps: 200,  sellbackLamports: 400_000_000,   supplyCap: 100 },
  { slot: 4, name: "Gilded Wyrm",  rarity: "Legendary", circles: [{ x: 850, z: 650, radius: 22 }],                                                                   baseGripBps: 400,  minGripBps: 100,  sellbackLamports: 1_000_000_000, supplyCap: 25 },
];

/** Every circle on the floor, flattened, with the slot it belongs to. The scene seats one plush on each. */
export const CIRCLES: readonly (Circle & { slot: number; index: number })[] = SLOT_TABLE.flatMap((d) =>
  d.circles.map((c, index) => ({ ...c, slot: d.slot, index })),
);

/** Floor coordinate (0..1000) <-> scene units (the claw travels +-1.75, a 3.5-unit floor). */
export const SCENE_SPAN = 3.5;
export const floorToScene = (v: number) => (v / GAME.coordMax - 0.5) * SCENE_SPAN;
export const sceneToFloor = (s: number) => Math.round((s / SCENE_SPAN + 0.5) * GAME.coordMax);
