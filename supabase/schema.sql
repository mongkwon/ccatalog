create extension if not exists pgcrypto;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null default '기타' check (char_length(trim(category)) between 1 and 30),
  rating smallint not null default 1 check (rating between 1 and 3),
  area text not null default '' check (char_length(area) <= 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  menus text[] not null default '{}'::text[],
  delivery_apps text[] not null default '{}'::text[],
  memo text not null default '' check (char_length(memo) <= 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurants_menus_limit check (coalesce(array_length(menus, 1), 0) <= 6),
  constraint restaurants_delivery_apps_allowed check (
    delivery_apps <@ array['baemin', 'coupangEats', 'yogiyo']::text[]
  )
);

create index if not exists restaurants_rating_name_idx on public.restaurants (rating desc, name asc);
create index if not exists restaurants_owner_id_idx on public.restaurants (owner_id);

create or replace function public.set_restaurants_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_restaurants_updated_at() from public, anon, authenticated;

drop trigger if exists set_restaurants_updated_at on public.restaurants;
create trigger set_restaurants_updated_at
before update on public.restaurants
for each row
execute function public.set_restaurants_updated_at();

alter table public.restaurants enable row level security;

drop policy if exists "Public read restaurants" on public.restaurants;
create policy "Public read restaurants"
on public.restaurants
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can create own restaurants" on public.restaurants;
create policy "Authenticated users can create own restaurants"
on public.restaurants
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update own restaurants" on public.restaurants;
drop policy if exists "Authenticated users can update restaurants" on public.restaurants;
create policy "Authenticated users can update restaurants"
on public.restaurants
for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "Owners can delete own restaurants" on public.restaurants;
drop policy if exists "Authenticated users can delete restaurants" on public.restaurants;
create policy "Authenticated users can delete restaurants"
on public.restaurants
for delete
to authenticated
using ((select auth.uid()) is not null);

grant usage on schema public to anon, authenticated;
grant select on public.restaurants to anon, authenticated;
grant insert, update, delete on public.restaurants to authenticated;
