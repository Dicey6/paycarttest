"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui";
import { useWallets } from "@/components/wallets";

export function WalletConnectControl({ compact = false }: { compact?: boolean }) {
  const { linked, openConnect } = useWallets();
  const count = Number(Boolean(linked.solana)) + Number(Boolean(linked.robinhood));

  if (compact && count > 0) {
    return (
      <button
        type="button"
        onClick={() => openConnect()}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full border border-brand/40 bg-brand/10 text-brand-dark dark:text-brand"
      >
        <Wallet className="w-3.5 h-3.5" />
        {count} wallet{count > 1 ? "s" : ""}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "primary"}
      className={compact ? "text-xs px-3 py-2 rounded-full" : ""}
      onClick={() => openConnect()}
    >
      <Wallet className="w-4 h-4" />
      {compact ? "Connect" : "Connect wallet"}
    </Button>
  );
}
