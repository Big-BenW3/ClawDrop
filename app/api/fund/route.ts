import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { clientIp, decide, GRANT_LAMPORTS, Limiter } from "./fundLogic";

// "Fund for testing": sends 0.25 devnet SOL from a treasury wallet so a first-time visitor can
// play without leaving the page. The treasury key lives only in the FUNDING_KEY environment
// variable (a JSON array of bytes) and is never sent to the browser. Unset => this route 404s and
// the app tells the player to use the public devnet faucet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new Limiter();
let treasury: Keypair | null | undefined; // undefined = not loaded yet, null = not configured
let queue: Promise<unknown> = Promise.resolve(); // one grant at a time, so two requests cannot both pass the checks

function loadTreasury(): Keypair | null {
  if (treasury !== undefined) return treasury;
  try {
    const raw = process.env.FUNDING_KEY;
    treasury = raw ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))) : null;
  } catch {
    console.error("FUNDING_KEY is set but is not a valid JSON byte array");
    treasury = null;
  }
  return treasury;
}

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const payer = loadTreasury();
  if (!payer) return json(404, { error: "not_configured" });

  let address: unknown;
  try { address = ((await req.json()) as { address?: unknown }).address; } catch { return json(400, { error: "bad_address" }); }
  let recipient: PublicKey | null = null;
  try { if (typeof address === "string" && address.length <= 44) recipient = new PublicKey(address); } catch { /* invalid */ }
  if (!recipient) return json(400, { error: "bad_address" });

  const ip = clientIp(req.headers);
  const rpc = process.env.NEXT_PUBLIC_BASE_RPC || "https://rpc.magicblock.app/devnet";

  const run = async () => {
    const conn = new Connection(rpc, "confirmed");
    const [recipientLamports, treasuryLamports] = await Promise.all([conn.getBalance(recipient!), conn.getBalance(payer.publicKey)]);
    const verdict = decide({
      addressValid: true,
      recipientLamports,
      treasuryLamports,
      withinLimits: limiter.allowed(recipient!.toBase58(), ip),
    });
    if (!verdict.ok) return json(verdict.status, { error: verdict.error });

    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient!, lamports: GRANT_LAMPORTS }));
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    const signature = await conn.sendRawTransaction(tx.serialize());
    const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) return json(502, { error: "transfer_failed" });
    limiter.record(recipient!.toBase58(), ip); // only a grant that landed counts against the limits
    return json(200, { signature, lamports: GRANT_LAMPORTS });
  };

  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  try { return await result; } catch (e) {
    console.error("fund failed:", e instanceof Error ? e.message : e);
    return json(502, { error: "transfer_failed" });
  }
}

// Anything but POST is not part of the API.
export function GET() { return json(405, { error: "method_not_allowed" }); }
