import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { createWalletClient, encodeFunctionData, erc20Abi, http, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RH_RPC_URL, USDC_MINT, USDG_RH_ADDRESS, robinhoodChain } from "../chains";
import { solanaConnection } from "../solana";
import { getUsdgDecimals, rhClient } from "../evm";

/* Treasury keys live ONLY in server env vars (never NEXT_PUBLIC_*). */

export function solanaTreasury(): Keypair {
  const raw = (process.env.BOWPAY_SOLANA_PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("BOWPAY_SOLANA_PRIVATE_KEY is not set.");
  try {
    // Phantom/Solflare export a base58 string; solana-keygen writes a JSON array of 64 bytes.
    const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
    return Keypair.fromSecretKey(bytes);
  } catch {
    throw new Error("BOWPAY_SOLANA_PRIVATE_KEY is not a valid base58 or JSON-array secret key.");
  }
}

export function rhTreasury() {
  const raw = (process.env.BOWPAY_RH_PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("BOWPAY_RH_PRIVATE_KEY is not set.");
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error("BOWPAY_RH_PRIVATE_KEY must be 32 bytes of hex.");
  return privateKeyToAccount(hex);
}

/** Public addresses derived from the keys, so they can never drift from what actually signs payouts. */
export function treasuryAddresses() {
  const out: { solana?: string; robinhood?: string } = {};
  try {
    out.solana = solanaTreasury().publicKey.toBase58();
  } catch {
    /* not configured */
  }
  try {
    out.robinhood = rhTreasury().address;
  } catch {
    /* not configured */
  }
  return out;
}

export type PreparedPayout = {
  txHash: string;
  /** Broadcasts the already-signed transaction and waits for confirmation. Throws on anything uncertain. */
  broadcast: () => Promise<void>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Everything that can fail safely (balance checks, building, signing) happens here, BEFORE the
 * database row is flipped to 'sending'. If this throws, nothing was sent and the debit can be refunded.
 */
export async function prepareSolanaUsdcPayout(to: string, units: bigint): Promise<PreparedPayout> {
  const payer = solanaTreasury();
  const recipient = new PublicKey(to);
  const mint = new PublicKey(USDC_MINT);
  const treasuryAta = getAssociatedTokenAddressSync(mint, payer.publicKey);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient, true);

  const [lamports, tokenBal] = await Promise.all([
    solanaConnection.getBalance(payer.publicKey),
    solanaConnection.getTokenAccountBalance(treasuryAta).catch(() => null),
  ]);
  if (lamports < 5_000_000) throw new Error("Treasury is low on SOL for network fees.");
  if (!tokenBal || BigInt(tokenBal.value.amount) < units) throw new Error("Treasury USDC balance is too low for this payout.");

  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, recipientAta, recipient, mint));
  tx.add(createTransferCheckedInstruction(treasuryAta, mint, recipientAta, payer.publicKey, units, 6));
  const latest = await solanaConnection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const signature = bs58.encode(tx.signature as Uint8Array);
  const raw = tx.serialize();

  return {
    txHash: signature,
    broadcast: async () => {
      await solanaConnection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
      for (;;) {
        const { value } = await solanaConnection.getSignatureStatuses([signature]);
        const status = value[0];
        if (status?.err) throw new Error("Payout transaction failed on-chain.");
        if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return;
        if ((await solanaConnection.getBlockHeight("confirmed")) > latest.lastValidBlockHeight) {
          throw new Error("Payout expired before confirming. Check the chain before retrying.");
        }
        await sleep(2000);
      }
    },
  };
}

export async function prepareRhUsdgPayout(to: string, units: bigint): Promise<PreparedPayout> {
  const account = rhTreasury();
  const recipient = to as Address;

  const [eth, usdg] = await Promise.all([
    rhClient.getBalance({ address: account.address }),
    rhClient.readContract({ address: USDG_RH_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  ]);
  if (eth === BigInt(0)) throw new Error("Treasury has no ETH on Robinhood Chain for gas.");
  if (usdg < units) throw new Error("Treasury USDG balance is too low for this payout.");

  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(RH_RPC_URL, { timeout: 15_000 }) });
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, units] });
  const request = await wallet.prepareTransactionRequest({ account, chain: robinhoodChain, to: USDG_RH_ADDRESS, data } as never);
  const serialized = await wallet.signTransaction(request as never);
  const hash = keccak256(serialized);

  return {
    txHash: hash,
    broadcast: async () => {
      await rhClient.sendRawTransaction({ serializedTransaction: serialized });
      const receipt = await rhClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
      if (receipt.status !== "success") throw new Error("Payout transaction reverted on-chain.");
    },
  };
}

export async function payoutUnits(chain: "solana" | "robinhood", amountUsd: number): Promise<bigint> {
  const decimals = chain === "solana" ? 6 : await getUsdgDecimals();
  // amountUsd has at most 2 decimals (enforced in the database), so cents * 10^(decimals-2) is exact.
  return BigInt(Math.round(amountUsd * 100)) * BigInt(10) ** BigInt(decimals - 2);
}
