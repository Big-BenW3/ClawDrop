import type { GameDriver } from "./driver";
import { MockDriver } from "./mockDriver";

let driver: GameDriver | null = null;
let loading: Promise<GameDriver> | null = null;
const MODE_KEY = "clawdrop.mode";

/** Practice (no chain) when asked for in the URL, remembered for the session, or set at build time. */
export function wantsPractice(search: string): boolean {
  if (process.env.NEXT_PUBLIC_MODE === "practice") return true;
  try {
    const q = new URLSearchParams(search).get("practice");
    if (q === "1") sessionStorage.setItem(MODE_KEY, "practice");
    else if (q === "0") sessionStorage.removeItem(MODE_KEY);
    return sessionStorage.getItem(MODE_KEY) === "practice";
  } catch { return new URLSearchParams(search).get("practice") === "1"; }
}

/**
 * Create the driver once. The chain driver (and with it web3.js, Anchor and the wallet code) is
 * loaded on demand, so pages that never play never pay for it.
 */
export function initDriver(practice: boolean): Promise<GameDriver> {
  if (driver) return Promise.resolve(driver);
  loading ??= (async () => {
    if (practice) driver = new MockDriver();
    else driver = new (await import("./chainDriver")).ChainDriver();
    driver.init();
    return driver;
  })();
  return loading;
}

/** The driver. Pages get it through <DriverGate>, which makes sure it exists before they render. */
export function getDriver(): GameDriver {
  if (!driver) throw new Error("The game driver is not ready: render this inside <DriverGate>.");
  return driver;
}

export const peekDriver = () => driver;
