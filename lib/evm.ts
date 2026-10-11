import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  type Address,
  type EIP1193Provider,
} from "viem";
import { RH_EXPLORER_API, RH_RPC_URL, USDG_RH_ADDRESS, robinhoodChain } from "./chains";
import { toUnits } from "./units";

export type EvmWallet = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: EIP1193Provider;
};

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const rhClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RH_RPC_URL, { retryCount: 1, timeout: 8_000 }),
});

/** EIP-6963 discovery: finds MetaMask, Rabby, Coinbase, Robinhood Wallet, etc. */
export function discoverEvmWallets(timeoutMs = 300): Promise<EvmWallet[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve([]);
    const found = new Map<string, EvmWallet>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.info?.uuid && detail.provider) {
        found.set(detail.info.uuid, {
          uuid: detail.info.uuid,
          name: detail.info.name,
          icon: detail.info.icon,
          rdns: detail.info.rdns,
          provider: detail.provider,
        });
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      let list = Array.from(found.values());
      if (list.length === 0 && window.ethereum) {
        list = [{ uuid: "injected", name: "Browser wallet", icon: "", rdns: "injected", provider: window.ethereum }];
      }
      resolve(list);
    }, timeoutMs);
  });
}

export async function requestEvmAccount(wallet: EvmWallet): Promise<string> {
  const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address || !isAddress(address)) throw new Error("The wallet did not return a valid address.");
  return address;
}

export async function ensureRobinhoodChain(provider: EIP1193Provider) {
  const hexId = `0x${robinhoodChain.id.toString(16)}`;
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (parseInt(current, 16) === robinhoodChain.id) return;

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    // 4902 = chain not added to the wallet yet
    if (code === 4902 || code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: "Robinhood Chain",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [RH_RPC_URL],
            blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

let usdgDecimals: number | undefined;
export async function getUsdgDecimals(): Promise<number> {
  if (usdgDecimals !== undefined) return usdgDecimals;
  try {
    usdgDecimals = Number(
      await rhClient.readContract({ address: USDG_RH_ADDRESS, abi: erc20Abi, functionName: "decimals" })
    );
  } catch {
    usdgDecimals = 6;
  }
  return usdgDecimals;
}

export type TokenBalance = {
  address: string;
  symbol: string;
  name: string;
  balance: number;
  usd?: number;
};

async function explorerGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${RH_EXPLORER_API}${path}`, { cache: "no-store" });
  if (res.status === 404) return null; // address has no activity yet
  if (!res.ok) throw new Error(`explorer ${res.status}`);
  return (await res.json()) as T;
}

type ExplorerToken = {
  value?: string;
  token?: {
    address_hash?: string;
    address?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | number | null;
    type?: string;
    exchange_rate?: string | number | null;
  };
};

/** Public Blockscout API: native ETH + every ERC-20 the wallet holds. Used alongside the RPC and as its backup. */
async function fetchViaExplorer(address: string): Promise<{ native: number; tokens: TokenBalance[] }> {
  const [info, rows] = await Promise.all([
    explorerGet<{ coin_balance?: string | null }>(`/addresses/${address}`),
    explorerGet<ExplorerToken[]>(`/addresses/${address}/token-balances`),
  ]);

  const native = info?.coin_balance ? Number(formatUnits(BigInt(info.coin_balance), 18)) : 0;
  const tokens: TokenBalance[] = [];
  for (const row of rows ?? []) {
    const t = row.token;
    const tokenAddress = t?.address_hash ?? t?.address;
    if (!t || !tokenAddress || !row.value) continue;
    if (t.type && t.type !== "ERC-20") continue;
    const decimals = Number(t.decimals ?? 18);
    const balance = Number(formatUnits(BigInt(row.value), Number.isFinite(decimals) ? decimals : 18));
    if (!(balance > 0)) continue;
    const rate = t.exchange_rate != null ? Number(t.exchange_rate) : undefined;
    tokens.push({
      address: tokenAddress,
      symbol: t.symbol || "TOKEN",
      name: t.name || t.symbol || "Unknown token",
      balance,
      usd: rate && Number.isFinite(rate) ? balance * rate : undefined,
    });
  }
  tokens.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0) || b.balance - a.balance);
  return { native, tokens: tokens.slice(0, 25) };
}

async function fetchViaRpc(address: string) {
  const owner = address as Address;
  const [native, usdgRaw, decimals] = await Promise.all([
    rhClient.getBalance({ address: owner }),
    rhClient.readContract({ address: USDG_RH_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    getUsdgDecimals(),
  ]);
  return { native: Number(formatUnits(native, 18)), stable: Number(formatUnits(usdgRaw, decimals)) };
}

/**
 * Reads the RPC and the explorer in parallel and merges them, so either one being
 * rate limited or down no longer blanks the balance.
 */
export async function fetchRobinhoodBalances(address: string) {
  const [rpc, explorer] = await Promise.allSettled([fetchViaRpc(address), fetchViaExplorer(address)]);
  if (rpc.status === "rejected" && explorer.status === "rejected") {
    throw new Error("Robinhood Chain RPC and explorer are both unreachable");
  }

  const all = explorer.status === "fulfilled" ? explorer.value.tokens : [];
  const usdg = all.find((t) => t.address.toLowerCase() === USDG_RH_ADDRESS.toLowerCase());

  // The public RPC can answer with an empty/stale 0 while the explorer has the real number (and vice versa),
  // so take the larger of the two instead of trusting whichever source happened to answer first.
  const nativeRpc = rpc.status === "fulfilled" ? rpc.value.native : 0;
  const nativeExp = explorer.status === "fulfilled" ? explorer.value.native : 0;
  const stableRpc = rpc.status === "fulfilled" ? rpc.value.stable : 0;
  const native = Math.max(nativeRpc, nativeExp);
  const stable = Math.max(stableRpc, usdg?.balance ?? 0);
  const tokens = all.filter((t) => t.address.toLowerCase() !== USDG_RH_ADDRESS.toLowerCase());
  return { native, stable, tokens };
}

export async function sendEvm(args: {
  wallet: EvmWallet;
  from: string;
  to: string;
  asset: "ETH" | "USDG";
  amount: string;
}): Promise<string> {
  const { wallet, from, to, asset, amount } = args;
  if (!isAddress(to)) throw new Error("Recipient wallet address is invalid.");

  await ensureRobinhoodChain(wallet.provider);
  const client = createWalletClient({
    account: from as Address,
    chain: robinhoodChain,
    transport: custom(wallet.provider),
  });

  let hash: `0x${string}`;
  if (asset === "ETH") {
    hash = await client.sendTransaction({ to: to as Address, value: toUnits(amount, 18) });
  } else {
    const decimals = await getUsdgDecimals();
    hash = await client.writeContract({
      address: USDG_RH_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as Address, toUnits(amount, decimals)],
    });
  }

  const receipt = await rhClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
  return hash;
}
