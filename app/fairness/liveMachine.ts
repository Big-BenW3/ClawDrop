// Reads the machine's real configuration from its onchain account, for the Fairness page.
// Loaded on demand: this pulls in web3.js and Anchor, which the practice page never needs.

export interface LiveCircle { x: number; z: number; radius: number }
export interface LiveSlot {
  name: string;
  circles: LiveCircle[];
  baseGripBps: number;
  minGripBps: number;
  sellbackLamports: number;
  supplyCap: number;
  minted: number;
}
export interface LiveMachine {
  address: string;
  vault: string;
  vaultLamports: number;
  creditLamports: number;
  paused: boolean;
  collection: string;
  slots: LiveSlot[];
}

export async function loadLiveMachine(): Promise<LiveMachine> {
  const [{ ClawClient, createConnections }, { BASE_RPC, MACHINE_AUTHORITY, ROLLUP_URL }] = await Promise.all([import("@clawdrop/sdk"), import("../config")]);
  const conns = createConnections({ baseUrl: BASE_RPC, rollupUrl: ROLLUP_URL });
  const claw = new ClawClient(conns, MACHINE_AUTHORITY);
  const [m, vaultLamports] = await Promise.all([claw.fetchMachine(), conns.base.getBalance(claw.vault)]);
  if (!m) throw new Error("This machine has not been set up yet.");
  return {
    address: claw.machine.toBase58(),
    vault: claw.vault.toBase58(),
    vaultLamports,
    creditLamports: Number(m.creditPriceLamports.toString()),
    paused: m.paused,
    collection: m.collection.toBase58(),
    slots: m.slots.map((s) => ({
      name: s.name,
      circles: s.circles.filter((c) => c.radius > 0).map((c) => ({ x: c.xCenter, z: c.zCenter, radius: c.radius })),
      baseGripBps: s.baseGripBps,
      minGripBps: s.minGripBps,
      sellbackLamports: Number(s.sellbackLamports.toString()),
      supplyCap: s.supplyCap,
      minted: s.minted,
    })),
  };
}
