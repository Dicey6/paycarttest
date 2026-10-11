"use client";

import { useState } from "react";
import { AlertCircle, Check, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { NeedsConnectError, useWallets } from "@/components/wallets";
import { CHAINS, shortAddress, type ChainId } from "@/lib/chains";
import { formatAmount, formatUsd } from "@/lib/units";
import { sendSolana } from "@/lib/solana";
import { sendEvm } from "@/lib/evm";
import { depositMessage } from "@/lib/depositMessage";
import {
  FUND_ASSET,
  createGiftFromTransfer,
  fetchTreasuryAddresses,
  requestCashOut,
  signWithEvm,
  signWithSolana,
  verifyDeposit,
} from "@/lib/funding";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { GIFT_FEE, type GiftRow, type GiftTheme } from "@/lib/gifts";

type StepState = "idle" | "active" | "done";
const FUND_STEPS = ["Approve the transfer in your wallet", "Confirm on-chain", "Sign to prove it's your wallet", "Credit your BowPay card"];
const GIFT_STEPS = ["Approve the transfer in your wallet", "Confirm on-chain", "Sign to prove it's your wallet", "Create your gift card"];

function friendly(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/reject|denied|cancel/i.test(message)) return "You cancelled in your wallet. Nothing was charged.";
  if (/insufficient/i.test(message)) return "Insufficient funds (keep a little for network fees).";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

export function FundingModal({
  mode,
  onClose,
  onDone,
  gift,
  onGift,
}: {
  mode: "fund" | "cashout" | "gift";
  onClose: () => void;
  onDone: () => void;
  /** gift mode: the gift value is fixed; the wallet pays value + fee. */
  gift?: { amount: number; message: string; theme: GiftTheme };
  onGift?: (row: GiftRow) => void;
}) {
  const { linked, balances, openConnect, getSolanaSigner, getEvmSigner, refresh } = useWallets();
  const [chain, setChain] = useState<ChainId>(linked.solana ? "solana" : "robinhood");
  const isGift = mode === "gift" && !!gift;
  const [amount, setAmount] = useState(isGift ? (gift!.amount + GIFT_FEE).toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ text: string; hash?: string; pending?: boolean } | null>(null);

  const info = CHAINS[chain];
  const asset = FUND_ASSET[chain];
  const walletStable = balances[chain]?.stable;
  const amountNum = Number(amount);
  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && amountNum >= 1 && amountNum <= 10001;
  const fund = mode !== "cashout";
  const steps = isGift ? GIFT_STEPS : FUND_STEPS;
  const stateOf = (i: number): StepState => (i < step ? "done" : i === step ? "active" : "idle");

  const run = async () => {
    setError("");
    setBusy(true);
    setStep(-1);
    setTxHash("");
    let onChain = false; // true once the user's transfer has confirmed (funds are then in the treasury)
    try {
      if (!fund) {
        const out = await requestCashOut(chain, amountNum);
        setResult({
          text: out.status === "sent" ? `${formatUsd(amountNum)} sent to ${shortAddress(linked[chain] ?? "")}` : "Cash-out is processing. It will show as sent once confirmed.",
          hash: out.txHash,
          pending: out.status !== "sent",
        });
        onDone();
        return;
      }

      const treasury = (await fetchTreasuryAddresses())[chain];
      if (!treasury) throw new Error(`Funding isn't enabled on ${info.label} yet.`);
      if (walletStable !== undefined && amountNum > walletStable) throw new Error(`You only have ${formatAmount(walletStable, 2)} ${asset} in this wallet.`);

      // 1) the user signs the on-chain transfer to the BowPay treasury
      setStep(0);
      let hash: string;
      let from: string;
      let sign: (message: string) => Promise<string>;
      if (chain === "solana") {
        const s = getSolanaSigner();
        from = s.address;
        hash = await sendSolana({ adapter: s.adapter, from, to: treasury, asset: "USDC", amount: amount.trim() });
        sign = (m) => signWithSolana(s.adapter, m);
      } else {
        const s = await getEvmSigner();
        from = s.address;
        hash = await sendEvm({ wallet: s.wallet, from, to: treasury, asset: "USDG", amount: amount.trim() });
        sign = (m) => signWithEvm(s.wallet, from, m);
      }
      setTxHash(hash);
      onChain = true;

      // 2) sendSolana/sendEvm only return once the tx is confirmed on-chain
      setStep(1);

      // 3) signature binds this tx to this account (stops someone else claiming your deposit)
      setStep(2);
      const { data } = await getSupabaseBrowserClient().auth.getUser();
      if (!data.user) throw new Error("Please log in again.");
      const signature = await sign(depositMessage(data.user.id, chain, hash, isGift ? "gift" : "deposit"));

      // 4) server checks the chain again and the database records it
      setStep(3);
      if (isGift && gift) {
        const out = await createGiftFromTransfer({ chain, txHash: hash, signature, message: gift.message, theme: gift.theme });
        setStep(4);
        if (out.gift) {
          onGift?.({ ...out.gift, amount_usd: Number(out.gift.amount_usd), fee_usd: Number(out.gift.fee_usd), theme: out.gift.theme as GiftTheme });
          onDone();
          void refresh();
          onClose();
          return;
        }
        setResult({ text: `That was below the gift minimum, so ${formatUsd(out.amount_usd ?? 0)} was added to your BowPay card instead.`, hash });
        onDone();
        void refresh();
        return;
      }
      const out = await verifyDeposit({ chain, txHash: hash, signature });
      setStep(4);
      setResult({ text: `${formatUsd(out.amount_usd)} added to your BowPay card`, hash });
      onDone();
      void refresh();
    } catch (err) {
      if (err instanceof NeedsConnectError) {
        openConnect(err.chain, "sign");
        setError("Connect your wallet, then press the button again.");
      } else if (onChain) {
        setError(`${friendly(err)} Your transfer is on-chain and safe in the BowPay treasury.`);
      } else {
        setError(friendly(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-5">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">{isGift ? "Pay for your gift card" : fund ? "Add funds to your card" : "Cash out to your wallet"}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-brand" />
            <p className="font-medium">{result.text}</p>
            {result.hash && (
              <a href={info.txUrl(result.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm mt-3 text-brand-dark dark:text-brand">
                View transaction <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <Button className="w-full mt-5" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CHAINS) as ChainId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setChain(id);
                    setError("");
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-medium border ${
                    chain === id ? "border-brand bg-brand/10 text-brand-dark dark:text-brand" : "border-neutral-200 dark:border-neutral-700"
                  }`}
                >
                  {CHAINS[id].label} · {FUND_ASSET[id]}
                </button>
              ))}
            </div>

            {!linked[chain] ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Link a {info.label} wallet first.
                <Button className="w-full mt-3" onClick={() => openConnect(chain, "link")}>
                  Connect wallet
                </Button>
              </div>
            ) : (
              <>
                <Field
                  label={isGift ? `You pay (${asset}): gift ${formatUsd(gift!.amount)} + ${formatUsd(GIFT_FEE)} fee` : `Amount (${asset} ≈ USD)`}
                  hint={
                    fund
                      ? `From ${shortAddress(linked[chain]!)}${walletStable !== undefined ? ` · Available ${formatAmount(walletStable, 2)} ${asset}` : ""} · min $1`
                      : `To your linked wallet ${shortAddress(linked[chain]!)} · min $1`
                  }
                >
                  <Input inputMode="decimal" placeholder="10.00" value={amount} disabled={busy || isGift} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
                </Field>

                {fund && (busy || step >= 0) && (
                  <ol className="rounded-xl bg-neutral-50 dark:bg-neutral-800/60 px-4 py-3 space-y-2.5">
                    {steps.map((label, i) => {
                      const s = stateOf(i);
                      return (
                        <li key={label} className="flex items-center gap-2.5 text-sm">
                          <span className="w-5 h-5 flex items-center justify-center shrink-0">
                            {s === "done" ? <Check className="w-4 h-4 text-brand" /> : s === "active" ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />}
                          </span>
                          <span className={s === "idle" ? "text-neutral-400 dark:text-neutral-500" : ""}>{label}</span>
                        </li>
                      );
                    })}
                    {txHash && (
                      <li className="text-xs pt-1">
                        <a href={info.txUrl(txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-dark dark:text-brand">
                          Your transfer <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                    )}
                  </ol>
                )}

                {error && (
                  <p className="text-xs text-red-500 inline-flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    {error}
                  </p>
                )}

                <Button className="w-full py-3" disabled={!validAmount || busy} onClick={() => void run()}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {busy ? (fund ? "Working…" : "Sending…") : isGift ? `Pay ${formatUsd(amountNum)} from wallet` : fund ? `Add ${validAmount ? formatUsd(amountNum) : "funds"}` : `Cash out ${validAmount ? formatUsd(amountNum) : ""}`}
                </Button>
                <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
                  {isGift
                    ? "Paid straight from your wallet. The gift card is created once the transfer is confirmed on-chain and recorded."
                    : fund
                    ? "Your balance is credited only after the transfer is confirmed on-chain and recorded."
                    : "Your balance is debited first, then the payout is sent from the BowPay treasury."}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
