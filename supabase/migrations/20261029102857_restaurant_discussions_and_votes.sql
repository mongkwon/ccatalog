alter table public.restaurants add column vote_round integer not null default 1 check(vote_round>0);
create table public.restaurant_comments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index restaurant_comments_page_idx on public.restaurant_comments(restaurant_id,created_at desc,id desc);
create index restaurant_comments_author_idx on public.restaurant_comments(user_id);
create table public.restaurant_votes (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  round integer not null check(round>0),
  user_id uuid not null references auth.users(id) on delete cascade,
  choice text not null check(choice in ('up','keep','down')),
  updated_at timestamptz not null default now(),
  primary key(restaurant_id,round,user_id)
);
create index restaurant_votes_user_idx on public.restaurant_votes(user_id);
alter table public.restaurant_comments enable row level security;
alter table public.restaurant_votes enable row level security;
revoke all on public.restaurant_comments,public.restaurant_votes from public,anon,authenticated;
grant select,delete on public.restaurant_comments to authenticated;
grant insert(restaurant_id,user_id,body) on public.restaurant_comments to authenticated;
grant update(body) on public.restaurant_comments to authenticated;
grant select on public.restaurant_votes to authenticated;
create policy "Group members read comments" on public.restaurant_comments for select to authenticated using(exists(select 1 from public.restaurants r where r.id=restaurant_comments.restaurant_id));
create policy "Group members write own comments" on public.restaurant_comments for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.restaurants r where r.id=restaurant_comments.restaurant_id));
create policy "Authors edit own comments" on public.restaurant_comments for update to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.restaurants r where r.id=restaurant_comments.restaurant_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.restaurants r where r.id=restaurant_comments.restaurant_id));
create policy "Authors delete own comments" on public.restaurant_comments for delete to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.restaurants r where r.id=restaurant_comments.restaurant_id));
create policy "Group members read votes" on public.restaurant_votes for select to authenticated using(exists(select 1 from public.restaurants r where r.id=restaurant_votes.restaurant_id));
create trigger set_comment_updated_at before update on public.restaurant_comments for each row execute function private.set_updated_at();

-- Membership changes and votes share the same group lock before restaurant locks.
create function private.lock_catalog_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform 1 from public.catalog_groups where id=old.group_id for update;
    return old;
  end if;
  perform 1 from public.catalog_groups where id=new.group_id for update;
  return new;
end $$;
revoke all on function private.lock_catalog_membership() from public,anon,authenticated;
create trigger lock_catalog_membership before insert or delete on public.catalog_group_members for each row execute function private.lock_catalog_membership();

create function private.cast_restaurant_vote(p_restaurant_id uuid,p_round integer,p_choice text) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=private.require_catalog_user(); r public.restaurants%rowtype;
  v_group uuid; v_total integer; v_up integer; v_down integer; v_next integer; v_outcome text:='pending';
