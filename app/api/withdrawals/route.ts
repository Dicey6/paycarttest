import { NextRequest, NextResponse } from "next/server";
import { adminClient, requireUser, userClient } from "@/lib/server/admin";
import { payoutUnits, prepareRhUsdgPayout, prepareSolanaUsdcPayout, type PreparedPayout } from "@/lib/server/treasury";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ERRORS: Record<string, string> = {
  insufficient_balance: "Your BowPay balance is too low.",
  amount_too_low: "The minimum cash-out is $1.",
  amount_too_high: "The maximum cash-out is $10,000.",
  bad_amount: "Use at most 2 decimal places.",
  no_wallet_linked: "Link a wallet on that network first.",
};

/**
 * Cash out a BowPay balance to the user's own linked wallet.
 * Order is the whole point: 1) debit in the database, 2) prepare + sign (nothing sent yet, refund if it fails),
 * 3) mark 'sending' with the tx hash, 4) broadcast. After step 3 we never refund automatically.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  let body: { chain?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const chain = body.chain;
  const amount = Number(body.amount);
  if ((chain !== "solana" && chain !== "robinhood") || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // 1) Debit + record, atomically. The destination is read from the database, not from the request.
  const { data, error } = await userClient(auth.token).rpc("request_withdrawal", { p_chain: chain, p_amount: amount });
  if (error) {
    const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
    return NextResponse.json({ error: key ? ERRORS[key] : "Couldn't start the cash-out." }, { status: 400 });
  }
  const w = (Array.isArray(data) ? data[0] : data) as { id: string; to_address: string; amount_usd: number | string };
  const admin = adminClient();

  // 2) Prepare + sign. Failing here is safe: nothing was broadcast, so refund.
  let payout: PreparedPayout;
  try {
    const units = await payoutUnits(chain, Number(w.amount_usd));
    payout = chain === "solana" ? await prepareSolanaUsdcPayout(w.to_address, units) : await prepareRhUsdgPayout(w.to_address, units);
  } catch (err) {
    await admin.rpc("fail_withdrawal", { p_id: w.id, p_error: err instanceof Error ? err.message : "prepare failed" });
    console.error("[withdrawal] prepare failed, refunded", w.id, err);
    return NextResponse.json({ error: "Cash-outs are temporarily unavailable on this network. You weren't charged." }, { status: 503 });
  }

  // 3) Point of no return: record 'sending' + the signed tx hash, then broadcast.
  const { data: marked } = await admin.rpc("mark_withdrawal_sending", { p_id: w.id, p_tx_hash: payout.txHash });
  if (!marked) return NextResponse.json({ error: "This cash-out is already being processed." }, { status: 409 });

  try {
    await payout.broadcast();
    await admin.rpc("complete_withdrawal", { p_id: w.id, p_tx_hash: payout.txHash });
    return NextResponse.json({ status: "sent", txHash: payout.txHash });
  } catch (err) {
    // Uncertain: the tx may or may not have landed. Left as 'sending' for manual review. No auto refund.
    console.error("[withdrawal] needs review", w.id, payout.txHash, err);
    return NextResponse.json(
      { status: "sending", txHash: payout.txHash, error: "Your cash-out is processing. It will show as sent once confirmed." },
      { status: 202 }
    );
  }
}
