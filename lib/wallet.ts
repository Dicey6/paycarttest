type EvmProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type SolanaProvider = {
  connect: () => Promise<{ publicKey?: { toString: () => string } }>;
};

declare global {
  interface Window {
    ethereum?: EvmProvider;
    solana?: SolanaProvider;
  }
}

export async function connectEvmWallet() {
  if (!window.ethereum) {
    throw new Error("No compatible EVM wallet was detected in this browser.");
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof address !== "string" || !address) {
    throw new Error("The EVM wallet did not return a public address.");
  }

  return address;
}

export async function connectSolanaWallet() {
  if (!window.solana) {
    throw new Error("No compatible Solana wallet was detected in this browser.");
  }

  const response = await window.solana.connect();
  const address = response.publicKey?.toString();
  if (!address) {
    throw new Error("The Solana wallet did not return a public address.");
  }

  return address;
}