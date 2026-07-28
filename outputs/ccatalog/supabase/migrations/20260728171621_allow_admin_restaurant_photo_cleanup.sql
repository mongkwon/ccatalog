create index restaurant_photos_created_by_idx
on public.restaurant_photos (created_by);

create policy "Admins can inspect restaurant photo objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'restaurant-photos'
  and exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);