begin
  if p_choice is null or p_choice not in ('up','keep','down') then raise exception 'invalid_vote'; end if;
  select group_id into v_group from public.restaurants where id=p_restaurant_id;
  if v_group is null or not private.is_catalog_member(v_group) then raise exception 'restaurant_unavailable'; end if;
  perform 1 from public.catalog_groups where id=v_group for update;
  select * into r from public.restaurants where id=p_restaurant_id for update;
  if not found then raise exception 'restaurant_unavailable'; end if;
  if not private.is_catalog_member(r.group_id) then raise exception 'restaurant_unavailable'; end if;
  if r.created_by=v_uid then raise exception 'registrant_cannot_vote' using errcode='42501'; end if;
  if p_round is null or p_round<>r.vote_round then raise exception 'vote_round_changed'; end if;
  if r.rating=3 and p_choice='up' then raise exception 'already_gold'; end if;
  insert into public.restaurant_votes(restaurant_id,round,user_id,choice) values(r.id,r.vote_round,v_uid,p_choice)
    on conflict(restaurant_id,round,user_id) do update set choice=excluded.choice,updated_at=now();
  select count(*) into v_total from public.catalog_group_members where group_id=r.group_id and user_id<>r.created_by;
  select count(*) filter(where v.choice='up'),count(*) filter(where v.choice='down') into v_up,v_down
    from public.restaurant_votes v join public.catalog_group_members m on m.group_id=r.group_id and m.user_id=v.user_id
    where v.restaurant_id=r.id and v.round=r.vote_round and v.user_id<>r.created_by;
  if v_up>v_total/2 then v_outcome:='up'; elsif v_down>v_total/2 then v_outcome:='down'; end if;
  if v_outcome='down' and r.rating=1 then
    delete from public.restaurants where id=r.id;
    return jsonb_build_object('outcome','deleted','restaurant_id',r.id,'group_id',r.group_id);
  elsif v_outcome<>'pending' then
    v_next:=r.rating+case when v_outcome='up' then 1 else -1 end;
    update public.restaurants set rating=v_next,vote_round=vote_round+1 where id=r.id;
    delete from public.restaurant_votes where restaurant_id=r.id;
    return jsonb_build_object('outcome',v_outcome,'rating',v_next,'round',r.vote_round+1,'restaurant_id',r.id);
  end if;
  return jsonb_build_object('outcome','pending','rating',r.rating,'round',r.vote_round,'restaurant_id',r.id);
end $$;
revoke all on function private.cast_restaurant_vote(uuid,integer,text) from public,anon;
grant execute on function private.cast_restaurant_vote(uuid,integer,text) to authenticated;
create function public.cast_restaurant_vote(p_restaurant_id uuid,p_round integer,p_choice text) returns jsonb language sql security invoker set search_path='' as $$ select private.cast_restaurant_vote(p_restaurant_id,p_round,p_choice); $$;
revoke all on function public.cast_restaurant_vote(uuid,integer,text) from public,anon;
grant execute on function public.cast_restaurant_vote(uuid,integer,text) to authenticated;

create function private.restaurant_discussion(p_restaurant_id uuid,p_before timestamptz,p_before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_catalog_user(); r public.restaurants%rowtype; v_total integer; v_comments jsonb; v_counts jsonb; v_mine text; v_count integer;
begin
  select * into r from public.restaurants where id=p_restaurant_id and private.is_catalog_member(group_id) for share;
  if not found or not private.is_catalog_member(r.group_id) then raise exception 'restaurant_unavailable'; end if;
  select count(*) into v_total from public.catalog_group_members where group_id=r.group_id and user_id<>r.created_by;
  select jsonb_build_object('up',count(*) filter(where v.choice='up'),'keep',count(*) filter(where v.choice='keep'),'down',count(*) filter(where v.choice='down')) into v_counts
    from public.restaurant_votes v join public.catalog_group_members m on m.group_id=r.group_id and m.user_id=v.user_id
    where v.restaurant_id=r.id and v.round=r.vote_round and v.user_id<>r.created_by;
  select choice into v_mine from public.restaurant_votes where restaurant_id=r.id and round=r.vote_round and user_id=v_uid;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc),'[]'::jsonb) into v_comments from (
    select c.id,c.user_id,c.body,c.created_at,c.updated_at,coalesce(p.nickname,'까탈리스트') nickname from public.restaurant_comments c left join public.profiles p on p.id=c.user_id
    where c.restaurant_id=r.id and (p_before is null or (c.created_at,c.id)<(p_before,p_before_id)) order by c.created_at desc,c.id desc limit 21
  ) c;
  select count(*) into v_count from public.restaurant_comments where restaurant_id=r.id;
  return jsonb_build_object('rating',r.rating,'round',r.vote_round,'eligible',v_total,'required',v_total/2+1,'can_vote',v_uid<>r.created_by,'mine',v_mine,'votes',v_counts,'comment_count',v_count,'comments',v_comments);
