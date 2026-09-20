"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Eye, EyeOff, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/Nav";
import { VirtualCard } from "@/components/VirtualCard";
import { Badge, Button, Card } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { WalletConnectControl } from "@/components/WalletConnectControl";

function BalanceRow({
  symbol,
  network,
  amount,
  tone,
}: {
  symbol: string;
  network: string;
  amount: string;
  tone: "green" | "violet";
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            tone === "green"
              ? "bg-brand/10 text-brand-dark dark:text-brand"
              : "bg-violet-500/10 text-violet-500"
          }`}
        >
          {symbol.slice(0, 1)}
        </div>
        <div>
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{symbol}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{network}</div>
        </div>
      </div>
      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{amount}</div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { session, profile, loading } = useAuth();
  const username = profile?.username ?? "";
  const firstName = username.trim() ? username.trim().split(" ")[0] : "there";
  const [cardRevealed, setCardRevealed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const toggleCard = () => {
    setCardRevealed((v) => !v);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, router, session]);

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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
          <p className="text-sm mt-1 text-neutral-500 dark:text-neutral-400">
            Connect a wallet to fund your BowPay balance.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <Card className="md:col-span-2 p-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">Available balance</span>
              <Badge>UI placeholder value</Badge>
            </div>
            <div className="text-4xl font-semibold tracking-tight mb-6">$0.00</div>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              <BalanceRow symbol="USDG" network="Robinhood Chain" amount="0.00" tone="green" />
              <BalanceRow symbol="USDC" network="Solana" amount="0.00" tone="violet" />
            </div>
            <div className="flex gap-3 mt-5">
              <div className="flex-1">
                <WalletConnectControl />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={toggleCard}
                aria-pressed={cardRevealed}
              >
                {cardRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {cardRevealed ? "Hide card" : "View card"}
              </Button>
            </div>
          </Card>

          <Card className="p-6 flex flex-col items-center scroll-mt-24">
            <span className="text-sm mb-4 self-start text-neutral-500 dark:text-neutral-400">
              Your card
            </span>
            <div ref={cardRef} className="w-full flex justify-center">
              <VirtualCard holderName={username} revealed={cardRevealed} />
            </div>
            <button className="text-sm font-medium mt-4 self-start text-brand-dark dark:text-brand flex items-center gap-1">
              Manage card <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </Card>
        </div>

        <Card padded={false}>
          <div className="flex items-center justify-between px-5 pt-5 pb-1">
            <h3 className="text-base font-semibold">Recent transactions</h3>
          </div>
          <div className="flex flex-col items-center text-center py-14 px-6">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <Wallet className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
            </div>
            <h3 className="text-base font-semibold mb-1.5">No transactions yet</h3>
            <p className="text-sm max-w-xs mb-5 text-neutral-500 dark:text-neutral-400">
              Once you connect a wallet and fund your balance, activity will show up here.
            </p>
             <WalletConnectControl />
          </div>
        </Card>
      </div>
    </div>
  );
}
