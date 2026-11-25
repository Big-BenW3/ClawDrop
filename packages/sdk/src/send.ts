import { ComputeBudgetProgram, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";

export interface Sent {
  signature: string;
  /** Send to first `processed` status, in ms. One sample for the latency HUD. */
  ms: number;
  /** The transaction status error, if it failed on chain. */
  err: unknown | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Sign and send without preflight (rollup transactions need that), then wait for `processed`.
 * Confirmation races a websocket `onSignature` against a slow poll, because on a bad link the
 * websocket can stall silently. Throws on timeout; a failed transaction is returned in `err`.
 */
export async function sendFast(
  conn: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  opts: {
    blockhash?: string;
    timeoutMs?: number;
    /**
     * Makes otherwise identical transactions unique. Two nudges with the same (dx, dz), the same
     * blockhash and the same signer are byte-identical, and the second would be rejected as a
     * duplicate. Pass an incrementing number when reusing a cached blockhash.
     */
    nonce?: number;
  } = {},
): Promise<Sent> {
  const tx = new Transaction();
  if (opts.nonce !== undefined) tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 190_000 + (opts.nonce % 10_000) }));
  tx.add(...ixs);
  tx.recentBlockhash = opts.blockhash ?? (await conn.getLatestBlockhash()).blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const t0 = clock();
  const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return new Promise<Sent>((resolve, reject) => {
    let done = false;
    let subId: number | undefined;
    // A signature subscription is one-shot: the library drops it once it fires, so it only
    // needs removing when the poll (or a timeout) finishes first.
    const drop = () => { if (subId !== undefined) conn.removeSignatureListener(subId).catch(() => {}); };
    const finish = (err: unknown | null, viaWs = false) => {
      if (done) return;
      done = true;
      if (!viaWs) drop();
      resolve({ signature, ms: clock() - t0, err });
    };
    try {
      subId = conn.onSignature(signature, (r) => finish(r.err ?? null, true), "processed");
    } catch { /* websocket unavailable: the poll below still works */ }
    (async () => {
      while (!done) {
        await sleep(400);
        if (done) return;
        if (clock() - t0 > timeoutMs) {
          done = true;
          drop();
          return reject(new Error(`transaction ${signature} not confirmed within ${timeoutMs} ms`));
        }
        const st = (await conn.getSignatureStatuses([signature]).catch(() => null))?.value[0];
        if (st && st.confirmationStatus) finish(st.err ?? null);
      }
    })();
  });
}
