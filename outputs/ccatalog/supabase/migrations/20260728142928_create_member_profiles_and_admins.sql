create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '까탈로그 회원'
    check (char_length(trim(nickname)) between 1 and 30),
  avatar_url text
    check (avatar_url is null or char_length(avatar_url) <= 2048),
  is_catalist boolean not null default false,
  catalist_qualified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_catalist = false and catalist_qualified_at is null)
    or
    (is_catalist = true and catalist_qualified_at is not null)
  )
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (nickname, avatar_url) on table public.profiles to authenticated;

create policy "Members can read own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Members can update own editable profile fields"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

create policy "Admins can read own membership"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function private.set_updated_at();

create or replace function private.create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_nickname text;
  profile_avatar_url text;
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  profile_nickname := left(
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      '까탈로그 회원'
    ),
    30
  );

  profile_avatar_url := nullif(
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    ''
  );

  insert into public.profiles (id, nickname, avatar_url)
  values (new.id, profile_nickname, profile_avatar_url)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.create_member_profile() from public, anon, authenticated;

create trigger create_member_profile_after_signup
after insert on auth.users
for each row
when (coalesce(new.is_anonymous, false) = false)
execute function private.create_member_profile();

insert into public.profiles (id, nickname, avatar_url)
select
  users.id,
  left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'nickname'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
      '까탈로그 회원'
    ),
    30
  ),
  nullif(
    coalesce(
      users.raw_user_meta_data ->> 'avatar_url',
      users.raw_user_meta_data ->> 'picture'
    ),
    ''
  )
from auth.users as users
where coalesce(users.is_anonymous, false) = false
on conflict (id) do nothing;
