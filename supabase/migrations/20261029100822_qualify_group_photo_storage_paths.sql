-- Qualify the storage path to avoid binding to restaurants.name in subqueries.
drop policy "Members read group photo objects" on storage.objects;
drop policy "Authors upload group photos" on storage.objects;
drop policy "Authors delete group photo objects" on storage.objects;
create policy "Members read group photo objects" on storage.objects for select to authenticated using (bucket_id='restaurant-photos' and exists(select 1 from public.restaurants r where r.id::text=split_part(objects.name,'/',1)));
create policy "Authors upload group photos" on storage.objects for insert to authenticated with check (bucket_id='restaurant-photos' and storage.extension(objects.name)='jpg' and exists(select 1 from public.restaurants r where r.id::text=split_part(objects.name,'/',1) and r.created_by=(select auth.uid())));
create policy "Authors delete group photo objects" on storage.objects for delete to authenticated using (bucket_id='restaurant-photos' and exists(select 1 from public.restaurants r where r.id::text=split_part(objects.name,'/',1) and r.created_by=(select auth.uid())));
