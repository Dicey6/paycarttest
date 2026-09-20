-- BowPay profile reset.
-- This removes only the BowPay profile table and its trigger/function.
-- It does not delete users, sessions, or credentials from auth.users.

begin;

-- Remove the old trigger before replacing the function it calls.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- WARNING: this deletes existing rows from public.profiles.
drop table if exists public.profiles cascade;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 1 and 24),
  email text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

grant select, insert, update on table public.profiles to authenticated;
revoke all on table public.profiles from anon;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := left(
    trim(new.raw_user_meta_data ->> 'username'),
    24
  );

  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(
      nullif(requested_username, ''),
      nullif(left(split_part(coalesce(new.email, ''), '@', 1), 24), ''),
      'user-' || left(replace(new.id::text, '-', ''), 8)
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Recreate profiles for users that already existed before this reset.
insert into public.profiles (id, username, email)
select
  id,
  coalesce(
    nullif(left(trim(raw_user_meta_data ->> 'username'), 24), ''),
    nullif(left(split_part(coalesce(email, ''), '@', 1), 24), ''),
    'user-' || left(replace(id::text, '-', ''), 8)
  ),
  coalesce(email, '')
from auth.users
on conflict (id) do update set
  email = excluded.email,
  updated_at = timezone('utc', now());

commit;