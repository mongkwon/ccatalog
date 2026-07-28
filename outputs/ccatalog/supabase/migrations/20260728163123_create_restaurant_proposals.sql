create table public.restaurant_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null check (char_length(trim(category)) between 1 and 30),
  suggested_rating smallint not null check (suggested_rating between 1 and 3),
  area text not null default '' check (char_length(area) <= 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  menu_items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(menu_items) = 'array' and jsonb_array_length(menu_items) <= 20),
  delivery_apps text[] not null default '{}',
  memo text not null default '' check (char_length(memo) <= 500),
  source text not null default 'naver' check (source = 'naver'),
  source_link text not null default '' check (char_length(source_link) <= 2048),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  ),
  check (status <> 'approved' or restaurant_id is not null)
);

create index restaurant_proposals_proposer_created_idx
on public.restaurant_proposals (proposer_id, created_at desc);

create index restaurant_proposals_status_created_idx
on public.restaurant_proposals (status, created_at);

alter table public.restaurant_proposals enable row level security;

revoke all on table public.restaurant_proposals from anon, authenticated;
grant select on table public.restaurant_proposals to authenticated;

create policy "Members can read own proposals and admins can read all"
on public.restaurant_proposals
for select
to authenticated
using (
  proposer_id = (select auth.uid())
  or exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create trigger set_restaurant_proposals_updated_at
before update on public.restaurant_proposals
for each row
execute function private.set_updated_at();

create or replace function public.submit_restaurant_proposal(
  p_name text,
  p_category text,
  p_suggested_rating smallint,
  p_area text,
  p_lat double precision,
  p_lng double precision,
  p_menu_items jsonb,
  p_delivery_apps text[],
  p_memo text,
  p_source_link text
)
returns table (
  proposal_id uuid,
  proposal_status text,
  proposal_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_proposal public.restaurant_proposals%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and is_catalist = true
  ) then
    raise exception using errcode = 'P0001', message = 'catalist_required';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 80
    or p_category is null or char_length(trim(p_category)) not between 1 and 30
    or p_suggested_rating is null or p_suggested_rating not between 1 and 3
    or p_lat is null or p_lat not between -90 and 90
    or p_lng is null or p_lng not between -180 and 180 then
    raise exception using errcode = 'P0001', message = 'invalid_proposal';
  end if;

  if coalesce(char_length(p_area), 0) > 300
    or coalesce(char_length(p_memo), 0) > 500
    or coalesce(char_length(p_source_link), 0) > 2048
    or jsonb_typeof(coalesce(p_menu_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_menu_items, '[]'::jsonb)) > 20
    or not coalesce(p_delivery_apps, '{}') <@ array['baemin', 'coupangEats', 'yogiyo']::text[] then
    raise exception using errcode = 'P0001', message = 'invalid_proposal';
  end if;

  if exists (
    select 1
    from public.restaurants
    where lower(trim(name)) = lower(trim(p_name))
      and abs(lat - p_lat) < 0.001
      and abs(lng - p_lng) < 0.001
  ) then
    raise exception using errcode = 'P0001', message = 'restaurant_already_exists';
  end if;

  if exists (
    select 1
    from public.restaurant_proposals
    where status = 'pending'
      and lower(trim(name)) = lower(trim(p_name))
      and abs(lat - p_lat) < 0.001
      and abs(lng - p_lng) < 0.001
  ) then
    raise exception using errcode = 'P0001', message = 'proposal_already_pending';
  end if;

  insert into public.restaurant_proposals (
    proposer_id,
    name,
    category,
    suggested_rating,
    area,
    lat,
    lng,
    menu_items,
    delivery_apps,
    memo,
    source_link
  )
  values (
    v_user_id,
    trim(p_name),
    trim(p_category),
    p_suggested_rating,
    coalesce(p_area, ''),
    p_lat,
    p_lng,
    coalesce(p_menu_items, '[]'::jsonb),
    coalesce(p_delivery_apps, '{}'),
    coalesce(p_memo, ''),
    coalesce(p_source_link, '')
  )
  returning * into v_proposal;

  return query
  select v_proposal.id, v_proposal.status, v_proposal.created_at;
end;
$$;

revoke all on function public.submit_restaurant_proposal(
  text,
  text,
  smallint,
  text,
  double precision,
  double precision,
  jsonb,
  text[],
  text,
  text
) from public, anon, authenticated;

grant execute on function public.submit_restaurant_proposal(
  text,
  text,
  smallint,
  text,
  double precision,
  double precision,
  jsonb,
  text[],
  text,
  text
) to authenticated;
