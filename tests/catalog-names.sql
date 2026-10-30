-- Fixture accounts, changes and Realtime messages are all rolled back.
begin;
do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  g uuid; invitation text; result jsonb; changed integer;
begin
  insert into auth.users(id,is_anonymous,raw_user_meta_data) values(a,false,'{}'),(b,false,'{}'),(outsider,false,'{}');
  perform set_config('request.jwt.claim.sub',a::text,true); perform set_config('role','authenticated',true);
  g:=public.create_catalog_group('이름 수정 테스트','#5285bc'); invitation:=public.create_catalog_invite(g);
  update public.profiles set nickname='새 닉네임' where id=a;
  if (select nickname from public.profiles where id=a)<>'새 닉네임' then raise exception 'nickname update failed'; end if;
  begin update public.profiles set nickname='  ' where id=a; raise exception 'blank nickname accepted'; exception when check_violation then null; end;
  begin update public.profiles set nickname=repeat('가',31) where id=a; raise exception 'long nickname accepted'; exception when check_violation then null; end;
  begin update public.profiles set is_catalist=true where id=a; raise exception 'privileged profile update allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',b::text,true); perform public.join_catalog_group(invitation);
  update public.catalog_groups set name='함께 수정한 이름' where id=g;
  if (select name from public.catalog_groups where id=g)<>'함께 수정한 이름' then raise exception 'ordinary member cannot rename'; end if;
  begin update public.catalog_groups set color='#000000' where id=g; raise exception 'color update allowed'; exception when insufficient_privilege then null; end;
  begin update public.catalog_groups set name=repeat('가',41) where id=g; raise exception 'long group name accepted'; exception when check_violation then null; end;
  begin update public.catalog_groups set name=' ' where id=g; raise exception 'blank group name accepted'; exception when check_violation then null; end;
  update public.profiles set nickname='타인 수정' where id=a; get diagnostics changed=row_count;
  if changed<>0 then raise exception 'other profile changed'; end if;
  if exists(select 1 from public.profiles where id=a) then raise exception 'private profile exposed'; end if;
  result:=public.catalog_name_context(g);
  if result->'group'->>'name'<>'함께 수정한 이름' or not exists(select 1 from jsonb_array_elements(result->'members') m where m->>'id'=a::text and m->>'nickname'='새 닉네임') then raise exception 'shared names unavailable'; end if;
  if exists(select 1 from jsonb_array_elements(result->'members') m where m ? 'avatar_url' or m ? 'is_catalist') then raise exception 'private profile fields leaked'; end if;
  perform set_config('realtime.topic','catalog-group:'||g::text,true);
  if not exists(select 1 from realtime.messages where topic='catalog-group:'||g::text) then raise exception 'member cannot receive name invalidation'; end if;
  if exists(select 1 from realtime.messages where topic='catalog-group:'||g::text and (payload-'id')<>'{}'::jsonb) then raise exception 'name data leaked in broadcast'; end if;
  begin insert into realtime.messages(topic,extension,event,payload,private) values('catalog-group:'||g::text,'broadcast','catalog_names','{}',true); raise exception 'client forged invalidation'; exception when insufficient_privilege then null; end;
  perform public.leave_catalog_group(g);
  begin perform public.catalog_name_context(g); raise exception 'departed member read shared names'; exception when insufficient_privilege then null; end;
  if exists(select 1 from realtime.messages where topic='catalog-group:'||g::text) then raise exception 'departed member can receive channel'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  update public.catalog_groups set name='침입' where id=g; get diagnostics changed=row_count;
  if changed<>0 then raise exception 'outsider renamed group'; end if;
  begin perform public.catalog_name_context(g); raise exception 'outsider read shared names'; exception when insufficient_privilege then null; end;
  result:=public.catalog_name_context(null);
  if result->'profile'->>'id'<>outsider::text or result ? 'members' then raise exception 'own context scope incorrect'; end if;
  perform set_config('role','anon',true);
  begin perform public.catalog_name_context(g); raise exception 'guest read shared names'; exception when insufficient_privilege then null; end;
  perform set_config('role','postgres',true);
end $$;
select 'nickname and group editing, column restrictions, private realtime, current membership and profile privacy passed' result;
rollback;
