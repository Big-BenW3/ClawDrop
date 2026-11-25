/**
 * Design tokens: the single place for colours, fonts, shadows and rarity colours.
 *
 * Tailwind reads these (tailwind.config.ts) and so does the TypeScript side (creature colours, the
 * 3D scene's accent colours). The one exception is app/globals.css, which is the mockup's signed-off
 * stylesheet ported verbatim ("do not re-style anything"), so its literal rgba() values are the
 * same palette written out longhand. Rename or recolour here, then check globals.css.
 */
export const colors = {
  base: "#0B0E14",
  panel: "#141A26",
  panelHover: "#1B2333",
  ink: "#E8ECF4",
  muted: "#8A93A6",
  accent: "#A855F7",
  win: "#34D399",
  alert: "#F87171",
  link: "#60A5FA",
  legendary: "#F5B301",
  epic: "#A855F7",
  rare: "#3B82F6",
  /** Not in the mockup, which had two Commons and no Uncommon: a placeholder until art direction. */
  uncommon: "#2DD4BF",
  common: "#9AA4B2",
} as const;

export const fontFamily = {
  display: ["Clash Display", "Fredoka", "sans-serif"],
  sans: ["Satoshi", "Inter", "sans-serif"],
  mono: ["JetBrains Mono", "monospace"],
};

export const boxShadow = {
  "neon-violet": "0 0 28px rgba(168, 85, 247, 0.35)",
  "neon-gold": "0 0 28px rgba(245, 179, 1, 0.35)",
  "neon-win": "0 0 28px rgba(52, 211, 153, 0.35)",
  "neon-alert": "0 0 28px rgba(248, 113, 113, 0.4)",
  glass: "0 20px 50px rgba(0, 0, 0, 0.65)",
};

export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export const rarityColor: Record<Rarity, string> = {
  Common: colors.common,
  Uncommon: colors.uncommon,
  Rare: colors.rare,
  Epic: colors.epic,
  Legendary: colors.legendary,
};

/** 3D scene: backdrop and the player-state colours the HUD and the target ring use. */
export const scene = {
  clear: 0x05060b,
  ringIdle: colors.accent,
  timerWarn: colors.alert,
  timerOk: colors.accent,
} as const;
