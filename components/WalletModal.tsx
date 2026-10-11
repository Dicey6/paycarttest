"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, X } from "lucide-react";
import { useWallet as useSolanaWalletList } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { discoverEvmWallets, type EvmWallet } from "@/lib/evm";
import { useWallets } from "@/components/wallets";
import { shortAddress, type ChainId } from "@/lib/chains";

function friendlyError(err: unknown) {
  const message = err instanceof Error ? err.message : "Wallet connection failed.";
  if (/reject|denied|cancel/i.test(message)) return "Connection was cancelled in the wallet.";
  return message;
}

function WalletRow({
  name,
  icon,
  badge,
  pending,
  disabled,
  onClick,
}: {
  name: string;
  icon?: string;
  badge: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="w-7 h-7 rounded-lg" />
      ) : (
        <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
      )}
      <span className="flex-1 text-sm font-medium">{name}</span>
      {pending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{badge}</span>
      )}
    </button>
  );
}

export function WalletModal() {
  const { modal, closeModal, connectSolanaWallet, connectEvmWallet, linked } = useWallets();
  const { wallets: solWallets } = useSolanaWalletList();
  const [evmWallets, setEvmWallets] = useState<EvmWallet[]>([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!modal) return;
    setError("");
    setPending("");
    void discoverEvmWallets().then(setEvmWallets);
  }, [modal]);

  if (!modal) return null;

  const signing = modal.mode === "sign";
  // Linking shows both chains so you can connect two wallets in one go.
  // Signing only needs the chain you're sending on.
  const showSolana = !signing || modal.chain === "solana";
  const showEvm = !signing || modal.chain === "robinhood";

  const solList = solWallets
    .filter((w) => w.readyState !== WalletReadyState.Unsupported)
    .sort((a, b) => Number(isReady(b.readyState)) - Number(isReady(a.readyState)));

  function isReady(state: WalletReadyState) {
    return state === WalletReadyState.Installed || state === WalletReadyState.Loadable;
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setError("");
    setPending(key);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending("");
    }
  };

  const title = signing
    ? `Connect to sign`
    : "Connect your wallets";

  const heading = (chain: ChainId) => (chain === "solana" ? "Solana" : "Robinhood Chain");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={closeModal}
      />
      <div className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={closeModal} aria-label="Close" className="p-1 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {signing
            ? "Approve the connection so you can sign this transfer in your wallet."
            : "View-only. BowPay saves your public address to show balances. Nothing is signed or moved until you send."}
        </p>

        {showSolana && (
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              {heading("solana")}
              {linked.solana && (
                <span className="inline-flex items-center gap-1 normal-case text-brand-dark dark:text-brand">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {shortAddress(linked.solana)}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {solList.length === 0 && (
                <p className="text-sm text-neutral-500">No Solana wallets found in this browser.</p>
              )}
              {solList.map(({ adapter, readyState }) => {
                const ready = isReady(readyState);
                if (!ready) {
                  return (
                    <a
                      key={adapter.name}
                      href={adapter.url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border border-neutral-200 dark:border-neutral-800 opacity-70"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={adapter.icon} alt="" className="w-7 h-7 rounded-lg" />
                      <span className="flex-1 text-sm font-medium">{adapter.name}</span>
                      <span className="text-xs inline-flex items-center gap-1 text-neutral-500">
                        Get <ExternalLink className="w-3 h-3" />
                      </span>
                    </a>
                  );
                }
                return (
                  <WalletRow
                    key={adapter.name}
                    name={adapter.name}
                    icon={adapter.icon}
                    badge="Detected"
                    pending={pending === `sol:${adapter.name}`}
                    disabled={pending !== ""}
                    onClick={() => run(`sol:${adapter.name}`, () => connectSolanaWallet(adapter))}
                  />
                );
              })}
            </div>
          </div>
        )}

        {showEvm && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              {heading("robinhood")}
              {linked.robinhood && (
                <span className="inline-flex items-center gap-1 normal-case text-brand-dark dark:text-brand">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {shortAddress(linked.robinhood)}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {evmWallets.length === 0 && (
                <p className="text-sm text-neutral-500">
                  No EVM wallet detected. Install MetaMask or another browser wallet, then reopen this.
                </p>
              )}
              {evmWallets.map((wallet) => (
                <WalletRow
                  key={wallet.uuid}
                  name={wallet.name}
                  icon={wallet.icon}
                  badge="Detected"
                  pending={pending === `evm:${wallet.uuid}`}
                  disabled={pending !== ""}
                  onClick={() => run(`evm:${wallet.uuid}`, () => connectEvmWallet(wallet))}
                />
              ))}
            </div>
          </div>
        )}

        {signing && modal.chain && linked[modal.chain] && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">
            Use the wallet account you linked: {linked[modal.chain]!.slice(0, 6)}…{linked[modal.chain]!.slice(-4)}
          </p>
        )}
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        {!signing && (
          <button
            type="button"
            onClick={closeModal}
            className="w-full mt-5 rounded-xl py-2.5 text-sm font-medium bg-brand text-neutral-950"
          >
            {linked.solana && linked.robinhood ? "Done" : linked.solana || linked.robinhood ? "Done for now" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}
