import { createPublicKey, verify as edVerify } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { erc20Abi, formatUnits, isAddress, parseEventLogs, verifyMessage, type Hex } from "viem";
import { USDC_MINT, USDG_RH_ADDRESS } from "../chains";
import { solanaConnection } from "../solana";
import { getUsdgDecimals, rhClient } from "../evm";

export type VerifiedDeposit = {
  from: string; // address that paid the treasury
  to: string; // treasury address that received
  amount: number; // stablecoin units, as received by the treasury
};

export class NotYetError extends Error {}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Verifies a wallet-signed message (base64 signature for Solana, hex for EVM) against the paying address. */
export async function verifyOwnership(chain: "solana" | "robinhood", address: string, message: string, signature: string) {
  if (chain === "solana") {
    try {
      const key = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, new PublicKey(address).toBytes()]),
        format: "der",
        type: "spki",
      });
      return edVerify(null, Buffer.from(message, "utf8"), key, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  }
  if (!isAddress(address)) return false;
  try {
    return await verifyMessage({ address, message, signature: signature as Hex });
  } catch {
    return false;
  }
}

/** Reads the Solana tx and returns how much USDC the treasury actually received, and who paid. */
export async function readSolanaDeposit(signature: string, treasury: string): Promise<VerifiedDeposit> {
  const tx = await solanaConnection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) throw new NotYetError("Transaction not found yet.");
  if (tx.meta?.err) throw new Error("That transaction failed on-chain.");

  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const deltas = new Map<string, bigint>(); // owner -> delta in base units, USDC only
  const add = (rows: typeof post, sign: 1 | -1) => {
    for (const r of rows) {
      if (r.mint !== USDC_MINT || !r.owner) continue;
      deltas.set(r.owner, (deltas.get(r.owner) ?? BigInt(0)) + BigInt(sign) * BigInt(r.uiTokenAmount.amount));
    }
  };
  add(post, 1);
  add(pre, -1);

  const received = deltas.get(treasury) ?? BigInt(0);
  if (received <= BigInt(0)) throw new Error("That transaction did not send USDC to the BowPay treasury.");

  // The payer is the owner whose USDC went down by at least what the treasury received.
  const payer = [...deltas.entries()].find(([owner, d]) => owner !== treasury && d <= -received)?.[0];
  if (!payer) throw new Error("Couldn't identify who paid in that transaction.");

  return { from: payer, to: treasury, amount: Number(formatUnits(received, 6)) };
}

/** Reads the Robinhood Chain tx and returns how much USDG the treasury received, and who paid. */
export async function readRhDeposit(hash: string, treasury: string): Promise<VerifiedDeposit> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid transaction hash.");
  const receipt = await rhClient.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
  if (!receipt) throw new NotYetError("Transaction not found yet.");
  if (receipt.status !== "success") throw new Error("That transaction failed on-chain.");

  const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter(
    (l) => l.address.toLowerCase() === USDG_RH_ADDRESS.toLowerCase() && l.args.to.toLowerCase() === treasury.toLowerCase()
  );
  if (logs.length === 0) throw new Error("That transaction did not send USDG to the BowPay treasury.");

  const payers = new Set(logs.map((l) => l.args.from.toLowerCase()));
  if (payers.size !== 1) throw new Error("Deposits must come from a single wallet.");
  const total = logs.reduce((s, l) => s + l.args.value, BigInt(0));
  const decimals = await getUsdgDecimals();

  return { from: logs[0].args.from, to: treasury, amount: Number(formatUnits(total, decimals)) };
}
