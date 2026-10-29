-- Run as postgres. All fixture users, memberships, objects and records roll back.
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  g uuid; another_group uuid; r uuid := gen_random_uuid(); invitation text; affected integer;
begin
  insert into auth.users(id,is_anonymous,raw_user_meta_data) values (a,false,'{}'),(b,false,'{}'),(outsider,false,'{}');
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('role','authenticated',true);
  g := public.create_catalog_group('권한 테스트','#5285bc');
  invitation := public.create_catalog_invite(g);
  insert into public.restaurants(id,group_id,created_by,name,category,rating,area,lat,lng,menus,menu_items,delivery_apps,memo)
  values(r,g,a,'테스트 식당','한식',2,'서울',37.5,127,'{}','[]','{}','');
  update public.restaurants set memo='작성자 수정' where id=r;
  if (select memo from public.restaurants where id=r) <> '작성자 수정' then raise exception 'author update failed'; end if;
  begin update public.restaurants set rating=3 where id=r; raise exception 'medal change allowed'; exception when insufficient_privilege then null; end;
  begin update public.restaurants set created_by=b where id=r; raise exception 'author transfer allowed'; exception when insufficient_privilege then null; end;
  insert into public.restaurant_photos(restaurant_id,storage_path,created_by,sort_order) values(r,r::text||'/test.jpg',a,0);
  insert into storage.objects(bucket_id,name) values('restaurant-photos',r::text||'/test.jpg');

  perform set_config('request.jwt.claim.sub',b::text,true);
  if (select count(*) from public.restaurants) <> 0 then raise exception 'nonmember can read restaurants'; end if;
  if (select count(*) from public.restaurant_photos) <> 0 then raise exception 'nonmember can read photos'; end if;
  if exists(select 1 from storage.objects where bucket_id='restaurant-photos') then raise exception 'nonmember can read storage'; end if;
  begin perform public.create_catalog_invite(g); raise exception 'nonmember issued invite'; exception when insufficient_privilege then null; end;
  begin insert into public.restaurants(group_id,created_by,name,category,rating,area,lat,lng) values(g,b,'침입','한식',1,'서울',37.5,127); raise exception 'nonmember inserted restaurant'; exception when insufficient_privilege then null; end;
  perform public.join_catalog_group(invitation);
  perform public.join_catalog_group(invitation);
  if (select count(*) from public.catalog_group_members where group_id=g) <> 2 then raise exception 'join is not idempotent'; end if;
  if (select count(*) from public.restaurants where id=r) <> 1 then raise exception 'member cannot read'; end if;
  if (select count(*) from public.restaurant_photos where restaurant_id=r) <> 1 then raise exception 'member cannot read photo'; end if;
  if not exists(select 1 from storage.objects where name=r::text||'/test.jpg') then raise exception 'member cannot read storage'; end if;
  update public.restaurants set memo='다른 회원 수정' where id=r; get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'member changed another author record'; end if;
  delete from public.restaurants where id=r; get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'member deleted another author record'; end if;
  begin insert into public.restaurant_photos(restaurant_id,storage_path,created_by,sort_order) values(r,r::text||'/unauthorized.jpg',b,1); raise exception 'nonowner photo inserted'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values('restaurant-photos',r::text||'/unauthorized.jpg'); raise exception 'nonowner upload allowed'; exception when insufficient_privilege then null; end;
  another_group := public.create_catalog_group('다른 그룹','#b87981');
  insert into public.restaurants(group_id,created_by,name,category,rating,area,lat,lng) values(another_group,b,'테스트 식당','한식',1,'서울',37.5,127);
  begin insert into public.restaurants(group_id,created_by,name,category,rating,area,lat,lng) values(another_group,b,'테스트 식당','한식',3,'서울',37.5,127); raise exception 'duplicate overwrote initial medal'; exception when unique_violation then null; end;

  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if (select count(*) from public.catalog_groups) <> 0 then raise exception 'uninvited user sees groups'; end if;
  if (select count(*) from public.restaurants) <> 0 then raise exception 'uninvited user sees restaurants'; end if;
  perform set_config('role','anon',true);
  begin perform public.create_catalog_group('익명','#5285bc'); raise exception 'guest created group'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.restaurants; raise exception 'guest has table access'; exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.review_restaurant_proposal(uuid,text)','EXECUTE') then raise exception 'retired admin RPC exposed'; end if;
  perform set_config('role','postgres',true);
  if (select public from storage.buckets where id='restaurant-photos') then raise exception 'public photo bucket'; end if;
end $$;
select 'group RLS, author access, private storage, invitations and medal protection passed' as result;
rollback;
