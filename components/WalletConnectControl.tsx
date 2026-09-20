"use client";

import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui";
import { useWallet } from "@/components/providers";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnectControl({ compact = false }: { compact?: boolean }) {
  const { address, network, connectEvm, connectSolana, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"evm" | "solana" | null>(null);
  const [error, setError] = useState("");

  const connect = async (target: "evm" | "solana") => {
    setError("");
    setPending(target);
    try {
      if (target === "evm") await connectEvm();
      else await connectSolana();
      setOpen(false);
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : "Wallet connection failed.");
    } finally {
      setPending(null);
    }
  };

  if (address) {
    return (
      <button
        type="button"
        onClick={disconnect}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full border border-brand/40 bg-brand/10 text-brand-dark dark:text-brand"
        title={`Disconnect ${network === "solana" ? "Solana" : "EVM"} wallet`}
      >
        <Wallet className="w-3.5 h-3.5" />
        {shortenAddress(address)}
      </button>
    );
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant={compact ? "ghost" : "primary"}
        className={compact ? "text-xs px-3 py-2 rounded-full" : ""}
        onClick={() => {
          setError("");
          setOpen((current) => !current);
        }}
        disabled={pending !== null}
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
        {pending ? "Connecting…" : compact ? "Not connected" : "Connect wallet"}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 w-56 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 shadow-lg">
          <p className="px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-400">Choose a wallet network</p>
          <button
            type="button"
            className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            onClick={() => void connect("evm")}
            disabled={pending !== null}
          >
            Robinhood / EVM
          </button>
          <button
            type="button"
            className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            onClick={() => void connect("solana")}
            disabled={pending !== null}
          >
            Solana
          </button>
          {error && <p className="px-2 pt-2 text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}