import { Connection } from "@solana/web3.js";
import { ENDPOINTS } from "./constants";

/** The two connections every game needs: base layer and the rollup. */
export interface Connections {
  base: Connection;
  rollup: Connection;
  rollupUrl: string;
}

export function createConnections(opts: { baseUrl?: string; rollupUrl?: string } = {}): Connections {
  const baseUrl = opts.baseUrl ?? ENDPOINTS.base;
  const rollupUrl = (opts.rollupUrl ?? ENDPOINTS.rollupEu).replace(/\/$/, "");
  return {
    base: new Connection(baseUrl, { commitment: "confirmed" }),
    // Rollup reads at `processed`: blocks are ~10 ms, waiting for more only adds delay.
    rollup: new Connection(rollupUrl, { commitment: "processed", wsEndpoint: rollupUrl.replace(/^http/, "ws") }),
    rollupUrl,
  };
}
