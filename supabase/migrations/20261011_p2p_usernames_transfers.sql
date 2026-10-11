-- BowPay: unique usernames, P2P transfer history, username -> wallet lookup.
-- Additive and idempotent. Does NOT drop or reset any existing table.
-- Assumes the existing tables: profiles, wallet_connections (user_id, chain, address), cards, deposits.


-- 1) Unique usernames (case-insensitive). De-duplicate any existing clashes first.
with d as (
  select id, row_number() over (partition by lower(username) order by created_at, id) as rn
  from public.profiles
)
update public.profiles p
set username = left(p.username, 19) || '_' || left(replace(p.id::text, '-', ''), 4),
    updated_at = timezone('utc', now())
from d
where d.id = p.id and d.rn > 1;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- 2) Signup trigger: sanitise the username (letters, numbers, underscore), keep it unique,
--    and keep creating the virtual card exactly as before.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_name text;
  candidate text;
  new_card_number text;
  card_expiry timestamptz;
begin
  base_name := left(regexp_replace(coalesce(trim(new.raw_user_meta_data ->> 'username'), ''), '[^A-Za-z0-9_]', '', 'g'), 24);
  if char_length(base_name) < 3 then
    base_name := left(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g'), 24);
  end if;
  if char_length(base_name) < 3 then
    base_name := 'user' || left(replace(new.id::text, '-', ''), 8);
  end if;

  candidate := base_name;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate) and id <> new.id) loop
    candidate := left(base_name, 19) || '_' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.profiles (id, username, email)
  values (new.id, candidate, coalesce(new.email, ''))
  on conflict (id) do update set
    email = excluded.email,
    updated_at = timezone('utc', now());

  if not exists (select 1 from public.cards where user_id = new.id) then
    new_card_number := public.generate_card_number();
    card_expiry := timezone('utc', now()) + interval '3 years';

    insert into public.cards (user_id, card_number, last4, expiry_month, expiry_year)
    values (
      new.id,
      new_card_number,
      right(new_card_number, 4),
      extract(month from card_expiry)::smallint,
      extract(year from card_expiry)::smallint
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- 3) Transfer history (written only through record_transfer below).
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  chain text not null check (chain in ('solana', 'robinhood')),
  asset text not null check (asset in ('SOL', 'USDC', 'ETH', 'USDG')),
  amount numeric not null check (amount > 0),
  sender_address text not null,
  recipient_address text not null,
  tx_hash text not null,
  note text check (note is null or char_length(note) <= 140),
  created_at timestamptz not null default timezone('utc', now()),
  unique (chain, tx_hash),
  check (sender_id <> recipient_id),
  check (
    (chain = 'solana' and asset in ('SOL', 'USDC')) or
    (chain = 'robinhood' and asset in ('ETH', 'USDG'))
  )
);

create index if not exists transfers_sender_idx on public.transfers (sender_id, created_at desc);
create index if not exists transfers_recipient_idx on public.transfers (recipient_id, created_at desc);

alter table public.transfers enable row level security;
revoke all on table public.transfers from anon, authenticated;
grant select on table public.transfers to authenticated;

drop policy if exists "transfers_select_parties" on public.transfers;
create policy "transfers_select_parties"
  on public.transfers for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- 4) RPCs
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(ltrim(trim(p_username), '@'))
  );
$$;

create or replace function public.resolve_recipient(p_username text, p_chain text)
returns table (username text, address text, is_self boolean)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
  select p.username, w.address, (p.id = auth.uid())
  from public.profiles p
  left join public.wallet_connections w
    on w.user_id = p.id and w.chain = p_chain
  where lower(p.username) = lower(ltrim(trim(p_username), '@'))
  limit 1;
end;
$$;

create or replace function public.record_transfer(
  p_recipient text,
  p_chain text,
  p_asset text,
  p_amount numeric,
  p_tx_hash text,
  p_from_address text,
  p_to_address text,
  p_note text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_id uuid;
begin
  if v_sender is null then
    raise exception 'not authenticated';
  end if;

  select id into v_recipient
  from public.profiles
  where lower(username) = lower(ltrim(trim(p_recipient), '@'));

  if v_recipient is null then
    raise exception 'recipient not found';
  end if;

  insert into public.transfers
    (sender_id, recipient_id, chain, asset, amount, sender_address, recipient_address, tx_hash, note)
  values
    (v_sender, v_recipient, p_chain, p_asset, p_amount, p_from_address, p_to_address, p_tx_hash,
     nullif(left(trim(coalesce(p_note, '')), 140), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.my_transfers(p_limit int default 20)
returns table (
  id uuid,
  direction text,
  counterparty text,
  chain text,
  asset text,
  amount numeric,
  tx_hash text,
  note text,
  created_at timestamptz
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    t.id,
    case when t.sender_id = auth.uid() then 'sent' else 'received' end,
    p.username,
    t.chain, t.asset, t.amount, t.tx_hash, t.note, t.created_at
  from public.transfers t
  join public.profiles p
    on p.id = case when t.sender_id = auth.uid() then t.recipient_id else t.sender_id end
  where t.sender_id = auth.uid() or t.recipient_id = auth.uid()
  order by t.created_at desc
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public.username_available(text) from public;
revoke all on function public.resolve_recipient(text, text) from public;
revoke all on function public.record_transfer(text, text, text, numeric, text, text, text, text) from public;
revoke all on function public.my_transfers(int) from public;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.resolve_recipient(text, text) to authenticated;
grant execute on function public.record_transfer(text, text, text, numeric, text, text, text, text) to authenticated;
grant execute on function public.my_transfers(int) to authenticated;


revoke execute on function public.resolve_recipient(text, text), public.record_transfer(text, text, text, numeric, text, text, text, text), public.my_transfers(int) from anon;
