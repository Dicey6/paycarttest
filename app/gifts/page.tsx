"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, Gift, Loader2, Share2 } from "lucide-react";
import { AppNav } from "@/components/Nav";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { FundingModal } from "@/components/FundingModal";
import { formatUsd } from "@/lib/units";
import {
  GIFT_FEE,
  GIFT_MAX,
  GIFT_MIN,
  GIFT_THEMES,
  canShareImages,
  claimGiftCard,
  downloadGiftCardPng,
  fetchBalanceUsd,
  fetchMyGiftCards,
  giftCardDataUrl,
  giftError,
  shareGiftCard,
  type GiftRow,
  type GiftTheme,
} from "@/lib/gifts";

const QUICK = [5, 10, 25, 50];

function CardImage({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="BowGift card" className="w-full rounded-[22px] shadow-xl" />;
}

export default function GiftsPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const userId = session?.user.id;

  const [balance, setBalance] = useState<number | null>(null);
  const [cards, setCards] = useState<GiftRow[]>([]);

  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<GiftTheme>("lime");
  const [created, setCreated] = useState<GiftRow | null>(null);
  const [error, setError] = useState("");

  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemed, setRedeemed] = useState<{ amount: number; from: string | null; message: string | null } | null>(null);

  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");
  const [fundOpen, setFundOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  const load = useCallback(async () => {
    if (!userId) return;
    const [b, c] = await Promise.allSettled([fetchBalanceUsd(), fetchMyGiftCards(userId)]);
    if (b.status === "fulfilled") setBalance(b.value);
    if (c.status === "fulfilled") setCards(c.value);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const amountNum = Number(amount);
  const valid =
    /^\d+(\.\d{1,2})?$/.test(amount.trim()) && amountNum >= GIFT_MIN && amountNum <= GIFT_MAX;
  const total = valid ? amountNum + GIFT_FEE : undefined;

  const preview = giftCardDataUrl({
    code: "BOW-••••-••••-••••-••••",
    amount_usd: valid ? amountNum : GIFT_MIN,
    theme,
    message: message.trim() || null,
  });

  const [payOpen, setPayOpen] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(canShareImages()), []);

  const share = async (row: GiftRow) => {
    setBusy(row.id);
    try {
      await shareGiftCard(row);
    } catch (err) {
      setError(giftError(err));
    } finally {
      setBusy("");
    }
  };

  const redeem = async () => {
    setRedeemError("");
    setRedeemed(null);
    setRedeeming(true);
    try {
      setRedeemed(await claimGiftCard(code));
      setCode("");
      void load();
    } catch (err) {
      setRedeemError(giftError(err));
    } finally {
      setRedeeming(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = async (row: GiftRow) => {
    setBusy(row.id);
    try {
      await downloadGiftCardPng(row);
    } catch (err) {
      setError(giftError(err));
    } finally {
      setBusy("");
    }
  };

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12">
      <AppNav />
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400 mb-3">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Gift className="w-6 h-6 text-brand-dark dark:text-brand" /> BowGift
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Turn your BowPay balance into a gift card anyone can claim with a code.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">BowPay balance</div>
              <div className="text-lg font-semibold">{balance === null ? "…" : formatUsd(balance)}</div>
              <button type="button" onClick={() => setFundOpen(true)} className="text-xs font-medium text-brand-dark dark:text-brand">
                Add funds
              </button>
            </div>
          </div>
        </div>

        {created ? (
          <Card className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-dark dark:text-brand">
              <Check className="w-4 h-4" /> Your gift card is ready
            </div>
            <CardImage src={giftCardDataUrl(created)} />
            <div className={`grid gap-3 ${canShare ? "grid-cols-3" : "grid-cols-2"}`}>
              {canShare && (
                <Button type="button" onClick={() => void share(created)} disabled={busy === created.id}>
                  <Share2 className="w-4 h-4" /> Share
                </Button>
              )}
              <Button type="button" variant={canShare ? "secondary" : "primary"} onClick={() => void download(created)} disabled={busy === created.id}>
                {busy === created.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download
              </Button>
              <Button type="button" variant="secondary" onClick={() => void copy(created.code)}>
                {copied === created.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied === created.code ? "Copied" : "Copy code"}
              </Button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Whoever enters this code first receives {formatUsd(created.amount_usd)} in their BowPay balance. Share it
              only with the person you&apos;re gifting.
            </p>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setCreated(null)}>
              Create another
            </Button>
          </Card>
        ) : (
          <Card className="space-y-5">
            <h2 className="text-base font-semibold">Create a gift card</h2>
            <CardImage src={preview} />

            <Field label="Amount (USD)" hint={`Minimum $${GIFT_MIN}. A flat $${GIFT_FEE} fee is added.`}>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                placeholder="10"
              />
            </Field>
            <div className="flex flex-wrap gap-2 -mt-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium border ${
                    amountNum === q
                      ? "border-brand bg-brand/10 text-brand-dark dark:text-brand"
                      : "border-neutral-200 dark:border-neutral-700"
                  }`}
                >
                  ${q}
                </button>
              ))}
            </div>

            <Field label="Message (optional)" hint={`${message.length}/80`}>
              <Input
                maxLength={80}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Happy birthday!"
              />
            </Field>

            <div>
              <div className="text-sm font-medium mb-2">Style</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(GIFT_THEMES) as GiftTheme[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    aria-pressed={theme === id}
                    className={`rounded-xl p-1 border-2 ${theme === id ? "border-brand" : "border-transparent"}`}
                  >
                    <div
                      className="h-10 rounded-lg"
                      style={{ background: `linear-gradient(135deg, ${GIFT_THEMES[id].from}, ${GIFT_THEMES[id].to})` }}
                    />
                    <div className="text-xs mt-1 text-neutral-600 dark:text-neutral-300">{GIFT_THEMES[id].label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/60 px-4 py-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Gift value</span>
                <span>{valid ? formatUsd(amountNum) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 dark:text-neutral-400">Fee</span>
                <span>{formatUsd(GIFT_FEE)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1.5 border-t border-neutral-200 dark:border-neutral-700">
                <span>Total charged</span>
                <span>{total !== undefined ? formatUsd(total) : "—"}</span>
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button type="button" className="w-full py-3" disabled={!valid} onClick={() => { setError(""); setPayOpen(true); }}>
              <Gift className="w-4 h-4" />
              {total !== undefined ? `Pay ${formatUsd(total)} from your wallet` : "Create gift card"}
            </Button>
            <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
              Paid straight from your connected wallet. Your card is created once the transfer is confirmed.
            </p>
          </Card>
        )}

        <Card className="space-y-4">
          <h2 className="text-base font-semibold">Redeem a gift card</h2>
          <Field label="Gift code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BOW-XXXX-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          {redeemError && <p className="text-xs text-red-500">{redeemError}</p>}
          {redeemed && (
            <div className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm">
              <div className="font-medium text-brand-dark dark:text-brand">
                {formatUsd(redeemed.amount)} added to your BowPay balance
              </div>
              {(redeemed.from || redeemed.message) && (
                <div className="text-xs mt-1 text-neutral-600 dark:text-neutral-300">
                  {redeemed.from ? `From @${redeemed.from}` : ""}
                  {redeemed.from && redeemed.message ? " · " : ""}
                  {redeemed.message ? `“${redeemed.message}”` : ""}
                </div>
              )}
            </div>
          )}
          <Button type="button" variant="secondary" className="w-full" disabled={code.trim().length < 8 || redeeming} onClick={() => void redeem()}>
            {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {redeeming ? "Redeeming…" : "Redeem"}
          </Button>
        </Card>

        <Card padded={false}>
          <div className="px-5 pt-5 pb-1">
            <h2 className="text-base font-semibold">Your gift cards</h2>
          </div>
          {cards.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Gift cards you create will show up here.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {cards.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div
                    className="w-10 h-10 rounded-lg shrink-0"
                    style={{ background: `linear-gradient(135deg, ${GIFT_THEMES[c.theme].from}, ${GIFT_THEMES[c.theme].to})` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{formatUsd(c.amount_usd)}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate font-mono">
                      {c.status === "active" ? c.code : `Claimed ${c.claimed_at ? new Date(c.claimed_at).toLocaleDateString() : ""}`}
                    </div>
                  </div>
                  <Badge tone={c.status === "active" ? "green" : "neutral"}>{c.status === "active" ? "Active" : "Claimed"}</Badge>
                  <button
                    type="button"
                    aria-label="Download card image"
                    onClick={() => void download(c)}
                    disabled={busy === c.id}
                    className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  >
                    {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  {c.status === "active" && (
                    <button
                      type="button"
                      aria-label="Copy code"
                      onClick={() => void copy(c.code)}
                      className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      {copied === c.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {payOpen && valid && (
        <FundingModal
          mode="gift"
          gift={{ amount: amountNum, message: message.trim(), theme }}
          onGift={(row) => setCreated(row)}
          onClose={() => setPayOpen(false)}
          onDone={() => void load()}
        />
      )}
      {fundOpen && <FundingModal mode="fund" onClose={() => setFundOpen(false)} onDone={() => void load()} />}
    </div>
  );
}
