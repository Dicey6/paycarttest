-- BowPay funding + payouts. Additive and idempotent.
-- Money rule: the database decides. Credits happen only after the server has verified the chain,
-- debits happen BEFORE any treasury transfer is sent, and every failure path is explicit.

-- 0) Lock down direct table writes. Money tables are written only by SECURITY DEFINER functions
--    or the service role (which bypasses RLS). RLS already blocks these today; this removes the
--    grants too so a future permissive policy can't open them by accident.
revoke insert, update, delete, truncate, references, trigger on table public.deposits from anon, authenticated;
revoke all on table public.deposits from anon;
grant select on table public.deposits to authenticated;

revoke all on table public.chain_watermarks from anon, authenticated;

-- 1) Ledger kinds for payouts.
alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger
  add constraint ledger_kind_check
  check (kind in ('gift_create', 'gift_fee', 'gift_claim', 'adjustment', 'withdrawal', 'withdrawal_fee', 'withdrawal_refund'));

-- 2) Deposit crediting. Service role only. Idempotent on (chain, tx_hash): a replayed hash never credits twice.
create or replace function public.credit_deposit(
  p_user uuid,
  p_chain text,
  p_tx_hash text,
  p_from text,
  p_to text,
  p_amount_native numeric,
  p_amount_usd numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_existing public.deposits;
begin
  if p_amount_usd is null or p_amount_usd <= 0 then raise exception 'bad_amount'; end if;

  insert into public.deposits
    (user_id, chain, tx_hash, from_address, to_address, amount_native, amount_usd, status, credited_at)
  values
    (p_user, p_chain, p_tx_hash, p_from, p_to, p_amount_native, p_amount_usd, 'credited', timezone('utc', now()))
  on conflict (chain, tx_hash) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from public.deposits where chain = p_chain and tx_hash = p_tx_hash;
    -- Same user re-submitting the same hash is fine (returns the original credit); anyone else is refused.
    if v_existing.user_id <> p_user then raise exception 'tx_belongs_to_another_user'; end if;
    return jsonb_build_object('credited', false, 'amount_usd', v_existing.amount_usd, 'deposit_id', v_existing.id);
  end if;

  return jsonb_build_object('credited', true, 'amount_usd', p_amount_usd, 'deposit_id', v_id);
end;
$$;

-- 3) Withdrawals (pay a BowPay balance out of the treasury to the user's own linked wallet).
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain text not null check (chain in ('solana', 'robinhood')),
  asset text not null check (asset in ('USDC', 'USDG')),
  amount_usd numeric(14, 2) not null check (amount_usd >= 1),
  fee_usd numeric(14, 2) not null default 0 check (fee_usd >= 0),
  to_address text not null,
  -- requested: debited, nothing sent yet. sending: broadcast may have happened (never auto-refund).
  -- sent: confirmed on-chain. failed: nothing was sent and the debit was reversed.
  status text not null default 'requested' check (status in ('requested', 'sending', 'sent', 'failed')),
  tx_hash text,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists withdrawals_user_idx on public.withdrawals (user_id, created_at desc);
create unique index if not exists withdrawals_chain_tx_key on public.withdrawals (chain, tx_hash) where tx_hash is not null;

alter table public.withdrawals enable row level security;
revoke all on table public.withdrawals from anon, authenticated;
grant select on table public.withdrawals to authenticated;
drop policy if exists "withdrawals_select_own" on public.withdrawals;
create policy "withdrawals_select_own" on public.withdrawals for select to authenticated using (auth.uid() = user_id);

-- 3a) Step 1: debit + record, atomically, BEFORE anything is sent. Destination comes from the
--     user's linked wallet in the database, never from the client.
create or replace function public.request_withdrawal(p_chain text, p_amount numeric)
returns public.withdrawals
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_fee constant numeric := 0;
  v_balance numeric;
  v_addr text;
  v_asset text;
  v_row public.withdrawals;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_chain not in ('solana', 'robinhood') then raise exception 'bad_chain'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'amount_too_low'; end if;
  if p_amount > 10000 then raise exception 'amount_too_high'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'bad_amount'; end if;

  v_asset := case p_chain when 'solana' then 'USDC' else 'USDG' end;

  select address into v_addr from public.wallet_connections where user_id = v_user and chain = p_chain;
  if v_addr is null then raise exception 'no_wallet_linked'; end if;

  perform pg_advisory_xact_lock(hashtextextended('bowpay-money:' || v_user::text, 0));

  select coalesce(sum(s.a), 0) into v_balance from (
    select l.amount_usd as a from public.ledger l where l.user_id = v_user
    union all
    select d.amount_usd as a from public.deposits d
    where d.user_id = v_user and d.status = 'credited' and d.amount_usd is not null
  ) s;
  if v_balance < p_amount + v_fee then raise exception 'insufficient_balance'; end if;

  insert into public.withdrawals (user_id, chain, asset, amount_usd, fee_usd, to_address)
  values (v_user, p_chain, v_asset, p_amount, v_fee, v_addr)
  returning * into v_row;

  insert into public.ledger (user_id, kind, amount_usd, ref) values (v_user, 'withdrawal', -p_amount, v_row.id);
  if v_fee > 0 then
    insert into public.ledger (user_id, kind, amount_usd, ref) values (v_user, 'withdrawal_fee', -v_fee, v_row.id);
  end if;

  return v_row;
end;
$$;

