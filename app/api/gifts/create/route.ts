import { NextRequest, NextResponse } from "next/server";
import { adminClient, requireUser } from "@/lib/server/admin";
import { treasuryAddresses } from "@/lib/server/treasury";
import { NotYetError, readRhDeposit, readSolanaDeposit, verifyOwnership } from "@/lib/server/verifyDeposit";
import { depositMessage } from "@/lib/depositMessage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GIFT_FEE = 1;
const GIFT_MIN = 5;
const GIFT_MAX = 10000;

/**
 * BowGift paid straight from a wallet: the user's transfer to the treasury funds the card.
 * The card is created only after the chain shows the treasury received (gift + $1 fee) and the paying
 * wallet signed for this exact transaction. If the amount can't make a valid gift, the money is credited
 * to the user's card balance instead, so a confirmed transfer is never stranded.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  let body: { chain?: string; txHash?: string; signature?: string; message?: string; theme?: string };
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
  if (!treasury) return NextResponse.json({ error: "Gifts aren't enabled for this network yet." }, { status: 503 });

  try {
    const dep = chain === "solana" ? await readSolanaDeposit(txHash, treasury) : await readRhDeposit(txHash, treasury);

    if (!(await verifyOwnership(chain, dep.from, depositMessage(auth.user.id, chain, txHash, "gift"), signature))) {
      return NextResponse.json({ error: "The signature doesn't match the wallet that paid. Nothing was created." }, { status: 403 });
    }

    const total = Math.floor(dep.amount * 100) / 100;
    const gift = Math.round((total - GIFT_FEE) * 100) / 100;
    const admin = adminClient();
    const common = {
      p_user: auth.user.id,
      p_chain: chain,
      p_tx_hash: txHash,
      p_from: dep.from,
      p_to: dep.to,
      p_amount_native: dep.amount,
    };

    if (gift < GIFT_MIN || gift > GIFT_MAX) {
      if (total < 1) return NextResponse.json({ error: "That transfer is too small to credit." }, { status: 422 });
      const { error } = await admin.rpc("credit_deposit", { ...common, p_amount_usd: total });
      if (error) return NextResponse.json({ error: "Couldn't record the transfer. Your funds are safe in the treasury, try again." }, { status: 409 });
      return NextResponse.json({ credited_to_balance: true, amount_usd: total });
    }

    const { data, error } = await admin.rpc("create_gift_from_deposit", {
      ...common,
      p_total_usd: total,
      p_message: (body.message ?? "").slice(0, 80),
      p_theme: body.theme ?? "lime",
    });
    if (error) {
      const msg = error.message.includes("tx_belongs_to_another_user")
        ? "That transaction was already used by another account."
        : error.message.includes("tx_already_used")
        ? "That transaction was already applied to your card balance."
        : "Couldn't create the gift. Your funds are safe in the treasury, try again in a moment.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ gift: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    if (err instanceof NotYetError) return NextResponse.json({ pending: true }, { status: 202 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed." }, { status: 422 });
  }
}
