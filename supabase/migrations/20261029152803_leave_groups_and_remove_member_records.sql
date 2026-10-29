-- Membership is the lifetime boundary for a member's records in that group.
alter table public.restaurants add constraint restaurants_group_author_fkey foreign key(group_id,created_by) references public.catalog_group_members(group_id,user_id) on delete cascade;
create index restaurants_group_author_idx on public.restaurants(group_id,created_by);
alter table public.restaurants add constraint restaurants_id_group_key unique(id,group_id);
alter table public.restaurant_comments add column group_id uuid;
alter table public.restaurant_votes add column group_id uuid;
update public.restaurant_comments c set group_id=r.group_id from public.restaurants r where r.id=c.restaurant_id;
update public.restaurant_votes v set group_id=r.group_id from public.restaurants r where r.id=v.restaurant_id;
alter table public.restaurant_comments alter column group_id set not null;
alter table public.restaurant_votes alter column group_id set not null;
alter table public.restaurant_comments drop constraint restaurant_comments_restaurant_id_fkey;
alter table public.restaurant_votes drop constraint restaurant_votes_restaurant_id_fkey;
alter table public.restaurant_comments add constraint comments_restaurant_group_fkey foreign key(restaurant_id,group_id) references public.restaurants(id,group_id) on delete cascade;
alter table public.restaurant_votes add constraint votes_restaurant_group_fkey foreign key(restaurant_id,group_id) references public.restaurants(id,group_id) on delete cascade;
alter table public.restaurant_comments add constraint comments_group_member_fkey foreign key(group_id,user_id) references public.catalog_group_members(group_id,user_id) on delete cascade;
alter table public.restaurant_votes add constraint votes_group_member_fkey foreign key(group_id,user_id) references public.catalog_group_members(group_id,user_id) on delete cascade;
create index comments_group_member_idx on public.restaurant_comments(group_id,user_id);
create index votes_group_member_idx on public.restaurant_votes(group_id,user_id);

create function private.set_restaurant_record_group() returns trigger language plpgsql set search_path='' as $$
begin
  select group_id into new.group_id from public.restaurants where id=new.restaurant_id;
  return new;
end $$;
revoke all on function private.set_restaurant_record_group() from public,anon,authenticated;
create trigger set_comment_group before insert on public.restaurant_comments for each row execute function private.set_restaurant_record_group();
create trigger set_vote_group before insert on public.restaurant_votes for each row execute function private.set_restaurant_record_group();

create function private.leave_catalog_group(p_group_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_catalog_user(); v_deleted boolean:=false;
begin
  if not private.is_catalog_member(p_group_id) then return jsonb_build_object('left',false,'group_deleted',false); end if;
  perform 1 from public.catalog_groups where id=p_group_id for update;
  if not found or not private.is_catalog_member(p_group_id) then return jsonb_build_object('left',false,'group_deleted',false); end if;
  -- Finish active writes to owned restaurants before deleting their membership.
  perform 1 from public.restaurants where group_id=p_group_id and created_by=v_uid order by id for update;
  delete from public.catalog_group_members where group_id=p_group_id and user_id=v_uid;
  -- Foreign keys remove owned restaurants plus this member's comments and votes.
  if not exists(select 1 from public.catalog_group_members where group_id=p_group_id) then
    delete from public.catalog_groups where id=p_group_id;
    v_deleted:=true;
  end if;
  return jsonb_build_object('left',true,'group_deleted',v_deleted);
end $$;
revoke all on function private.leave_catalog_group(uuid) from public,anon;
grant execute on function private.leave_catalog_group(uuid) to authenticated;
create function public.leave_catalog_group(p_group_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.leave_catalog_group(p_group_id); $$;
revoke all on function public.leave_catalog_group(uuid) from public,anon;
grant execute on function public.leave_catalog_group(uuid) to authenticated;

-- Lock group before invitation so joining and the final departure serialize.
create or replace function private.join_catalog_group(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_catalog_user(); v_id uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then raise exception 'invalid_invite'; end if;
  select group_id into v_id from private.catalog_invites where token_hash=sha256(convert_to(p_token,'UTF8'));
  if v_id is null then raise exception 'invalid_invite'; end if;
  perform 1 from public.catalog_groups where id=v_id for key share;
  if not found then raise exception 'invalid_invite'; end if;
  perform 1 from private.catalog_invites where group_id=v_id and token_hash=sha256(convert_to(p_token,'UTF8')) for share;
  if not found then raise exception 'invalid_invite'; end if;
  insert into public.catalog_group_members(group_id,user_id) values(v_id,v_uid) on conflict do nothing;
  return v_id;
end $$;
create or replace function private.create_catalog_invite(p_group_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_catalog_user(); v_token text;
begin
  perform 1 from public.catalog_groups where id=p_group_id and private.is_catalog_member(id) for key share;
  if not found or not private.is_catalog_member(p_group_id) then raise exception 'not_group_member' using errcode='42501'; end if;
  v_token:=encode(extensions.gen_random_bytes(24),'hex');
  insert into private.catalog_invites(token_hash,group_id) values(sha256(convert_to(v_token,'UTF8')),p_group_id)
    on conflict(group_id) do update set token_hash=excluded.token_hash,created_at=now();
  return v_token;
end $$;
