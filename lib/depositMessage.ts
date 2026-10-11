import type { ChainId } from "./chains";

export type SignPurpose = "deposit" | "gift";

/** The exact text a wallet signs to prove it owns the address that paid the treasury. Built identically on client and server. */
export function depositMessage(userId: string, chain: ChainId, txHash: string, purpose: SignPurpose = "deposit") {
  return `BowPay ${purpose}\nUser: ${userId}\nChain: ${chain}\nTx: ${txHash}`;
}
