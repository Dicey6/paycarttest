import { NextRequest, NextResponse } from "next/server";
import { treasuryAddresses } from "@/lib/server/treasury";
import { fetchSolanaBalances } from "@/lib/solana";
import { fetchRobinhoodBalances } from "@/lib/evm";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

/**
 * Public: the treasury deposit addresses (derived from the server-held keys).
 * Admin: add header `x-admin-token: $BOWPAY_ADMIN_TOKEN` to also get live treasury balances,
 * which is how you check the env wallets actually see their funds.
 */
export async function GET(req: NextRequest) {
  const addresses = treasuryAddresses();
  const adminToken = process.env.BOWPAY_ADMIN_TOKEN;
  const isAdmin = !!adminToken && req.headers.get("x-admin-token") === adminToken;

  if (!isAdmin) return NextResponse.json({ addresses }, { headers: { "Cache-Control": "no-store" } });

  const [solana, robinhood] = await Promise.all([
    addresses.solana ? fetchSolanaBalances(addresses.solana).catch((e: Error) => ({ error: e.message })) : undefined,
    addresses.robinhood ? fetchRobinhoodBalances(addresses.robinhood).catch((e: Error) => ({ error: e.message })) : undefined,
  ]);
  return NextResponse.json({ addresses, balances: { solana, robinhood } }, { headers: { "Cache-Control": "no-store" } });
}
