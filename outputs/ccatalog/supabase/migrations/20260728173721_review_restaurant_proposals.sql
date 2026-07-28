create or replace function public.review_restaurant_proposal(
  p_proposal_id uuid,
  p_decision text
)
returns table (
  proposal_id uuid,
  proposal_status text,
  approved_restaurant_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_proposal public.restaurant_proposals%rowtype;
  v_restaurant_id uuid;
  v_menus text[];
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.admin_users
    where user_id = v_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'admin_required';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;

  select *
  into v_proposal
  from public.restaurant_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'proposal_not_found';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'proposal_already_reviewed';
  end if;

  if p_decision = 'approved' then
    if char_length(v_proposal.area) > 80
      or char_length(v_proposal.memo) > 180
      or jsonb_array_length(v_proposal.menu_items) > 6 then
      raise exception using errcode = 'P0001', message = 'proposal_not_approvable';
    end if;

    if exists (
      select 1
      from public.restaurants
      where lower(trim(name)) = lower(trim(v_proposal.name))
        and abs(lat - v_proposal.lat) < 0.001
        and abs(lng - v_proposal.lng) < 0.001
    ) then
      raise exception using errcode = 'P0001', message = 'restaurant_already_exists';
    end if;

    select coalesce(
      array_agg(trim(menu_item ->> 'name')) filter (
        where nullif(trim(menu_item ->> 'name'), '') is not null
      ),
      '{}'::text[]
    )
    into v_menus
    from jsonb_array_elements(v_proposal.menu_items) as menu_item;

    insert into public.restaurants (
      name,
      category,
      rating,
      area,
      lat,
      lng,
      menus,
      menu_items,
      delivery_apps,
      memo
    )
    values (
      v_proposal.name,
      v_proposal.category,
      v_proposal.suggested_rating,
      v_proposal.area,
      v_proposal.lat,
      v_proposal.lng,
      v_menus,
      v_proposal.menu_items,
      v_proposal.delivery_apps,
      v_proposal.memo
    )
    returning id into v_restaurant_id;
  end if;

  update public.restaurant_proposals
  set
    status = p_decision,
    reviewed_by = v_user_id,
    reviewed_at = now(),
    restaurant_id = v_restaurant_id
  where id = v_proposal.id;

  return query
  select v_proposal.id, p_decision, v_restaurant_id;
end;
$$;

revoke all on function public.review_restaurant_proposal(uuid, text)
from public, anon, authenticated;

grant execute on function public.review_restaurant_proposal(uuid, text)
to authenticated;
