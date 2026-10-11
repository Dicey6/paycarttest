"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WalletProvider as RawSolanaWalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import type { Adapter } from "@solana/wallet-adapter-base";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { shortAddress, type ChainId } from "@/lib/chains";
import { fetchSolanaBalances } from "@/lib/solana";
import { fetchRobinhoodBalances, requestEvmAccount, type EvmWallet, type TokenBalance } from "@/lib/evm";
import { useAuth } from "@/components/providers";
import { WalletModal } from "@/components/WalletModal";

// The wallet-adapter component types clash with some @types/react versions at build time,
// so we give it an explicit props type. Runtime behaviour is unchanged.
const SolanaWalletProvider = RawSolanaWalletProvider as unknown as React.ComponentType<{
  wallets: Adapter[];
  autoConnect?: boolean;
  children?: React.ReactNode;
}>;

export type ChainBalance = { native: number; stable: number; tokens?: TokenBalance[] };
export type Prices = { SOL?: number; ETH?: number };
export type ModalState = { chain?: ChainId; mode: "link" | "sign" } | null;

export class NeedsConnectError extends Error {
  chain: ChainId;
  constructor(chain: ChainId) {
    super(`Connect your ${chain === "solana" ? "Solana" : "Robinhood Chain"} wallet to sign this transfer.`);
    this.chain = chain;
  }
}

type WalletsContextValue = {
  linked: Partial<Record<ChainId, string>>;
  balances: Partial<Record<ChainId, ChainBalance>>;
  prices: Prices;
  totalUsd: number;
  pricesMissing: boolean;
  loading: boolean;
  balanceError: string;
  refresh: () => Promise<void>;
  modal: ModalState;
  openConnect: (chain?: ChainId, mode?: "link" | "sign") => void;
  closeModal: () => void;
  connectSolanaWallet: (adapter: Adapter) => Promise<void>;
  connectEvmWallet: (wallet: EvmWallet) => Promise<void>;
  disconnect: (chain: ChainId) => Promise<void>;
  getSolanaSigner: () => { adapter: Adapter; address: string };
  getEvmSigner: () => Promise<{ wallet: EvmWallet; address: string }>;
};

const WalletsContext = createContext<WalletsContextValue | null>(null);

export function useWallets() {
  const ctx = useContext(WalletsContext);
  if (!ctx) throw new Error("useWallets must be used inside WalletsProvider");
  return ctx;
}

async function fetchPrices(): Promise<Prices> {
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd");
  if (!res.ok) throw new Error("price lookup failed");
  const json = await res.json();
  return { SOL: json?.solana?.usd, ETH: json?.ethereum?.usd };
}

