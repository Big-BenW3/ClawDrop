/**
 * Product name, tagline and footer: the one place to rename the product.
 * "Claw Drop" is a working title. Renaming also means updating the NFT metadata strings
 * (public/nft/*.json) and the onchain collection name set by scripts/setup-machine.ts.
 */
export const brand = {
  name: "Claw Drop",
  /** The logo wordmark: first part plain, second part in the accent colour. */
  wordmark: ["CLAW", "DROP"] as const,
  tagline: "Skill drops the claw. Luck you can verify.",
  pitch:
    "Line up the mechanical claw in real time, trigger a provably fair on-chain VRF grip roll, and claim collectible NFT creatures straight to your wallet.",
  footer: "CLAW DROP · Provably Fair On-Chain Arcade · Built on Solana Ephemeral Rollups",
  /** Title used in the browser tab and link previews. */
  title: "CLAW DROP — Skill drops the claw. Luck you can verify.",
} as const;
