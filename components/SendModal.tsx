"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { NeedsConnectError, useWallets } from "@/components/wallets";
import { CHAINS, shortAddress, type AssetSymbol, type ChainId } from "@/lib/chains";
import { formatAmount, toUnits } from "@/lib/units";
import { sendSolana } from "@/lib/solana";
import { sendEvm } from "@/lib/evm";
import { cleanUsername, recordTransfer, resolveRecipient, type Recipient } from "@/lib/transfers";

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; recipient: Recipient }
  | { state: "missing" }
  | { state: "error"; message: string };

function friendlyError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/reject|denied|cancel/i.test(message)) return "You cancelled the transaction in your wallet.";
  if (/insufficient/i.test(message)) return "Insufficient funds (remember to keep some for network fees).";
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}

export function SendModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const { linked, balances, openConnect, getSolanaSigner, getEvmSigner, refresh } = useWallets();

  const defaultChain: ChainId = linked.solana ? "solana" : "robinhood";
  const [chain, setChain] = useState<ChainId>(defaultChain);
  const [asset, setAsset] = useState<AssetSymbol>(CHAINS[defaultChain].assets[1].symbol);
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ hash: string; to: string } | null>(null);

  const chainInfo = CHAINS[chain];
  const assetInfo = chainInfo.assets.find((a) => a.symbol === asset) ?? chainInfo.assets[0];
  const balance = balances[chain];
  const available = balance ? (assetInfo.native ? balance.native : balance.stable) : undefined;

  const switchChain = (next: ChainId) => {
    setChain(next);
    setAsset(CHAINS[next].assets[1].symbol);
    setError("");
  };

  // Look the username up (and the wallet it receives on) as the person types.
  useEffect(() => {
    const clean = cleanUsername(username);
    if (clean.length < 3) {
      setLookup({ state: "idle" });
      return;
    }
    setLookup({ state: "loading" });
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const recipient = await resolveRecipient(clean, chain);
        if (cancelled) return;
        setLookup(recipient ? { state: "found", recipient } : { state: "missing" });
      } catch (err) {
        if (!cancelled) setLookup({ state: "error", message: friendlyError(err) });
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username, chain]);

  const recipient = lookup.state === "found" ? lookup.recipient : null;
  const recipientProblem =
    lookup.state === "missing"
      ? "No BowPay user with that username."
      : recipient?.is_self
      ? "You can't send to yourself."
      : recipient && !recipient.address
      ? `@${recipient.username} hasn't linked a ${chainInfo.label} wallet yet.`
      : "";

  const canSend =
    !!linked[chain] && !!recipient?.address && !recipient.is_self && amount.trim() !== "" && !sending;

  const submit = async () => {
    setError("");
    if (!recipient?.address) return;
    try {
      toUnits(amount, assetInfo.decimals); // validates amount early
      if (available !== undefined && Number(amount) > available) {
        throw new Error(`You only have ${formatAmount(available, 6)} ${asset} in this wallet.`);
      }

      setSending(true);
      let hash: string;
      let from: string;

      if (chain === "solana") {
        const signer = getSolanaSigner();
        from = signer.address;
        hash = await sendSolana({
          adapter: signer.adapter,
          from,
          to: recipient.address,
          asset: asset as "SOL" | "USDC",
          amount,
        });
      } else {
        const signer = await getEvmSigner();
        from = signer.address;
        hash = await sendEvm({
          wallet: signer.wallet,
          from,
          to: recipient.address,
          asset: asset as "ETH" | "USDG",
          amount,
        });
      }

      // The money has moved. Saving the note/history is best-effort.
      try {
        await recordTransfer({
          recipient: recipient.username,
          chain,
          asset,
          amount: amount.trim(),
          txHash: hash,
          from,
          to: recipient.address,
          note,
        });
      } catch {
        setError("Sent on-chain, but the note/history could not be saved.");
      }

      setDone({ hash, to: recipient.username });
      onSent();
      void refresh();
    } catch (err) {
      if (err instanceof NeedsConnectError) {
        openConnect(err.chain, "sign"); // wallet picker opens on top; your form stays filled in
        setError("Connect your wallet, then press Send again.");
        return;
      }
      setError(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-5">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Send to a BowPay user</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-brand" />
            <p className="font-medium">
              Sent {amount} {asset} to @{done.to}
            </p>
            {error && <p className="text-xs text-amber-500 mt-2">{error}</p>}
            <a
              href={chainInfo.txUrl(done.hash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm mt-3 text-brand-dark dark:text-brand"
            >
              View transaction <ExternalLink className="w-3.5 h-3.5" />
            </a>
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
                  onClick={() => switchChain(id)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium border ${
                    chain === id
                      ? "border-brand bg-brand/10 text-brand-dark dark:text-brand"
                      : "border-neutral-200 dark:border-neutral-700"
                  }`}
                >
                  {CHAINS[id].label}
                </button>
              ))}
            </div>

            {!linked[chain] ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Link a {chainInfo.label} wallet first to send on this network.
                <Button
                  className="w-full mt-3"
                  onClick={() => openConnect(chain, "link")}
                >
                  Connect wallet
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {chainInfo.assets.map((a) => (
                    <button
                      key={a.symbol}
                      type="button"
                      onClick={() => setAsset(a.symbol)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium border ${
                        asset === a.symbol
                          ? "border-brand bg-brand/10 text-brand-dark dark:text-brand"
                          : "border-neutral-200 dark:border-neutral-700"
                      }`}
                    >
                      {a.symbol}
                    </button>
                  ))}
                </div>

                <Field label="Recipient username">
                  <Input
                    placeholder="@username"
                    value={username}
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <span className="block text-xs mt-1.5 min-h-[1rem]">
                    {lookup.state === "loading" && <span className="text-neutral-500">Looking up…</span>}
                    {lookup.state === "error" && <span className="text-red-500">{lookup.message}</span>}
                    {recipientProblem && (
                      <span className="text-red-500 inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {recipientProblem}
                      </span>
                    )}
                    {recipient?.address && !recipient.is_self && (
                      <span className="text-brand-dark dark:text-brand">
                        @{recipient.username} · receives at {shortAddress(recipient.address)}
                      </span>
                    )}
                  </span>
                </Field>

                <Field
                  label={`Amount (${asset})`}
                  hint={available !== undefined ? `Available: ${formatAmount(available, 6)} ${asset}` : undefined}
                >
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                  />
                </Field>

                <Field label="Note (optional)" hint={`${note.length}/140 · visible to you and the recipient`}>
                  <Input
                    placeholder="Dinner, rent, thanks…"
                    maxLength={140}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <Button className="w-full py-3" disabled={!canSend} onClick={() => void submit()}>
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Confirm in your wallet…
                    </>
                  ) : (
                    `Send ${asset}`
                  )}
                </Button>
                <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
                  Funds go straight from your wallet to theirs. Network fees apply.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
