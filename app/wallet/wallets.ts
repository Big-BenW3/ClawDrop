/**
 * Wallet access for the browser (client-only: never import this during server rendering).
 *
 * Real wallets arrive through the wallet standard: browser extensions (Phantom, Solflare,
 * Backpack...) announce themselves, and on Android the Mobile Wallet Adapter registers itself as
 * one more standard wallet. On top of those there is a "test wallet": a throwaway keypair kept in
 * this browser, so anyone can try the game on devnet without installing anything.
 */
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { SolanaSignAndSendTransactionFeature, SolanaSignTransactionFeature } from "@solana/wallet-standard-features";
import type { StandardConnectFeature, StandardDisconnectFeature } from "@wallet-standard/features";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { brand } from "../theme/brand";

export const CHAIN = "solana:devnet" as const;

export interface WalletOption {
  id: string;
  name: string;
  /** data: URI or path; may be empty. */
  icon: string;
  kind: "standard" | "test";
  wallet?: Wallet;
}

/** A connected wallet, reduced to what the game needs. */
export interface ConnectedWallet {
  name: string;
  publicKey: PublicKey;
  /** Ask the wallet to sign. Shows a wallet approval; the game calls it only for credit, claim and sell back. */
  signTransaction(tx: Transaction): Promise<Transaction>;
  disconnect(): Promise<void>;
}

const TEST_KEY = "clawdrop.testwallet.v1";

/** The test wallet's keypair, created on first use. Exposed so QA and scripts can fund it. */
export function testWalletKeypair(): Keypair {
  try {
    const raw = localStorage.getItem(TEST_KEY);
    if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch { /* fall through */ }
  const kp = Keypair.generate();
  try { localStorage.setItem(TEST_KEY, JSON.stringify(Array.from(kp.secretKey))); } catch { /* private mode: lives for this page only */ }
  return kp;
}

let mwaRegistered = false;
/** On Android, register the Mobile Wallet Adapter as a standard wallet. Safe to call repeatedly. */
export async function registerMobileWallet(): Promise<void> {
  if (mwaRegistered || typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return;
  mwaRegistered = true;
  try {
    const m = await import("@solana-mobile/wallet-standard-mobile");
    m.registerMwa({
      appIdentity: { name: brand.name, uri: location.origin, icon: "/icon.svg" },
      authorizationCache: m.createDefaultAuthorizationCache(),
      chains: [CHAIN],
      chainSelector: m.createDefaultChainSelector(),
      onWalletNotFound: m.createDefaultWalletNotFoundHandler(),
    });
  } catch (e) {
    console.warn("mobile wallet adapter unavailable", e);
  }
}

const canSign = (w: Wallet) =>
  "standard:connect" in w.features && ("solana:signTransaction" in w.features || "solana:signAndSendTransaction" in w.features);

/** Wallets the browser can use right now, plus the test wallet. */
export function listWallets(): WalletOption[] {
  const found = getWallets().get().filter(canSign).map<WalletOption>((w) => ({ id: `std:${w.name}`, name: w.name, icon: w.icon, kind: "standard", wallet: w }));
  return [...found, { id: "test", name: "Test wallet (this browser)", icon: "", kind: "test" }];
}

/** Subscribe to wallets that register after page load (extensions announce late). */
export function onWalletsChange(cb: () => void): () => void {
  const api = getWallets();
  const off = [api.on("register", cb), api.on("unregister", cb)];
  return () => off.forEach((f) => f());
}

/** Why a wallet call failed, in the app's terms. */
export type WalletFailure = "rejected" | "other";
export function classifyWalletError(e: unknown): WalletFailure {
  const m = `${(e as { name?: string })?.name ?? ""} ${(e as { message?: string })?.message ?? ""} ${(e as { code?: number })?.code ?? ""}`.toLowerCase();
  return /reject|denied|declin|cancel|user closed|4001/.test(m) ? "rejected" : "other";
}

export async function connectWallet(opt: WalletOption): Promise<ConnectedWallet> {
  if (opt.kind === "test") {
    const kp = testWalletKeypair();
    return {
      name: opt.name,
      publicKey: kp.publicKey,
      async signTransaction(tx) {
        // Counted so tests can prove the wallet is never asked to sign while the claw is being steered.
        const w = window as unknown as { __signCount?: number };
        w.__signCount = (w.__signCount ?? 0) + 1;
        tx.partialSign(kp);
        return tx;
      },
      async disconnect() { /* nothing to release */ },
    };
  }
  const w = opt.wallet!;
  const connect = (w.features["standard:connect"] as StandardConnectFeature["standard:connect"]).connect;
  const { accounts } = await connect();
  const account: WalletAccount | undefined = accounts.find((a) => a.chains.includes(CHAIN) || a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
  if (!account) throw new Error("the wallet returned no account");
  const signFeature = w.features["solana:signTransaction"] as SolanaSignTransactionFeature["solana:signTransaction"] | undefined;
  const signSendFeature = w.features["solana:signAndSendTransaction"] as SolanaSignAndSendTransactionFeature["solana:signAndSendTransaction"] | undefined;

  return {
    name: w.name,
    publicKey: new PublicKey(account.address),
    async signTransaction(tx) {
      if (!signFeature) throw new Error("this wallet cannot sign without sending; use a different wallet");
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const [out] = await signFeature.signTransaction({ account, transaction: bytes, chain: CHAIN });
      return Transaction.from(out.signedTransaction);
    },
    async disconnect() {
      const d = w.features["standard:disconnect"] as StandardDisconnectFeature["standard:disconnect"] | undefined;
      await d?.disconnect().catch(() => {});
    },
  };
}
