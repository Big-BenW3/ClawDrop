import { PublicKey } from "@solana/web3.js";
import { IDL } from "./idl";

export * from "./game";

/** The deployed Claw Drop program (from the IDL, so it can never drift from the build). */
export const PROGRAM_ID = new PublicKey(IDL.address);

/** Endpoints and validator identities: handoff §2.3, verified in Phase 0. */
export const ENDPOINTS = {
  base: "https://rpc.magicblock.app/devnet",
  rollupEu: "https://devnet-eu.magicblock.app",
  rollupUs: "https://devnet-us.magicblock.app",
  router: "https://devnet-router.magicblock.app",
} as const;

export const VALIDATORS = {
  eu: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  us: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
} as const;

/** The metaplex core program. */
export const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