function WalletsInner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [linked, setLinked] = useState<Partial<Record<ChainId, string>>>({});
  const [balances, setBalances] = useState<Partial<Record<ChainId, ChainBalance>>>({});
  const [prices, setPrices] = useState<Prices>({});
  const [loading, setLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [modal, setModal] = useState<ModalState>(null);

  const solAdapter = useRef<Adapter | null>(null);
  const evmWallet = useRef<EvmWallet | null>(null);

  /* Persisted links: loaded from Supabase so balances show on every visit. */
  useEffect(() => {
    if (!userId) {
      setLinked({});
      setBalances({});
      solAdapter.current = null;
      evmWallet.current = null;
      return;
    }
    let cancelled = false;
    getSupabaseBrowserClient()
      .from("wallet_connections")
      .select("chain, address")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setBalanceError(error.message);
          return;
        }
        const next: Partial<Record<ChainId, string>> = {};
        for (const row of data ?? []) {
          if (row.chain === "solana" || row.chain === "robinhood") next[row.chain as ChainId] = row.address;
        }
        setLinked(next);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!linked.solana && !linked.robinhood) {
      setBalances({});
      return;
    }
    setLoading(true);
    setBalanceError("");

    // 1) Ask our own server route first (no browser CORS limits, shared short cache).
    // 2) If it fails, read straight from the browser as a backup.
    type Part = ChainBalance | { error: string } | undefined;
    let api: { solana?: Part; robinhood?: Part; prices?: Prices } | undefined;
    try {
      const params = new URLSearchParams();
      if (linked.solana) params.set("sol", linked.solana);
      if (linked.robinhood) params.set("rh", linked.robinhood);
      const res = await fetch(`/api/balances?${params.toString()}`, { cache: "no-store" });
      if (res.ok) api = await res.json();
    } catch {
      /* use the direct path below */
    }
    const ok = (v: Part): ChainBalance | undefined => (v && !("error" in v) ? v : undefined);
    const solApi = ok(api?.solana);
    const rhApi = ok(api?.robinhood);
    const pxApi = api?.prices && (api.prices.SOL !== undefined || api.prices.ETH !== undefined) ? api.prices : undefined;

    const [sol, rh, px] = await Promise.allSettled([
      linked.solana ? (solApi ? Promise.resolve(solApi) : fetchSolanaBalances(linked.solana)) : Promise.resolve(undefined),
      linked.robinhood ? (rhApi ? Promise.resolve(rhApi) : fetchRobinhoodBalances(linked.robinhood)) : Promise.resolve(undefined),
      pxApi ? Promise.resolve(pxApi) : fetchPrices(),
    ]);

    const why = (r: PromiseRejectedResult) =>
      (r.reason instanceof Error ? r.reason.message : "unknown error").slice(0, 90);

    const next: Partial<Record<ChainId, ChainBalance>> = {};
    const errors: string[] = [];
    if (linked.solana) {
      if (sol.status === "fulfilled" && sol.value) next.solana = sol.value;
      else errors.push(`Solana balance unavailable${sol.status === "rejected" ? ` (${why(sol)})` : ""}. Tap refresh to retry.`);
    }
    if (linked.robinhood) {
      if (rh.status === "fulfilled" && rh.value) next.robinhood = rh.value;
      else errors.push(`Robinhood Chain balance unavailable${rh.status === "rejected" ? ` (${why(rh)})` : ""}. Tap refresh to retry.`);
    }
    setBalances((prev) => ({ ...prev, ...next }));
    if (px.status === "fulfilled") setPrices(px.value);
    setBalanceError(errors.join(" "));
    setLoading(false);
  }, [linked.solana, linked.robinhood]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const { totalUsd, pricesMissing } = useMemo(() => {
    let total = 0;
    let missing = false;
    if (balances.solana) {
      total += balances.solana.stable;
      if (prices.SOL !== undefined) total += balances.solana.native * prices.SOL;
      else if (balances.solana.native > 0) missing = true;
    }
    if (balances.robinhood) {
      total += balances.robinhood.stable;
      for (const t of balances.robinhood.tokens ?? []) total += t.usd ?? 0;
      if (prices.ETH !== undefined) total += balances.robinhood.native * prices.ETH;
      else if (balances.robinhood.native > 0) missing = true;
    }
    return { totalUsd: total, pricesMissing: missing };
  }, [balances, prices]);

  const saveLink = useCallback(
    async (chain: ChainId, address: string) => {
      if (!userId) throw new Error("Log in first.");
      const { error } = await getSupabaseBrowserClient()
        .from("wallet_connections")
        .upsert(
          { user_id: userId, chain, address, connected_at: new Date().toISOString() },
          { onConflict: "user_id,chain" }
        );
      if (error) throw error;
      setLinked((prev) => ({ ...prev, [chain]: address }));
    },
    [userId]
  );

  const connectSolanaWallet = useCallback(
    async (adapter: Adapter) => {
      await adapter.connect();
      const address = adapter.publicKey?.toBase58();
      if (!address) throw new Error("The wallet did not return a public address.");

      if (modal?.mode === "sign" && linked.solana && linked.solana !== address) {
        throw new Error(`Switch your wallet to the linked account (${shortAddress(linked.solana)}) and try again.`);
      }
      if (!(modal?.mode === "sign" && linked.solana)) await saveLink("solana", address);
      solAdapter.current = adapter;
      // Link mode stays open so the other chain's wallet can be connected too.
      if (modal?.mode === "sign") setModal(null);
    },
    [linked.solana, modal?.mode, saveLink]
  );

  const connectEvmWallet = useCallback(
    async (wallet: EvmWallet) => {
      const address = await requestEvmAccount(wallet);

      if (modal?.mode === "sign" && linked.robinhood && linked.robinhood.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Switch your wallet to the linked account (${shortAddress(linked.robinhood)}) and try again.`);
      }
      if (!(modal?.mode === "sign" && linked.robinhood)) await saveLink("robinhood", address);
      evmWallet.current = wallet;
      if (modal?.mode === "sign") setModal(null);
    },
    [linked.robinhood, modal?.mode, saveLink]
  );

  const disconnect = useCallback(
    async (chain: ChainId) => {
      if (!userId) return;
      const { error } = await getSupabaseBrowserClient()
        .from("wallet_connections")
        .delete()
        .eq("user_id", userId)
        .eq("chain", chain);
      if (error) throw error;
      if (chain === "solana") {
        void solAdapter.current?.disconnect().catch(() => undefined);
        solAdapter.current = null;
      } else {
        evmWallet.current = null;
      }
      setLinked((prev) => {
        const next = { ...prev };
        delete next[chain];
        return next;
      });
      setBalances((prev) => {
        const next = { ...prev };
        delete next[chain];
        return next;
      });
    },
    [userId]
  );

  const getSolanaSigner = useCallback(() => {
    const adapter = solAdapter.current;
    const address = adapter?.publicKey?.toBase58();
    if (!adapter || !adapter.connected || !address || address !== linked.solana) {
      throw new NeedsConnectError("solana");
    }
    return { adapter, address };
  }, [linked.solana]);

  const getEvmSigner = useCallback(async () => {
    const wallet = evmWallet.current;
    if (!wallet || !linked.robinhood) throw new NeedsConnectError("robinhood");
    const accounts = (await wallet.provider.request({ method: "eth_accounts" })) as string[];
    if (!accounts.some((a) => a.toLowerCase() === linked.robinhood!.toLowerCase())) {
      throw new NeedsConnectError("robinhood");
    }
    return { wallet, address: linked.robinhood };
  }, [linked.robinhood]);

  const value: WalletsContextValue = {
    linked,
    balances,
    prices,
    totalUsd,
    pricesMissing,
    loading,
    balanceError,
    refresh,
    modal,
    openConnect: (chain, mode = "link") => setModal({ chain, mode }),
    closeModal: () => setModal(null),
    connectSolanaWallet,
    connectEvmWallet,
    disconnect,
    getSolanaSigner,
    getEvmSigner,
  };

  return (
    <WalletsContext.Provider value={value}>
      {children}
      <WalletModal />
    </WalletsContext.Provider>
  );
}

export function WalletsProvider({ children }: { children: React.ReactNode }) {
  // Phantom + Solflare are listed explicitly; every Wallet Standard wallet
  // (Jupiter, Backpack, etc.) is detected automatically by the provider.
  const adapters = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <SolanaWalletProvider wallets={adapters} autoConnect={false}>
      <WalletsInner>{children}</WalletsInner>
    </SolanaWalletProvider>
  );
}