end $$;
revoke all on function private.restaurant_discussion(uuid,timestamptz,uuid) from public,anon;
grant execute on function private.restaurant_discussion(uuid,timestamptz,uuid) to authenticated;
create function public.restaurant_discussion(p_restaurant_id uuid,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.restaurant_discussion(p_restaurant_id,p_before,p_before_id); $$;
revoke all on function public.restaurant_discussion(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.restaurant_discussion(uuid,timestamptz,uuid) to authenticated;

-- File deletion uses the Storage API. A durable outbox retries network failures.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table private.restaurant_photo_cleanup (
  id uuid primary key default gen_random_uuid(),
  token text not null default encode(extensions.gen_random_bytes(24),'hex'),
  restaurant_id uuid not null,
  paths text[] not null,
  attempts integer not null default 0,
  lease_until timestamptz not null default '-infinity',
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table private.restaurant_photo_cleanup enable row level security;
revoke all on private.restaurant_photo_cleanup from public,anon,authenticated;
create index restaurant_photo_cleanup_ready_idx on private.restaurant_photo_cleanup(available_at);
create function private.dispatch_photo_cleanup() returns void language plpgsql security definer set search_path='' as $$
declare j record;
begin
  delete from cron.job_run_details where jobid=(select jobid from cron.job where jobname='ccatalog-photo-cleanup') and end_time<now()-interval '7 days';
  for j in select id,token from private.restaurant_photo_cleanup where available_at<=now() and lease_until<=now() order by available_at limit 20 loop
    perform net.http_post(url:='https://hyjkmfmkupegiabiwtld.supabase.co/functions/v1/catalog-photo-cleanup',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',j.id,'token',j.token),timeout_milliseconds:=10000);
  end loop;
end $$;
revoke all on function private.dispatch_photo_cleanup() from public,anon,authenticated;
create function private.enqueue_restaurant_photo_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
declare v_paths text[]; v_id uuid; v_token text;
begin
  select array_agg(path) into v_paths from (
    select storage_path path from public.restaurant_photos where restaurant_id=old.id
    union select name from storage.objects where bucket_id='restaurant-photos' and split_part(name,'/',1)=old.id::text
  ) p;
  if coalesce(cardinality(v_paths),0)>0 then
    insert into private.restaurant_photo_cleanup(restaurant_id,paths) values(old.id,v_paths) returning id,token into v_id,v_token;
    begin
      perform net.http_post(url:='https://hyjkmfmkupegiabiwtld.supabase.co/functions/v1/catalog-photo-cleanup',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',v_id,'token',v_token),timeout_milliseconds:=10000);
    exception when others then null; -- The committed outbox is retried by Cron.
    end;
  end if;
  return old;
end $$;
revoke all on function private.enqueue_restaurant_photo_cleanup() from public,anon,authenticated;
create trigger enqueue_restaurant_photo_cleanup before delete on public.restaurants for each row execute function private.enqueue_restaurant_photo_cleanup();
create function public.claim_catalog_photo_cleanup(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.restaurant_photo_cleanup%rowtype;
begin
  update private.restaurant_photo_cleanup set attempts=attempts+1,lease_until=now()+interval '2 minutes',available_at=now()+least(attempts+1,60)*interval '1 minute'
    where id=p_id and token=p_token and lease_until<=now() returning * into j;
  if not found then return null; end if;
  return jsonb_build_object('restaurant_id',j.restaurant_id,'paths',j.paths);
end $$;
create function public.complete_catalog_photo_cleanup(p_id uuid,p_token text) returns void language sql security definer set search_path='' as $$ delete from private.restaurant_photo_cleanup where id=p_id and token=p_token; $$;
revoke all on function public.claim_catalog_photo_cleanup(uuid,text),public.complete_catalog_photo_cleanup(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_catalog_photo_cleanup(uuid,text),public.complete_catalog_photo_cleanup(uuid,text) to service_role;
select cron.schedule('ccatalog-photo-cleanup','* * * * *','select private.dispatch_photo_cleanup()');
