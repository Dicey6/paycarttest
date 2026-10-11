import { defineChain } from "viem";

export type ChainId = "solana" | "robinhood";
export type AssetSymbol = "SOL" | "USDC" | "ETH" | "USDG";

export const RH_RPC_URL = process.env.NEXT_PUBLIC_RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

// Public Solana RPCs only (no keys). lib/solana.ts rotates through these and retries
// when one is rate limited, so a single busy endpoint no longer breaks balances.
export const SOLANA_RPC_URLS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://solana.drpc.org",
];

// Public Blockscout API, used to list every token a wallet holds on Robinhood Chain.
export const RH_EXPLORER_API = "https://robinhoodchain.blockscout.com/api/v2";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDG_RH_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RH_RPC_URL] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export type AssetInfo = { symbol: AssetSymbol; decimals: number; native: boolean };

export const CHAINS: Record<
  ChainId,
  {
    id: ChainId;
    label: string;
    assets: AssetInfo[];
    txUrl: (hash: string) => string;
    addressUrl: (address: string) => string;
  }
> = {
  solana: {
    id: "solana",
    label: "Solana",
    assets: [
      { symbol: "SOL", decimals: 9, native: true },
      { symbol: "USDC", decimals: 6, native: false },
    ],
    txUrl: (hash) => `https://solscan.io/tx/${hash}`,
    addressUrl: (a) => `https://solscan.io/account/${a}`,
  },
  robinhood: {
    id: "robinhood",
    label: "Robinhood Chain",
    assets: [
      { symbol: "ETH", decimals: 18, native: true },
      { symbol: "USDG", decimals: 6, native: false },
    ],
    txUrl: (hash) => `https://robinhoodchain.blockscout.com/tx/${hash}`,
    addressUrl: (a) => `https://robinhoodchain.blockscout.com/address/${a}`,
  },
};

export function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-4)}` : address;
}
