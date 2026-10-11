import { createWalletClient, custom, type Address } from "viem";
import type { Adapter } from "@solana/wallet-adapter-base";
import { getSupabaseBrowserClient } from "./supabase";
import { robinhoodChain, type ChainId } from "./chains";
import type { EvmWallet } from "./evm";

/** Stablecoin each chain funds the card with (credited 1:1 to USD). */
export const FUND_ASSET: Record<ChainId, "USDC" | "USDG"> = { solana: "USDC", robinhood: "USDG" };

async function headers() {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchTreasuryAddresses(): Promise<Partial<Record<ChainId, string>>> {
  const res = await fetch("/api/treasury", { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load the BowPay funding address.");
  const json = (await res.json()) as { addresses?: Partial<Record<ChainId, string>> };
  return json.addresses ?? {};
}

export async function signWithSolana(adapter: Adapter, message: string): Promise<string> {
  const a = adapter as unknown as { signMessage?: (m: Uint8Array) => Promise<Uint8Array> };
  if (!a.signMessage) throw new Error("This wallet can't sign messages. Try Phantom or Solflare.");
  const sig = await a.signMessage(new TextEncoder().encode(message));
  let bin = "";
  sig.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export async function signWithEvm(wallet: EvmWallet, from: string, message: string): Promise<string> {
  const client = createWalletClient({ account: from as Address, chain: robinhoodChain, transport: custom(wallet.provider) });
  return client.signMessage({ message });
}

/** Asks the server to verify the chain + signature and credit the balance. Polls briefly while the tx is still indexing. */
export async function verifyDeposit(args: { chain: ChainId; txHash: string; signature: string }): Promise<{ credited: boolean; amount_usd: number }> {
  const h = await headers();
  for (let i = 0; i < 15; i++) {
    const res = await fetch("/api/deposits/verify", { method: "POST", headers: h, body: JSON.stringify(args) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) throw new Error(json.error ?? "Couldn't verify the deposit.");
    return { credited: Boolean(json.credited), amount_usd: Number(json.amount_usd) };
  }
  throw new Error("The network is slow. Your funds are safe in the BowPay treasury. Try again in a minute.");
}

export type CreatedGift = {
  gift?: { id: string; code: string; creator_id: string; amount_usd: number | string; fee_usd: number | string; theme: string; message: string | null; status: "active" | "claimed"; claimed_at: string | null; created_at: string };
  credited_to_balance?: boolean;
  amount_usd?: number;
};

/** After the wallet transfer is confirmed: the server checks the chain + signature and creates the gift card. */
export async function createGiftFromTransfer(args: { chain: ChainId; txHash: string; signature: string; message: string; theme: string }): Promise<CreatedGift> {
  const h = await headers();
  for (let i = 0; i < 15; i++) {
    const res = await fetch("/api/gifts/create", { method: "POST", headers: h, body: JSON.stringify(args) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) throw new Error(json.error ?? "Couldn't create the gift card.");
    return json as CreatedGift;
  }
  throw new Error("The network is slow. Your funds are safe in the BowPay treasury. Try again in a minute.");
}

export async function requestCashOut(chain: ChainId, amount: number): Promise<{ status: "sent" | "sending"; txHash: string }> {
  const res = await fetch("/api/withdrawals", { method: "POST", headers: await headers(), body: JSON.stringify({ chain, amount }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) throw new Error(json.error ?? "Couldn't complete the cash-out.");
  return { status: json.status, txHash: json.txHash };
}