-- 3b) Step 2 (service role): flip to 'sending' immediately before broadcasting, storing the already-signed
--     tx hash so a human can look it up on-chain if anything goes wrong. Only 'requested' rows can enter.
create or replace function public.mark_withdrawal_sending(p_id uuid, p_tx_hash text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare v_n int;
begin
  update public.withdrawals set status = 'sending', tx_hash = p_tx_hash, updated_at = timezone('utc', now())
  where id = p_id and status = 'requested';
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- 3c) Step 3a (service role): confirmed on-chain.
create or replace function public.complete_withdrawal(p_id uuid, p_tx_hash text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.withdrawals
  set status = 'sent', tx_hash = p_tx_hash, error = null, updated_at = timezone('utc', now())
  where id = p_id and status in ('requested', 'sending');
end;
$$;

-- 3d) Step 3b (service role): refund, but ONLY when nothing could have been sent
--     (still 'requested'). A 'sending' row is never refunded automatically: it needs a human to check the chain.
create or replace function public.fail_withdrawal(p_id uuid, p_error text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare v_w public.withdrawals;
begin
  select * into v_w from public.withdrawals where id = p_id for update;
  if not found or v_w.status <> 'requested' then return false; end if;

  update public.withdrawals
  set status = 'failed', error = left(coalesce(p_error, 'failed'), 300), updated_at = timezone('utc', now())
  where id = p_id;

  insert into public.ledger (user_id, kind, amount_usd, ref)
  values (v_w.user_id, 'withdrawal_refund', v_w.amount_usd + v_w.fee_usd, v_w.id);
  return true;
end;
$$;

-- 4) Permissions. Functions default to PUBLIC execute, so revoke explicitly.
revoke all on function public.credit_deposit(uuid, text, text, text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.request_withdrawal(text, numeric) from public, anon;
revoke all on function public.mark_withdrawal_sending(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_withdrawal(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_withdrawal(uuid, text) from public, anon, authenticated;

grant execute on function public.credit_deposit(uuid, text, text, text, text, numeric, numeric) to service_role;
grant execute on function public.request_withdrawal(text, numeric) to authenticated;
grant execute on function public.mark_withdrawal_sending(uuid, text) to service_role;
grant execute on function public.complete_withdrawal(uuid, text) to service_role;
grant execute on function public.fail_withdrawal(uuid, text) to service_role;

-- 5) BowGift funded straight from the wallet: the confirmed treasury transfer IS the funding.
--    No ledger debit happens at creation. The claimer's ledger is credited at claim (claim_gift_card, unchanged).
alter table public.gift_cards add column if not exists deposit_id uuid references public.deposits(id);
create unique index if not exists gift_cards_deposit_key on public.gift_cards (deposit_id) where deposit_id is not null;

create or replace function public.create_gift_from_deposit(
  p_user uuid,
  p_chain text,
  p_tx_hash text,
  p_from text,
  p_to text,
  p_amount_native numeric,
  p_total_usd numeric,
  p_message text default null,
  p_theme text default 'lime'
)
returns public.gift_cards
language plpgsql
security definer set search_path = public
as $$
declare
  v_fee constant numeric := 1;
  v_gift numeric := p_total_usd - v_fee;
  v_dep_id uuid;
  v_dep public.deposits;
  v_a text;
  v_b text;
  v_code text;
  v_row public.gift_cards;
begin
  if v_gift < 5 or v_gift > 10000 or v_gift <> round(v_gift, 2) then raise exception 'gift_amount_out_of_range'; end if;
  if p_theme is null or p_theme not in ('lime', 'midnight', 'sunset') then p_theme := 'lime'; end if;

  -- 'confirmed' = seen on-chain and applied to a gift. Only 'credited' rows count toward balances.
  insert into public.deposits (user_id, chain, tx_hash, from_address, to_address, amount_native, amount_usd, status)
  values (p_user, p_chain, p_tx_hash, p_from, p_to, p_amount_native, p_total_usd, 'confirmed')
  on conflict (chain, tx_hash) do nothing
  returning id into v_dep_id;

  if v_dep_id is null then
    select * into v_dep from public.deposits where chain = p_chain and tx_hash = p_tx_hash;
    if v_dep.user_id <> p_user then raise exception 'tx_belongs_to_another_user'; end if;
    select * into v_row from public.gift_cards where deposit_id = v_dep.id;
    if not found then raise exception 'tx_already_used'; end if;
    return v_row; -- same user retrying: hand back the gift already made for this transfer
  end if;

  loop
    v_a := replace(gen_random_uuid()::text, '-', '');
    v_b := replace(gen_random_uuid()::text, '-', '');
    v_code := 'BOW-' || upper(substr(v_a, 1, 4)) || '-' || upper(substr(v_a, 5, 4))
              || '-' || upper(substr(v_b, 1, 4)) || '-' || upper(substr(v_b, 5, 4));
    exit when not exists (select 1 from public.gift_cards g where g.code = v_code);
  end loop;

  insert into public.gift_cards (code, creator_id, amount_usd, fee_usd, theme, message, deposit_id)
  values (v_code, p_user, v_gift, v_fee, p_theme, nullif(left(trim(coalesce(p_message, '')), 80), ''), v_dep_id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_gift_from_deposit(uuid, text, text, text, text, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.create_gift_from_deposit(uuid, text, text, text, text, numeric, numeric, text, text) to service_role;
