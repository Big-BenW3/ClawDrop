import { PublicKey } from "@solana/web3.js";

/**
 * Which machine this deployment talks to: identified by its authority, everything else is derived.
 * The default is the devnet machine this repo deployed; override with NEXT_PUBLIC_MACHINE_AUTHORITY.
 */
export const MACHINE_AUTHORITY = new PublicKey(process.env.NEXT_PUBLIC_MACHINE_AUTHORITY || "DztJxBybR7fKa9UyR8fBZMohaZYcLydyxrJr5CuJBa34");
export const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC || undefined;
export const ROLLUP_URL = process.env.NEXT_PUBLIC_ROLLUP_URL || undefined;
