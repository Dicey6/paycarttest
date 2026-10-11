# BowPay

Stablecoin-funded virtual card app: Next.js 14 (App Router), TypeScript, Tailwind, Supabase Auth.

## Features
- Email signup/login (unique `@username`), logout on the dashboard and in the nav
- **Wallets**: Solana (Phantom, Solflare, Jupiter and any Wallet Standard wallet) and Robinhood Chain (MetaMask and any EIP-6963 wallet)
- First connection is **view-only**: only the public address is saved (table `wallet_connections`), so balances persist across sessions. Per-chain SOL/USDC and ETH/USDG balances plus a USD total
- **P2P sends by username**: SOL, USDC (Solana) and ETH, USDG (Robinhood Chain), with an optional note (140 chars). Funds go wallet-to-wallet; the recipient gets them in the wallet they linked for that network

- **BowGift cards** (`/gifts`): spend BowPay balance on a gift card (min $5 + $1 fee), download it as an image, and anyone with the code claims it into their BowPay balance. All money movement happens in Postgres functions (`create_gift_card`, `claim_gift_card`) over a `ledger` table

- **Fund the card** (dashboard / BowGift page): pick Solana (USDC) or Robinhood Chain (USDG), approve the transfer to the BowPay treasury, sign a message with the paying wallet, and the server verifies the chain before the database credits the balance (`/api/deposits/verify`, `credit_deposit`, unique per chain + tx hash)
- **Cash out**: debit first (`request_withdrawal`), sign the payout, mark `sending` with the tx hash, broadcast, then `sent`. Only a payout that never reached `sending` is refunded automatically; a `sending` row needs a human to check the chain (`/api/withdrawals`)

## Run
```bash
pnpm install        # or npm install
cp .env.local.example .env.local   # fill in Supabase + RPC values
pnpm dev
```

Apply, in order, `20261011_p2p_usernames_transfers.sql`, `20261011_bowgift.sql`, `20261012_funding_withdrawals.sql`.

Database: the live Supabase project already holds the base tables. Apply
`supabase/migrations/20261011_p2p_usernames_transfers.sql` to any new project
(it is additive, no drops). Add your site's `/auth/callback` URL in Supabase Auth settings.

## Networks
- Robinhood Chain mainnet: chain id 4663, USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`
- Solana mainnet USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Solana uses public RPCs only; `lib/solana.ts` rotates across several and retries when one is rate limited (no env var needed)
- Robinhood Chain: ETH and USDG come from the RPC; all other tokens come from the public Blockscout API

## Treasury (server env only)
Set `SUPABASE_SERVICE_ROLE_KEY`, `BOWPAY_SOLANA_PRIVATE_KEY`, `BOWPAY_RH_PRIVATE_KEY` (see `.env.local.example`). `GET /api/treasury` returns the deposit addresses derived from those keys; with header `x-admin-token: $BOWPAY_ADMIN_TOKEN` it also returns the treasury's live balances.

## Known gaps before real money
- Transfers are recorded from the client after the on-chain tx confirms; there is no server-side verification of the tx hash yet (add an Edge Function that checks the chain before inserting). This applies to peer-to-peer sends only; funding, gifts and cash-outs are verified server-side.
- Withdrawals stuck in `sending` need a reconcile job or a manual check; nothing sweeps them yet.
- Linking a wallet is not signature-verified (deposits are, via the ownership signature).
- Mobile-app wallets need WalletConnect (needs a project id); only browser/extension wallets work today
