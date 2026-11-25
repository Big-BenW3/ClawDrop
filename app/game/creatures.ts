import { SLOT_TABLE, type SlotDef } from "@clawdrop/sdk/model";
import { rarityColor, type Rarity } from "../theme/tokens";

/**
 * The five prize creatures (placeholder names and art until the owner supplies the real ones).
 * The ARRAY ORDER IS LOAD-BEARING: the 3D engine's scene layout indexes into it.
 * Odds, prices and positions are not stored here: they come from the SDK's SLOT_TABLE, the same
 * table the onchain machine is configured from, via `slot`.
 */
export interface Creature {
  id: string;
  /** Onchain prize slot (0 Common .. 4 Legendary). */
  slot: 0 | 1 | 2 | 3 | 4;
  name: string;
  rarity: Rarity;
  color: string;
  tag: string;
  vibe: string;
}

const make = (id: string, slot: Creature["slot"], tag: string, vibe: string): Creature => {
  const def = SLOT_TABLE[slot];
  return { id, slot, name: def.name, rarity: def.rarity, color: rarityColor[def.rarity], tag, vibe };
};

export const CREATURES: Creature[] = [
  make("gilded-wyrm", 4, "n°001", "Cosmic Crown Dragon"),
  make("void-hopper", 3, "n°002", "Street Visor Bunny"),
  make("volt-axolotl", 2, "n°003", "Skater Spark Salamander"),
  make("pebble-crab", 0, "n°004", "Chill Snapback Hermit"),
  make("mochi-sprout", 1, "n°005", "Sleepy Leaf Dumpling"),
];

export const creatureBySlot = (slot: number): Creature => CREATURES.find((c) => c.slot === slot) ?? CREATURES[0];
export const creatureById = (id: string): Creature | undefined => CREATURES.find((c) => c.id === id);
export const slotOf = (c: Creature): SlotDef => SLOT_TABLE[c.slot];

/** `70%` style label for a basis-point value. */
export const pct = (bps: number, digits = 0) => `${(bps / 100).toFixed(digits)}%`;
/** What a creature's grip is at best and worst, e.g. "70% at the centre, 20% at the edge". */
export const gripRangeLabel = (c: Creature) => `${pct(slotOf(c).baseGripBps)} → ${pct(slotOf(c).minGripBps)}`;
