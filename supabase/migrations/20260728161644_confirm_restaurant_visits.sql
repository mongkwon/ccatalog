create table public.restaurant_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rating_at_visit smallint not null check (rating_at_visit between 1 and 3),
  distance_m integer not null check (distance_m between 0 and 200),
  accuracy_m integer not null check (accuracy_m between 0 and 200),
  agreed_at timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

create index restaurant_visits_restaurant_id_idx
on public.restaurant_visits (restaurant_id);

alter table public.restaurant_visits enable row level security;

revoke all on table public.restaurant_visits from anon, authenticated;
grant select on table public.restaurant_visits to authenticated;

create policy "Members can read own visits"
on public.restaurant_visits
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.confirm_restaurant_visit(
  p_restaurant_id uuid,
  p_rating smallint,
  p_agrees boolean,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
returns table (
  visit_count integer,
  is_catalist boolean,
  distance_m integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_restaurant_rating smallint;
  v_restaurant_lat double precision;
  v_restaurant_lng double precision;
  v_distance double precision;
  v_visit_count integer;
  v_is_catalist boolean;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  if p_agrees is not true then
    raise exception using errcode = 'P0001', message = 'agreement_required';
  end if;

  if p_lat is null or p_lat < -90 or p_lat > 90
    or p_lng is null or p_lng < -180 or p_lng > 180 then
    raise exception using errcode = 'P0001', message = 'invalid_location';
  end if;

  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 200 then
    raise exception using errcode = 'P0001', message = 'location_inaccurate';
  end if;

  select rating, lat, lng
  into v_restaurant_rating, v_restaurant_lat, v_restaurant_lng
  from public.restaurants
  where id = p_restaurant_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'restaurant_not_found';
  end if;

  if p_rating is distinct from v_restaurant_rating then
    raise exception using errcode = 'P0001', message = 'rating_changed';
  end if;

  v_distance := 6371000 * 2 * asin(
    sqrt(
      least(
        1.0,
        power(sin(radians(p_lat - v_restaurant_lat) / 2), 2)
        + cos(radians(v_restaurant_lat))
          * cos(radians(p_lat))
          * power(sin(radians(p_lng - v_restaurant_lng) / 2), 2)
      )
    )
  );

  if v_distance > 200 then
    raise exception using errcode = 'P0001', message = 'too_far';
  end if;

  begin
    insert into public.restaurant_visits (
      user_id,
      restaurant_id,
      rating_at_visit,
      distance_m,
      accuracy_m
    )
    values (
      v_user_id,
      p_restaurant_id,
      v_restaurant_rating,
      round(v_distance)::integer,
      round(p_accuracy)::integer
    );
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'already_confirmed';
  end;

  select count(*)::integer
  into v_visit_count
  from public.restaurant_visits
  where user_id = v_user_id;

  if v_visit_count >= 3 then
    update public.profiles
    set
      is_catalist = true,
      catalist_qualified_at = coalesce(catalist_qualified_at, now())
    where id = v_user_id
      and is_catalist = false;
  end if;

  select profiles.is_catalist
  into v_is_catalist
  from public.profiles as profiles
  where profiles.id = v_user_id;

  return query
  select v_visit_count, coalesce(v_is_catalist, false), round(v_distance)::integer;
end;
$$;

revoke all on function public.confirm_restaurant_visit(
  uuid,
  smallint,
  boolean,
  double precision,
  double precision,
  double precision
) from public, anon, authenticated;

grant execute on function public.confirm_restaurant_visit(
  uuid,
  smallint,
  boolean,
  double precision,
  double precision,
  double precision
) to authenticated;

