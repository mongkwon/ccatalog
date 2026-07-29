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
  ) and not exists (
    select 1
    from public.admin_users
    where user_id = v_user_id
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

