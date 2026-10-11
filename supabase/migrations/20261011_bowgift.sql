-- BowGift: gift cards funded from the BowPay balance and claimed with a code.
-- Additive and idempotent. Does not touch existing data.

-- 1) Ledger: the only thing that moves balance (written by the functions below, never by clients).
create table if not exists public.ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('gift_create', 'gift_fee', 'gift_claim', 'adjustment')),
  amount_usd numeric(14, 2) not null,
  ref uuid,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists ledger_user_idx on public.ledger (user_id, created_at desc);

alter table public.ledger enable row level security;
revoke all on table public.ledger from anon, authenticated;
grant select on table public.ledger to authenticated;
drop policy if exists "ledger_select_own" on public.ledger;
create policy "ledger_select_own" on public.ledger for select to authenticated using (auth.uid() = user_id);

-- 2) balances view (the dashboard already reads balances.balance_usd): ledger + credited deposits.
create or replace view public.balances with (security_invoker = true) as
select user_id, sum(amount)::numeric(12, 2) as balance_usd
from (
  select user_id, amount_usd as amount from public.ledger
  union all
  select user_id, amount_usd as amount from public.deposits
  where status = 'credited' and amount_usd is not null
) t
group by user_id;
revoke all on table public.balances from anon, authenticated;
grant select on table public.balances to authenticated;

-- 3) Gift cards
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  code_key text generated always as (replace(code, '-', '')) stored,
  creator_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(14, 2) not null check (amount_usd >= 5 and amount_usd <= 10000),
  fee_usd numeric(14, 2) not null default 1 check (fee_usd >= 0),
  theme text not null default 'lime' check (theme in ('lime', 'midnight', 'sunset')),
  message text check (message is null or char_length(message) <= 80),
  status text not null default 'active' check (status in ('active', 'claimed')),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists gift_cards_code_key_idx on public.gift_cards (code_key);
create index if not exists gift_cards_creator_idx on public.gift_cards (creator_id, created_at desc);

alter table public.gift_cards enable row level security;
revoke all on table public.gift_cards from anon, authenticated;
grant select on table public.gift_cards to authenticated;
drop policy if exists "gift_cards_select_parties" on public.gift_cards;
create policy "gift_cards_select_parties" on public.gift_cards for select to authenticated
  using (auth.uid() = creator_id or auth.uid() = claimed_by);

-- 4) Create: charges amount + $1 fee from the caller's balance, atomically.
create or replace function public.create_gift_card(
  p_amount numeric,
  p_message text default null,
  p_theme text default 'lime'
)
returns public.gift_cards
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_fee constant numeric := 1;
  v_balance numeric;
  v_code text;
  v_a text;
  v_b text;
  v_row public.gift_cards;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount < 5 then raise exception 'amount_too_low'; end if;
  if p_amount > 10000 then raise exception 'amount_too_high'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'bad_amount'; end if;
  if p_theme is null or p_theme not in ('lime', 'midnight', 'sunset') then p_theme := 'lime'; end if;

  -- one create per user at a time, so two taps can't spend the same balance twice
  perform pg_advisory_xact_lock(hashtextextended('bowgift:' || v_user::text, 0));

  select coalesce(sum(s.a), 0) into v_balance from (
    select l.amount_usd as a from public.ledger l where l.user_id = v_user
    union all
    select d.amount_usd as a from public.deposits d
    where d.user_id = v_user and d.status = 'credited' and d.amount_usd is not null
  ) s;

  if v_balance < p_amount + v_fee then raise exception 'insufficient_balance'; end if;

  loop
    v_a := replace(gen_random_uuid()::text, '-', '');
    v_b := replace(gen_random_uuid()::text, '-', '');
    v_code := 'BOW-' || upper(substr(v_a, 1, 4)) || '-' || upper(substr(v_a, 5, 4))
              || '-' || upper(substr(v_b, 1, 4)) || '-' || upper(substr(v_b, 5, 4));
    exit when not exists (select 1 from public.gift_cards g where g.code = v_code);
  end loop;

  insert into public.gift_cards (code, creator_id, amount_usd, fee_usd, theme, message)
  values (v_code, v_user, p_amount, v_fee, p_theme, nullif(left(trim(coalesce(p_message, '')), 80), ''))
  returning * into v_row;

  insert into public.ledger (user_id, kind, amount_usd, ref) values
    (v_user, 'gift_create', -p_amount, v_row.id),
    (v_user, 'gift_fee', -v_fee, v_row.id);

  return v_row;
end;
$$;

-- 5) Claim: anyone with the code gets the amount credited to their BowPay balance.
create or replace function public.claim_gift_card(p_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_card public.gift_cards;
  v_from text;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  v_key := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_key) <> 19 then raise exception 'invalid_code'; end if;

  select * into v_card from public.gift_cards g where g.code_key = v_key for update;
  if not found then raise exception 'invalid_code'; end if;
  if v_card.status <> 'active' then raise exception 'already_claimed'; end if;
  if v_card.creator_id = v_user then raise exception 'own_card'; end if;

  update public.gift_cards
  set status = 'claimed', claimed_by = v_user, claimed_at = timezone('utc', now())
  where id = v_card.id;

  insert into public.ledger (user_id, kind, amount_usd, ref) values (v_user, 'gift_claim', v_card.amount_usd, v_card.id);

  select p.username into v_from from public.profiles p where p.id = v_card.creator_id;

  return jsonb_build_object('amount_usd', v_card.amount_usd, 'message', v_card.message, 'from_username', v_from);
end;
$$;

revoke all on function public.create_gift_card(numeric, text, text) from public, anon;
revoke all on function public.claim_gift_card(text) from public, anon;
grant execute on function public.create_gift_card(numeric, text, text) to authenticated;
grant execute on function public.claim_gift_card(text) to authenticated;
