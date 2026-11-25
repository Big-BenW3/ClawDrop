import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, SEEDS } from "./constants";

const enc = (s: string) => new TextEncoder().encode(s);
const find = (seeds: (Uint8Array | Buffer)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

export const machinePda = (authority: PublicKey) => find([enc(SEEDS.machine), authority.toBytes()]);
export const vaultPda = (machine: PublicKey) => find([enc(SEEDS.vault), machine.toBytes()]);
export const playPda = (machine: PublicKey, player: PublicKey) => find([enc(SEEDS.play), machine.toBytes(), player.toBytes()]);
/**
 * A Play is reused across games, so the asset address includes the game number (`play.vrfEpoch`
 * at the time of the win). Deterministic per game: a claim can be retried, never double-minted.
 */
export const assetPda = (play: PublicKey, game: number) => {
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, game, true);
  return find([enc(SEEDS.asset), play.toBytes(), n]);
};
export const prizePda = (asset: PublicKey) => find([enc(SEEDS.prize), asset.toBytes()]);
