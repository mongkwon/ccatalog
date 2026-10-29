-- Preserve legacy records while closing their retired client APIs.
create table public.catalog_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.catalog_group_members (
  group_id uuid not null references public.catalog_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index catalog_group_members_user_idx on public.catalog_group_members(user_id, group_id);
create index catalog_groups_creator_idx on public.catalog_groups(created_by);
create table private.catalog_invites (
  token_hash bytea primary key,
  group_id uuid not null unique references public.catalog_groups(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.catalog_groups enable row level security;
alter table public.catalog_group_members enable row level security;
alter table private.catalog_invites enable row level security;
revoke all on public.catalog_groups, public.catalog_group_members from anon, authenticated;
grant select on public.catalog_groups, public.catalog_group_members to authenticated;
revoke all on private.catalog_invites from public, anon, authenticated;

create function private.is_catalog_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.catalog_group_members m where m.group_id = p_group_id and m.user_id = (select auth.uid()));
$$;
revoke all on function private.is_catalog_member(uuid) from public, anon;
grant execute on function private.is_catalog_member(uuid) to authenticated;
grant usage on schema private to authenticated;
create policy "Members read their groups" on public.catalog_groups for select to authenticated using (private.is_catalog_member(id));
create policy "Members read group memberships" on public.catalog_group_members for select to authenticated using (private.is_catalog_member(group_id));

alter table public.restaurants add column group_id uuid references public.catalog_groups(id) on delete cascade;
alter table public.restaurants add column created_by uuid references auth.users(id) on delete restrict;
do $$
declare v_user uuid; v_group uuid;
begin
  if (select count(*) from public.admin_users) <> 1 then raise exception 'Expected exactly one legacy administrator'; end if;
  select user_id into strict v_user from public.admin_users;
  insert into public.catalog_groups(name,color,created_by) values ('까탈로그','#5285bc',v_user) returning id into v_group;
  insert into public.catalog_group_members(group_id,user_id) values(v_group,v_user);
  update public.restaurants set group_id=v_group,created_by=v_user;
end $$;
alter table public.restaurants alter column group_id set not null;
alter table public.restaurants alter column created_by set not null;
create index restaurants_group_idx on public.restaurants(group_id);
create index restaurants_author_idx on public.restaurants(created_by);
-- User-approved cleanup: identical legacy 백운동 entries, keeping the first.
with duplicates as (
  select id,row_number() over(partition by name,lat,lng,rating,category,area,menu_items,delivery_apps,memo order by created_at,id) position
  from public.restaurants where name='백운동'
)
delete from public.restaurants r using duplicates d
where r.id=d.id and d.position>1 and not exists(select 1 from public.restaurant_photos p where p.restaurant_id=r.id);
-- The same branch can appear once per group, with independent medals across groups.
create unique index restaurants_group_place_idx on public.restaurants(group_id, lower(regexp_replace(name,'\s','','g')), (round(lat::numeric,5)), (round(lng::numeric,5)));

do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('restaurants','restaurant_photos','admin_users','restaurant_visits','restaurant_proposals') loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('Admins can delete restaurant photos from storage','Admins can upload restaurant photos','Admins can inspect restaurant photo objects') loop
    execute format('drop policy %I on storage.objects',p.policyname);
  end loop;
end $$;
revoke all on public.admin_users, public.restaurant_visits, public.restaurant_proposals from anon, authenticated;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('confirm_restaurant_visit','submit_restaurant_proposal','review_restaurant_proposal') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;

revoke all on public.restaurants from anon, authenticated;
grant select,insert,delete on public.restaurants to authenticated;
grant update(name,category,area,lat,lng,menus,menu_items,delivery_apps,memo) on public.restaurants to authenticated;
create policy "Members read group restaurants" on public.restaurants for select to authenticated using (private.is_catalog_member(group_id));
create policy "Members add own restaurants" on public.restaurants for insert to authenticated with check (created_by=(select auth.uid()) and private.is_catalog_member(group_id));
create policy "Authors update own restaurants" on public.restaurants for update to authenticated using (created_by=(select auth.uid()) and private.is_catalog_member(group_id)) with check (created_by=(select auth.uid()) and private.is_catalog_member(group_id));
create policy "Authors delete own restaurants" on public.restaurants for delete to authenticated using (created_by=(select auth.uid()) and private.is_catalog_member(group_id));

create policy "Members read group photos" on public.restaurant_photos for select to authenticated using (exists(select 1 from public.restaurants r where r.id=restaurant_id));
create policy "Authors add own photos" on public.restaurant_photos for insert to authenticated with check (created_by=(select auth.uid()) and exists(select 1 from public.restaurants r where r.id=restaurant_id and r.created_by=(select auth.uid())) and split_part(storage_path,'/',1)=restaurant_id::text);
create policy "Authors update own photos" on public.restaurant_photos for update to authenticated using (exists(select 1 from public.restaurants r where r.id=restaurant_id and r.created_by=(select auth.uid()))) with check (exists(select 1 from public.restaurants r where r.id=restaurant_id and r.created_by=(select auth.uid())));
create policy "Authors delete own photos" on public.restaurant_photos for delete to authenticated using (exists(select 1 from public.restaurants r where r.id=restaurant_id and r.created_by=(select auth.uid())));
revoke all on public.restaurant_photos from anon, authenticated;
grant select,insert,delete on public.restaurant_photos to authenticated;
grant update(alt_text,sort_order) on public.restaurant_photos to authenticated;
create or replace function private.limit_restaurant_photos() returns trigger language plpgsql set search_path='' as $$
begin
  -- Serialize uploads to enforce the eight-photo limit under concurrent requests.
  perform 1 from public.restaurants where id=new.restaurant_id for update;
  if (select count(*) from public.restaurant_photos where restaurant_id=new.restaurant_id) >= 8 then
    raise exception 'restaurant_photo_limit';
  end if;
  return new;
end $$;
update storage.buckets set public=false where id='restaurant-photos';
create policy "Members read group photo objects" on storage.objects for select to authenticated using (bucket_id='restaurant-photos' and exists(select 1 from public.restaurants r where r.id::text=split_part(name,'/',1)));
create policy "Authors upload group photos" on storage.objects for insert to authenticated with check (bucket_id='restaurant-photos' and storage.extension(name)='jpg' and exists(select 1 from public.restaurants r where r.id::text=split_part(name,'/',1) and r.created_by=(select auth.uid())));
create policy "Authors delete group photo objects" on storage.objects for delete to authenticated using (bucket_id='restaurant-photos' and exists(select 1 from public.restaurants r where r.id::text=split_part(name,'/',1) and r.created_by=(select auth.uid())));

create function private.require_catalog_user() returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists(select 1 from auth.users where id=v_uid and not coalesce(is_anonymous,false)) then raise exception 'not_authenticated' using errcode='42501'; end if;
  return v_uid;
end $$;
create function private.create_catalog_group(p_name text,p_color text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_catalog_user(); v_id uuid;
begin
  insert into public.catalog_groups(name,color,created_by) values(trim(p_name),p_color,v_uid) returning id into v_id;
  insert into public.catalog_group_members(group_id,user_id) values(v_id,v_uid);
  return v_id;
end $$;
create function private.create_catalog_invite(p_group_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_catalog_user(); v_token text;
begin
  if not private.is_catalog_member(p_group_id) then raise exception 'not_group_member' using errcode='42501'; end if;
  v_token := encode(extensions.gen_random_bytes(24),'hex');
  -- Reissuing a link revokes the previous link for the whole group.
  insert into private.catalog_invites(token_hash,group_id) values(sha256(convert_to(v_token,'UTF8')),p_group_id)
    on conflict(group_id) do update set token_hash=excluded.token_hash,created_at=now();
  return v_token;
end $$;
create function private.join_catalog_group(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_catalog_user(); v_id uuid;
begin
  if p_token !~ '^[a-f0-9]{48}$' then raise exception 'invalid_invite'; end if;
  select group_id into v_id from private.catalog_invites where token_hash=sha256(convert_to(p_token,'UTF8')) for share;
  if v_id is null then raise exception 'invalid_invite'; end if;
  insert into public.catalog_group_members(group_id,user_id) values(v_id,v_uid) on conflict do nothing;
  return v_id;
end $$;
revoke all on function private.require_catalog_user(), private.create_catalog_group(text,text), private.create_catalog_invite(uuid), private.join_catalog_group(text) from public,anon;
grant execute on function private.create_catalog_group(text,text), private.create_catalog_invite(uuid), private.join_catalog_group(text) to authenticated;
create function public.create_catalog_group(p_name text,p_color text) returns uuid language sql security invoker set search_path='' as $$ select private.create_catalog_group(p_name,p_color); $$;
create function public.create_catalog_invite(p_group_id uuid) returns text language sql security invoker set search_path='' as $$ select private.create_catalog_invite(p_group_id); $$;
create function public.join_catalog_group(p_token text) returns uuid language sql security invoker set search_path='' as $$ select private.join_catalog_group(p_token); $$;
revoke all on function public.create_catalog_group(text,text),public.create_catalog_invite(uuid),public.join_catalog_group(text) from public,anon;
grant execute on function public.create_catalog_group(text,text),public.create_catalog_invite(uuid),public.join_catalog_group(text) to authenticated;
