import { getSupabaseBrowserClient } from "./supabase";
import type { AssetSymbol, ChainId } from "./chains";

export type Recipient = { username: string; address: string | null; is_self: boolean };

export type TransferRow = {
  id: string;
  direction: "sent" | "received";
  counterparty: string;
  chain: ChainId;
  asset: AssetSymbol;
  amount: number;
  tx_hash: string;
  note: string | null;
  created_at: string;
};

export function cleanUsername(raw: string) {
  return raw.trim().replace(/^@+/, "");
}

export async function resolveRecipient(username: string, chain: ChainId): Promise<Recipient | null> {
  const { data, error } = await getSupabaseBrowserClient().rpc("resolve_recipient", {
    p_username: cleanUsername(username),
    p_chain: chain,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Recipient | undefined) ?? null;
}

export async function recordTransfer(args: {
  recipient: string;
  chain: ChainId;
  asset: AssetSymbol;
  amount: string;
  txHash: string;
  from: string;
  to: string;
  note: string;
}) {
  const { error } = await getSupabaseBrowserClient().rpc("record_transfer", {
    p_recipient: args.recipient,
    p_chain: args.chain,
    p_asset: args.asset,
    p_amount: args.amount,
    p_tx_hash: args.txHash,
    p_from_address: args.from,
    p_to_address: args.to,
    p_note: args.note.trim() || null,
  });
  if (error) throw error;
}

export async function fetchTransfers(limit = 15): Promise<TransferRow[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc("my_transfers", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as TransferRow[];
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await getSupabaseBrowserClient().rpc("username_available", {
    p_username: cleanUsername(username),
  });
  if (error) throw error;
  return Boolean(data);
}
