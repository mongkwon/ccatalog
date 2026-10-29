revoke insert on public.restaurants from authenticated;
grant insert(id,group_id,created_by,name,category,rating,area,lat,lng,menus,menu_items,delivery_apps,memo) on public.restaurants to authenticated;

-- Keep an upload's metadata transaction ahead of restaurant deletion.
create function private.can_upload_catalog_photo(p_path text) returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_found boolean;
begin
  begin v_id:=split_part(p_path,'/',1)::uuid; exception when invalid_text_representation then return false; end;
  select true into v_found from public.restaurants where id=v_id and created_by=(select auth.uid()) and private.is_catalog_member(group_id) for key share;
  return coalesce(v_found,false);
end $$;
revoke all on function private.can_upload_catalog_photo(text) from public,anon;
grant execute on function private.can_upload_catalog_photo(text) to authenticated;
drop policy "Authors upload group photos" on storage.objects;
create policy "Authors upload group photos" on storage.objects for insert to authenticated with check(bucket_id='restaurant-photos' and storage.extension(objects.name)='jpg' and private.can_upload_catalog_photo(objects.name));
