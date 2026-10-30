alter table public.catalog_groups add column updated_at timestamptz not null default now();
create trigger set_catalog_groups_updated_at before update on public.catalog_groups for each row execute function private.set_updated_at();
grant update(name) on public.catalog_groups to authenticated;
create policy "Members rename their groups" on public.catalog_groups for update to authenticated
using (private.is_catalog_member(id)) with check (private.is_catalog_member(id));

-- Subscribers receive invalidations only; fresh data is always checked against current membership.
create policy "Members receive catalog name invalidations" on realtime.messages for select to authenticated
using (
  extension='broadcast' and topic=(select realtime.topic()) and
  case
    when (select realtime.topic()) = 'catalog-user:'||(select auth.uid())::text then true
    when (select realtime.topic()) ~ '^catalog-group:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      then private.is_catalog_member(substring((select realtime.topic()) from 15)::uuid)
    else false
  end
);

create function private.broadcast_catalog_name_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_group uuid;
begin
  if tg_table_name='profiles' then
    perform realtime.send('{}'::jsonb,'catalog_names','catalog-user:'||new.id::text,true);
    for v_group in select group_id from public.catalog_group_members where user_id=new.id loop
      perform realtime.send('{}'::jsonb,'catalog_names','catalog-group:'||v_group::text,true);
    end loop;
  else
    perform realtime.send('{}'::jsonb,'catalog_names','catalog-group:'||new.id::text,true);
  end if;
  return new;
end $$;
revoke all on function private.broadcast_catalog_name_change() from public,anon,authenticated;
create trigger broadcast_profile_nickname after update of nickname on public.profiles for each row when(old.nickname is distinct from new.nickname) execute function private.broadcast_catalog_name_change();
create trigger broadcast_catalog_group_name after update of name on public.catalog_groups for each row when(old.name is distinct from new.name) execute function private.broadcast_catalog_name_change();

create function private.catalog_name_context(p_group_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_catalog_user(); v_profile jsonb; v_group jsonb; v_members jsonb;
begin
  select jsonb_build_object('id',id,'nickname',nickname,'avatar_url',avatar_url,'updated_at',updated_at) into v_profile from public.profiles where id=v_uid;
  if p_group_id is null then return jsonb_build_object('profile',v_profile); end if;
  -- Lock the membership while reading so a concurrent departure cannot bypass this check.
  perform 1 from public.catalog_group_members where group_id=p_group_id and user_id=v_uid for key share;
  if not found then raise exception 'not_group_member' using errcode='42501'; end if;
  select jsonb_build_object('id',id,'name',name,'color',color,'created_at',created_at,'updated_at',updated_at) into v_group from public.catalog_groups where id=p_group_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'updated_at',p.updated_at)),'[]'::jsonb) into v_members
    from public.catalog_group_members m join public.profiles p on p.id=m.user_id where m.group_id=p_group_id;
  return jsonb_build_object('profile',v_profile,'group',v_group,'members',v_members);
end $$;
revoke all on function private.catalog_name_context(uuid) from public,anon;
grant execute on function private.catalog_name_context(uuid) to authenticated;
create function public.catalog_name_context(p_group_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.catalog_name_context(p_group_id); $$;
revoke all on function public.catalog_name_context(uuid) from public,anon;
grant execute on function public.catalog_name_context(uuid) to authenticated;
