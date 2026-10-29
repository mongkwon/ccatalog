-- Authors choose the medal. Member votes are advisory and never mutate it.
grant update(rating) on public.restaurants to authenticated;
create function private.reset_votes_on_medal_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.rating is distinct from old.rating then
    new.vote_round:=old.vote_round+1;
    delete from public.restaurant_votes where restaurant_id=old.id;
  else
    new.vote_round:=old.vote_round;
  end if;
  return new;
end $$;
revoke all on function private.reset_votes_on_medal_change() from public,anon,authenticated;
create trigger reset_votes_on_medal_change before update on public.restaurants for each row execute function private.reset_votes_on_medal_change();

create or replace function private.cast_restaurant_vote(p_restaurant_id uuid,p_round integer,p_choice text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_catalog_user(); r public.restaurants%rowtype;
begin
  if p_choice is null or p_choice not in ('up','keep','down') then raise exception 'invalid_vote'; end if;
  select * into r from public.restaurants where id=p_restaurant_id and private.is_catalog_member(group_id) for update;
  if not found then raise exception 'restaurant_unavailable'; end if;
  if r.created_by=v_uid then raise exception 'registrant_cannot_vote' using errcode='42501'; end if;
  if p_round is null or p_round<>r.vote_round then raise exception 'vote_round_changed'; end if;
  insert into public.restaurant_votes(restaurant_id,round,user_id,choice) values(r.id,r.vote_round,v_uid,p_choice)
    on conflict(restaurant_id,round,user_id) do update set choice=excluded.choice,updated_at=now();
  return jsonb_build_object('outcome','pending','rating',r.rating,'round',r.vote_round,'restaurant_id',r.id);
end $$;

drop trigger lock_catalog_membership on public.catalog_group_members;
drop function private.lock_catalog_membership();

create or replace function private.restaurant_discussion(p_restaurant_id uuid,p_before timestamptz,p_before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_catalog_user(); r public.restaurants%rowtype; v_total integer; v_comments jsonb; v_counts jsonb; v_mine text; v_count integer;
begin
  select * into r from public.restaurants where id=p_restaurant_id and private.is_catalog_member(group_id) for share;
  if not found then raise exception 'restaurant_unavailable'; end if;
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
  return jsonb_build_object('rating',r.rating,'round',r.vote_round,'eligible',v_total,'can_vote',v_uid<>r.created_by,'mine',v_mine,'votes',v_counts,'comment_count',v_count,'comments',v_comments);
end $$;
