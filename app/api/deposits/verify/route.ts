import { NextRequest, NextResponse } from "next/server";
import { adminClient, requireUser } from "@/lib/server/admin";
import { treasuryAddresses } from "@/lib/server/treasury";
import { NotYetError, readRhDeposit, readSolanaDeposit, verifyOwnership } from "@/lib/server/verifyDeposit";
import { depositMessage } from "@/lib/depositMessage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIN_DEPOSIT_USD = 1;

/**
 * Credits a card balance ONLY after: (1) the chain shows the treasury received stablecoins,
 * (2) the paying wallet signed a message tying that exact tx to this account, and
 * (3) the database accepted the credit (unique per chain + tx hash, so replays do nothing).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  let body: { chain?: string; txHash?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { chain, txHash, signature } = body;
  if ((chain !== "solana" && chain !== "robinhood") || !txHash || !signature || txHash.length > 120 || signature.length > 400) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const treasury = treasuryAddresses()[chain];
  if (!treasury) return NextResponse.json({ error: "Funding isn't enabled for this network yet." }, { status: 503 });

  try {
    const dep = chain === "solana" ? await readSolanaDeposit(txHash, treasury) : await readRhDeposit(txHash, treasury);

    const message = depositMessage(auth.user.id, chain, txHash);
    if (!(await verifyOwnership(chain, dep.from, message, signature))) {
      return NextResponse.json({ error: "The signature doesn't match the wallet that paid. Nothing was credited." }, { status: 403 });
    }
    if (dep.amount < MIN_DEPOSIT_USD) {
      return NextResponse.json({ error: `Deposits under $${MIN_DEPOSIT_USD} aren't credited.` }, { status: 422 });
    }

    const usd = Math.floor(dep.amount * 100) / 100; // never round up in the house's disfavour
    const { data, error } = await adminClient().rpc("credit_deposit", {
      p_user: auth.user.id,
      p_chain: chain,
      p_tx_hash: txHash,
      p_from: dep.from,
      p_to: dep.to,
      p_amount_native: dep.amount,
      p_amount_usd: usd,
    });
    if (error) {
      const msg = error.message.includes("tx_belongs_to_another_user")
        ? "That transaction was already claimed by another account."
        : "Couldn't record the deposit. Your funds are safe in the treasury, try again in a moment.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof NotYetError) return NextResponse.json({ pending: true }, { status: 202 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed." }, { status: 422 });
  }
}
