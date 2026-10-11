"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Gift,
  LogOut,
  RefreshCw,
  Send,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/Nav";
import { VirtualCard } from "@/components/VirtualCard";
import { Badge, Button, Card } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useWallets } from "@/components/wallets";
import { SendModal } from "@/components/SendModal";
import { FundingModal } from "@/components/FundingModal";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { CHAINS, shortAddress, type ChainId } from "@/lib/chains";
import { formatAmount, formatUsd } from "@/lib/units";
import { fetchTransfers, type TransferRow } from "@/lib/transfers";

type CardRow = {
  card_number: string;
  last4: string;
  expiry_month: number;
  expiry_year: number;
  frozen: boolean;
};

function ChainRow({ chain }: { chain: ChainId }) {
  const { linked, balances, openConnect, disconnect } = useWallets();
  const info = CHAINS[chain];
  const address = linked[chain];
  const balance = balances[chain];
  const [native, stable] = info.assets;

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{info.label}</span>
          {address && <Badge tone={chain === "solana" ? "violet" : "green"}>{shortAddress(address)}</Badge>}
        </div>
        {address ? (
          <button
            type="button"
            onClick={() => void disconnect(chain)}
            className="text-xs text-neutral-500 hover:text-red-500"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openConnect(chain)}
            className="text-xs font-medium text-brand-dark dark:text-brand"
          >
            Connect
          </button>
        )}
      </div>
      {address ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{native.symbol}</div>
            <div className="text-sm font-semibold">{formatAmount(balance?.native, 5)}</div>
          </div>
          <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{stable.symbol}</div>
            <div className="text-sm font-semibold">{formatAmount(balance?.stable, 2)}</div>
          </div>
          {chain === "robinhood" && (balance?.tokens?.length ?? 0) > 0 && (
            <div className="col-span-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">Other tokens</div>
              <ul className="space-y-1">
                {balance!.tokens!.map((t) => (
                  <li key={t.address} className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate mr-3" title={t.name}>{t.symbol}</span>
                    <span className="text-right shrink-0">
                      {formatAmount(t.balance, 4)}
                      {t.usd !== undefined && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400"> · {formatUsd(t.usd)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {chain === "solana"
            ? "Phantom, Solflare, Jupiter and other Solana wallets."
            : "MetaMask and other Robinhood Chain wallets."}
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { session, profile, loading, signOut } = useAuth();
  const { totalUsd, pricesMissing, loading: balancesLoading, balanceError, refresh, linked, openConnect } =
    useWallets();

  const username = profile?.username ?? "";
  const [cardRevealed, setCardRevealed] = useState(false);
  const [card, setCard] = useState<CardRow | null>(null);
  const [cardBalance, setCardBalance] = useState<number | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [fundMode, setFundMode] = useState<"fund" | "cashout" | null>(null);
  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const userId = session?.user.id;
  const hasWallet = Boolean(linked.solana || linked.robinhood);

  const loadTransfers = useCallback(async () => {
    try {
      setTransfers(await fetchTransfers(15));
    } catch {
      /* history is non-critical */
    }
  }, []);

  const loadCardBalance = useCallback(async () => {
    if (!userId) return;
    const { data } = await getSupabaseBrowserClient().from("balances").select("balance_usd").eq("user_id", userId).maybeSingle();
    setCardBalance(data ? Number(data.balance_usd) : 0);
  }, [userId]);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, router, session]);

  // Keep every card visual in step with the database balance (deposits, claimed gifts, cash-outs).
  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadCardBalance();
    }, 30_000);
    const onFocus = () => void loadCardBalance();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, loadCardBalance]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("cards")
      .select("card_number, last4, expiry_month, expiry_year, frozen")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setCard((data as CardRow | null) ?? null));
    void loadCardBalance();
    void loadTransfers();
  }, [userId, loadTransfers, loadCardBalance]);

  const toggleCard = () => {
    setCardRevealed((v) => !v);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  };

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(`@${username}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading your BowPay account…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10">
      <AppNav />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome, {username || "there"}</h1>
            <button
              type="button"
              onClick={() => void copyHandle()}
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              title="Copy your BowPay username"
            >
              @{username} <Copy className="w-3.5 h-3.5" />
              {copied && <span className="text-xs text-brand-dark dark:text-brand">Copied</span>}
            </button>
          </div>
          <Button type="button" variant="secondary" onClick={() => void handleLogout()} disabled={loggingOut}>
            <LogOut className="w-4 h-4" />
            {loggingOut ? "Logging out…" : "Log out"}
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <Card className="md:col-span-2 p-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">Total wallet balance</span>
              <button
                type="button"
                onClick={() => void refresh()}
                aria-label="Refresh balances"
                className="p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                <RefreshCw className={`w-4 h-4 ${balancesLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="text-4xl font-semibold tracking-tight">{formatUsd(totalUsd)}</div>
            <p className="text-xs mt-1 mb-2 text-neutral-500 dark:text-neutral-400">
              {hasWallet
                ? pricesMissing
                  ? "SOL/ETH price unavailable, so only stablecoins are counted."
                  : "Across your linked wallets. View-only."
                : "Link a wallet to see your balances. View-only."}
            </p>
            {balanceError && <p className="text-xs text-red-500 mb-2">{balanceError}</p>}

            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              <ChainRow chain="solana" />
              <ChainRow chain="robinhood" />
            </div>

            <div className="flex gap-3 mt-3">
              <Button type="button" className="flex-1" onClick={() => setSendOpen(true)}>
                <Send className="w-4 h-4" /> Send
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => (hasWallet ? void copyHandle() : openConnect())}
              >
                {hasWallet ? (
                  <>
                    <ArrowDownLeft className="w-4 h-4" /> {copied ? "Copied" : "Receive"}
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4" /> Connect wallet
                  </>
                )}
              </Button>
            </div>
            {hasWallet && (
              <p className="text-xs mt-2 text-neutral-500 dark:text-neutral-400">
                To receive, share <span className="font-medium">@{username}</span>. Funds land in the wallet you
                linked for that network.
              </p>
            )}
          </Card>

          <Card className="p-6 flex flex-col items-center scroll-mt-24">
            <div className="w-full flex items-center justify-between mb-4">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">Your card</span>
              <span className="text-sm font-semibold">{formatUsd(cardBalance ?? 0)}</span>
            </div>
            <div ref={cardRef} className="w-full flex justify-center">
              <VirtualCard
                holderName={username}
                revealed={cardRevealed}
                frozen={card?.frozen}
                cardNumber={card?.card_number}
                balanceUsd={cardBalance ?? 0}
                last4={card?.last4}
                expiryMonth={card?.expiry_month}
                expiryYear={card?.expiry_year}
              />
            </div>
            <div className="w-full flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={toggleCard}
                aria-pressed={cardRevealed}
                className="text-sm font-medium flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200"
              >
                {cardRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {cardRevealed ? "Hide card" : "View card"}
              </button>
              <button
                type="button"
                className="text-sm font-medium text-brand-dark dark:text-brand flex items-center gap-1"
              >
                Manage card <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-full grid grid-cols-2 gap-2 mt-4">
              <Button type="button" onClick={() => setFundMode("fund")}>
                Add funds
              </Button>
              <Button type="button" variant="secondary" onClick={() => setFundMode("cashout")}>
                Cash out
              </Button>
            </div>
          </Card>
        </div>

        <Link href="/gifts" className="block">
          <Card className="flex items-center gap-4 hover:border-brand/50 transition-colors">
            <div className="w-11 h-11 rounded-xl bg-brand/10 text-brand-dark dark:text-brand flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">BowGift cards</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Send money as a gift card anyone can claim with a code.
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
          </Card>
        </Link>

        <Card padded={false}>
          <div className="px-5 pt-5 pb-1">
            <h3 className="text-base font-semibold">Recent transfers</h3>
          </div>
          {transfers.length === 0 ? (
            <div className="flex flex-col items-center text-center py-14 px-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <Wallet className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
              </div>
              <h3 className="text-base font-semibold mb-1.5">No transfers yet</h3>
              <p className="text-sm max-w-xs text-neutral-500 dark:text-neutral-400">
                Send or receive funds with a BowPay username and they&apos;ll show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {transfers.map((t) => {
                const sent = t.direction === "sent";
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        sent ? "bg-neutral-100 dark:bg-neutral-800" : "bg-brand/10 text-brand-dark dark:text-brand"
                      }`}
                    >
                      {sent ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {sent ? "Sent to" : "Received from"} @{t.counterparty}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {new Date(t.created_at).toLocaleString()} ·{" "}
                        <a
                          href={CHAINS[t.chain].txUrl(t.tx_hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {CHAINS[t.chain].label}
                        </a>
                        {t.note ? ` · “${t.note}”` : ""}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold shrink-0 ${sent ? "" : "text-brand-dark dark:text-brand"}`}>
                      {sent ? "−" : "+"}
                      {formatAmount(Number(t.amount), 6)} {t.asset}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {fundMode && (
        <FundingModal
          mode={fundMode}
          onClose={() => setFundMode(null)}
          onDone={() => void loadCardBalance()}
        />
      )}

      {sendOpen && (
        <SendModal
          onClose={() => setSendOpen(false)}
          onSent={() => void loadTransfers()}
        />
      )}
    </div>
  );
}
