import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { Adapter } from "@solana/wallet-adapter-base";
import { SOLANA_RPC_URLS, USDC_MINT } from "./chains";
import { toUnits } from "./units";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cursor = 0;

/**
 * fetch() that rotates across the public RPC list. If an endpoint answers 429/403/5xx
 * or is unreachable we move to the next one, and do a second pass after a short pause.
 */
async function rotatingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastRes: Response | undefined;
  let lastErr: unknown;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < SOLANA_RPC_URLS.length; i++) {
      const idx = (cursor + i) % SOLANA_RPC_URLS.length;
      try {
        const res = await fetch(SOLANA_RPC_URLS[idx], init);
        if (res.status === 429 || res.status === 403 || res.status >= 500) {
          lastRes = res;
          continue;
        }
        cursor = idx; // stick with the endpoint that worked
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    await sleep(700 * (round + 1));
  }
  if (lastRes) return lastRes;
  throw lastErr instanceof Error ? lastErr : new Error("Solana network is busy, try again.");
}

export const solanaConnection = new Connection(SOLANA_RPC_URLS[0], {
  commitment: "confirmed",
  fetch: rotatingFetch,
  disableRetryOnRateLimit: true, // rotation above handles it
});

const USDC_DECIMALS = 6;

export function isSolanaAddress(value: string) {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export async function fetchSolanaBalances(address: string) {
  const owner = new PublicKey(address);
  // One after the other (not in parallel) so we don't burst the public endpoints.
  const lamports = await solanaConnection.getBalance(owner);
  const tokenAccounts = await solanaConnection.getParsedTokenAccountsByOwner(owner, {
    mint: new PublicKey(USDC_MINT),
  });

  const stable = tokenAccounts.value.reduce((sum, acc) => {
    const ui = acc.account.data.parsed?.info?.tokenAmount?.uiAmount;
    return sum + (typeof ui === "number" ? ui : 0);
  }, 0);

  return { native: lamports / LAMPORTS_PER_SOL, stable };
}

export async function sendSolana(args: {
  adapter: Adapter;
  from: string;
  to: string;
  asset: "SOL" | "USDC";
  amount: string;
}): Promise<string> {
  const { adapter, from, to, asset, amount } = args;
  const sender = new PublicKey(from);
  const recipient = new PublicKey(to);
  const tx = new Transaction();

  if (asset === "SOL") {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: recipient,
        lamports: toUnits(amount, 9),
      })
    );
  } else {
    const mint = new PublicKey(USDC_MINT);
    const units = toUnits(amount, USDC_DECIMALS);
    const senderAta = getAssociatedTokenAddressSync(mint, sender);
    const recipientAta = getAssociatedTokenAddressSync(mint, recipient);

    // Creates the recipient's USDC account if they don't have one yet (sender pays the small rent).
    tx.add(createAssociatedTokenAccountIdempotentInstruction(sender, recipientAta, recipient, mint));
    tx.add(createTransferCheckedInstruction(senderAta, mint, recipientAta, sender, units, USDC_DECIMALS));
  }

  const latest = await solanaConnection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = sender;

  const signature = await adapter.sendTransaction(tx, solanaConnection);
  await confirmBySignature(signature, latest.lastValidBlockHeight);
  return signature;
}

/** Poll over plain HTTP (public RPCs often block websockets, which confirmTransaction uses). */
async function confirmBySignature(signature: string, lastValidBlockHeight: number) {
  for (;;) {
    const { value } = await solanaConnection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error("The transaction failed on-chain.");
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return;
    const height = await solanaConnection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) {
      throw new Error("The transaction expired before confirming. Check your wallet history before retrying.");
    }
    await sleep(2000);
  }
}
